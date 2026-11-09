import { createApiRouter } from './api-router.js';
import { sendJson } from './http.js';
import { createRateLimiter } from './rate-limit.js';
import { createSessionService } from './session.js';

export function createApiHandler({ repository, secure = true, database = 'postgresql' }) {
    const sessions = createSessionService(repository, { secure });
    const routeApi = createApiRouter({ repository, sessions, rateLimited: createRateLimiter(), database });

    return async function handleApi(req, res) {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        try {
            await routeApi(req, res, url);
        } catch (error) {
            console.error(error);
            if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : 'Internal server error.' });
            else res.end();
        }
    };
}
