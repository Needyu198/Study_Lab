import { sendJson } from './http.js';
import { handleChatRoute } from './routes/chat.js';
import { handleConversationRoutes } from './routes/conversations.js';
import { handleLessonRoutes } from './routes/lessons.js';
import { handleResourceRoutes } from './routes/resources.js';
import { handleStudyNoteRoutes } from './routes/study-notes.js';

export function createApiRouter({ repository, sessions, rateLimited, database = 'sqlite' }) {
    return async function routeApi(req, res, url) {
        if (url.pathname === '/api/health' && req.method === 'GET') {
            sendJson(res, 200, { status: 'ok', database });
            return;
        }

        const { user, cookie } = await sessions.resolve(req);
        const context = { repository, user, rateLimited, headers: cookie ? { 'Set-Cookie': cookie } : {} };

        if (url.pathname === '/api/session' && req.method === 'GET') {
            sendJson(res, 200, { user }, context.headers);
            return;
        }

        if (await handleConversationRoutes(req, res, url, context)) return;
        if (await handleResourceRoutes(req, res, url, context)) return;
        if (await handleStudyNoteRoutes(req, res, url, context)) return;
        if (await handleLessonRoutes(req, res, url, context)) return;
        if (await handleChatRoute(req, res, url, context)) return;
        sendJson(res, 404, { error: 'API route not found.' }, context.headers);
    };
}
