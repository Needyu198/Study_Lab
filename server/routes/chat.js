import { randomUUID } from 'node:crypto';
import { createLocalReply } from '../../src/lib/chat-service.js';
import { topics } from '../../src/content.js';
import { insertMessage, listLessons, publishedNotesAsTopics, updateMessage, upsertConversation } from '../database.js';
import { readJson, sendJson, validText } from '../http.js';

export async function handleChatRoute(req, res, url, context) {
    if (url.pathname !== '/api/chat' || req.method !== 'POST') return false;
    const { db, user, headers, rateLimited } = context;
    if (rateLimited(user.id)) {
        sendJson(res, 429, { error: 'Too many messages. Please wait a minute.' }, headers);
        return true;
    }

    const body = await readJson(req);
    if (!validText(body.content, 4000) || !validText(body.subjectId, 128) || !validText(body.conversationId, 128)) {
        sendJson(res, 400, { error: 'content, subjectId and conversationId are required.' }, headers);
        return true;
    }

    const conversation = saveConversationAndMessages(db, user.id, body);
    if (!conversation || conversation.subjectId !== body.subjectId) {
        sendJson(res, 403, { error: 'Conversation access denied.' }, headers);
        return true;
    }

    const publishedNotes = publishedNotesAsTopics(db, user.id, body.subjectId);
    const legacyLessons = listLessons(db, user.id, body.subjectId);
    const courseTopics = publishedNotes.length
        ? publishedNotes
        : body.subjectId === 'programming-languages' ? [...topics, ...legacyLessons] : legacyLessons;
    const reply = createLocalReply(body.content, body.subjectName || body.subjectId, courseTopics);
    await streamReply(res, headers, conversation.id, body.assistantMessageId, reply, db);
    return true;
}

function saveConversationAndMessages(db, userId, body) {
    const title = validText(body.title, 150) ? body.title : body.content.trim().slice(0, 150);
    const conversation = upsertConversation(db, { id: body.conversationId, userId, subjectId: body.subjectId, title });
    if (!conversation || conversation.subjectId !== body.subjectId) return conversation;

    const now = new Date().toISOString();
    const userMessageId = validText(body.userMessageId, 128) ? body.userMessageId : `message-${randomUUID()}`;
    const assistantMessageId = validText(body.assistantMessageId, 128) ? body.assistantMessageId : `message-${randomUUID()}`;
    body.assistantMessageId = assistantMessageId;
    insertMessage(db, { id: userMessageId, conversationId: conversation.id, role: 'user', content: body.content.trim(), status: 'complete', createdAt: now });
    insertMessage(db, { id: assistantMessageId, conversationId: conversation.id, role: 'assistant', content: '', status: 'streaming', createdAt: now });
    return conversation;
}

async function streamReply(res, headers, conversationId, messageId, reply, db) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
    let sent = '';
    let completed = false;
    res.on('close', () => {
        if (!completed) updateMessage(db, messageId, conversationId, sent || 'Response stopped.', 'stopped');
    });
    for (const chunk of reply.match(/.{1,18}(?:\s|$)|\n/g) || [reply]) {
        if (res.destroyed) break;
        sent += chunk;
        res.write(chunk);
        await new Promise(resolve => setTimeout(resolve, 24));
    }
    if (!res.destroyed) {
        completed = true;
        updateMessage(db, messageId, conversationId, sent, 'complete');
        res.end();
    }
}
