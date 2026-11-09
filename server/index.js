import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalReply } from '../src/lib/chat-service.js';
import { topics } from '../src/content.js';
import { createGuestSession, deleteConversation, insertMessage, listConversations, openDatabase, ownedConversation, updateMessage, upsertConversation, userForSession } from './database.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDirectory = resolve(__dirname, '../dist');
const db = openDatabase();
const port = Number(process.env.PORT || 3001);
const rateBuckets = new Map();

const mimeTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.gz': 'application/gzip' };

function json(res, status, body, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(JSON.stringify(body));
}

function parseCookies(value = '') {
    return Object.fromEntries(value.split(';').map(item => item.trim().split('=').map(decodeURIComponent)).filter(item => item.length === 2));
}

function hash(value) {
    return createHash('sha256').update(value).digest('hex');
}

function sessionFor(req) {
    const token = parseCookies(req.headers.cookie).study_lab_session;
    let user = token ? userForSession(db, hash(token)) : null;
    if (user) return { user, cookie: null };
    const nextToken = randomBytes(32).toString('base64url');
    const created = createGuestSession(db, hash(nextToken));
    user = { id: created.userId, name: 'Study Lab guest' };
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return { user, cookie: `study_lab_session=${nextToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}` };
}

async function readJson(req, maximum = 20000) {
    let body = '';
    for await (const chunk of req) {
        body += chunk;
        if (body.length > maximum) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    }
    try { return JSON.parse(body || '{}'); }
    catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

function validText(value, maximum) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function rateLimited(userId) {
    const now = Date.now();
    const recent = (rateBuckets.get(userId) || []).filter(time => now - time < 60000);
    recent.push(now);
    rateBuckets.set(userId, recent);
    return recent.length > 20;
}

async function handleApi(req, res, url) {
    if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { status: 'ok', database: 'sqlite' });
    const { user, cookie } = sessionFor(req);
    const headers = cookie ? { 'Set-Cookie': cookie } : {};

    if (url.pathname === '/api/session' && req.method === 'GET') return json(res, 200, { user }, headers);

    if (url.pathname === '/api/conversations' && req.method === 'GET') {
        const subjectId = url.searchParams.get('subjectId');
        if (!validText(subjectId, 128)) return json(res, 400, { error: 'A valid subjectId is required.' }, headers);
        return json(res, 200, { conversations: listConversations(db, user.id, subjectId) }, headers);
    }

    if (url.pathname === '/api/conversations' && req.method === 'POST') {
        const body = await readJson(req);
        if (!validText(body.id, 128) || !validText(body.subjectId, 128) || !validText(body.title, 150))
            return json(res, 400, { error: 'id, subjectId and title are required.' }, headers);
        const conversation = upsertConversation(db, { id: body.id, userId: user.id, subjectId: body.subjectId, title: body.title });
        if (!conversation) return json(res, 409, { error: 'Conversation ID is already in use.' }, headers);
        if (Array.isArray(body.messages) && body.messages.length <= 200) {
            for (const message of body.messages) {
                if (validText(message.id, 128) && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string' && message.content.length <= 20000) {
                    const status = ['streaming', 'complete', 'failed', 'stopped'].includes(message.status) ? message.status : 'complete';
                    insertMessage(db, { ...message, conversationId: conversation.id, status });
                }
            }
        }
        return json(res, 201, { conversation: { ...conversation, messages: [] } }, headers);
    }

    const deleteMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
        const deleted = deleteConversation(db, decodeURIComponent(deleteMatch[1]), user.id);
        return deleted ? json(res, 200, { deleted: true }, headers) : json(res, 404, { error: 'Conversation not found.' }, headers);
    }

    if (url.pathname === '/api/chat' && req.method === 'POST') {
        if (rateLimited(user.id)) return json(res, 429, { error: 'Too many messages. Please wait a minute.' }, headers);
        const body = await readJson(req);
        if (!validText(body.content, 4000) || !validText(body.subjectId, 128) || !validText(body.conversationId, 128))
            return json(res, 400, { error: 'content, subjectId and conversationId are required.' }, headers);
        const title = validText(body.title, 150) ? body.title : body.content.trim().slice(0, 150);
        const conversation = upsertConversation(db, { id: body.conversationId, userId: user.id, subjectId: body.subjectId, title });
        if (!conversation || conversation.subjectId !== body.subjectId) return json(res, 403, { error: 'Conversation access denied.' }, headers);

        const userMessageId = validText(body.userMessageId, 128) ? body.userMessageId : `message-${randomUUID()}`;
        const assistantMessageId = validText(body.assistantMessageId, 128) ? body.assistantMessageId : `message-${randomUUID()}`;
        const now = new Date().toISOString();
        insertMessage(db, { id: userMessageId, conversationId: conversation.id, role: 'user', content: body.content.trim(), status: 'complete', createdAt: now });
        insertMessage(db, { id: assistantMessageId, conversationId: conversation.id, role: 'assistant', content: '', status: 'streaming', createdAt: now });

        const courseTopics = body.subjectId === 'programming-languages' ? topics : [];
        const reply = createLocalReply(body.content, body.subjectName || body.subjectId, courseTopics);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
        let sent = '';
        let completed = false;
        res.on('close', () => {
            if (!completed) updateMessage(db, assistantMessageId, conversation.id, sent || 'Response stopped.', 'stopped');
        });
        for (const chunk of reply.match(/.{1,18}(?:\s|$)|\n/g) || [reply]) {
            if (res.destroyed) break;
            sent += chunk;
            res.write(chunk);
            await new Promise(resolveDelay => setTimeout(resolveDelay, 24));
        }
        if (!res.destroyed) {
            completed = true;
            updateMessage(db, assistantMessageId, conversation.id, sent, 'complete');
            res.end();
        }
        return;
    }

    return json(res, 404, { error: 'API route not found.' }, headers);
}

async function serveStatic(res, pathname) {
    let relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    let filename = resolve(distDirectory, relative);
    if (!filename.startsWith(`${distDirectory}${sep}`) && filename !== resolve(distDirectory, 'index.html')) return json(res, 403, { error: 'Forbidden.' });
    try {
        if (!(await stat(filename)).isFile()) throw new Error('Not a file');
    } catch {
        filename = resolve(distDirectory, 'index.html');
    }
    try {
        const content = await readFile(filename);
        res.writeHead(200, { 'Content-Type': mimeTypes[extname(filename)] || 'application/octet-stream', 'Cache-Control': filename.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
        res.end(content);
    } catch {
        json(res, 503, { error: 'Frontend build not found. Run npm run build first.' });
    }
}

export function createStudyServer() {
    return createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        try {
            if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
            else if (req.method === 'GET' || req.method === 'HEAD') await serveStatic(res, url.pathname);
            else json(res, 405, { error: 'Method not allowed.' });
        } catch (error) {
            console.error(error);
            if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Internal server error.' });
            else res.end();
        }
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    createStudyServer().listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Study Lab server: http://${process.env.HOST || '127.0.0.1'}:${port}`));
}
