import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './api-router.js';
import { config } from './config.js';
import { openDatabase } from './database.js';
import { sendJson } from './http.js';
import { createRateLimiter } from './rate-limit.js';
import { createSessionService } from './session.js';
import { createStaticFileHandler } from './static-files.js';

export function createStudyServer(options = {}) {
    const db = options.db || openDatabase();
    const sessions = createSessionService(db, { secure: options.secure ?? config.production });
    const routeApi = createApiRouter({ db, sessions, rateLimited: createRateLimiter() });
    const serveStatic = createStaticFileHandler(options.distDirectory || config.distDirectory);

    return createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        try {
            if (url.pathname.startsWith('/api/')) await routeApi(req, res, url);
            else if (req.method === 'GET' || req.method === 'HEAD') await serveStatic(res, url.pathname);
            else sendJson(res, 405, { error: 'Method not allowed.' });
        } catch (error) {
            console.error(error);
            if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : 'Internal server error.' });
            else res.end();
        }
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    createStudyServer().listen(config.port, config.host, () => {
        console.log(`Study Lab server: http://${config.host}:${config.port}`);
    });
}
