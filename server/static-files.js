import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { sendJson } from './http.js';

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.gz': 'application/gzip'
};

export function createStaticFileHandler(distDirectory) {
    const indexFile = resolve(distDirectory, 'index.html');
    return async function serveStatic(res, pathname) {
        const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
        let filename = resolve(distDirectory, relative);
        if (!filename.startsWith(`${distDirectory}${sep}`) && filename !== indexFile)
            return sendJson(res, 403, { error: 'Forbidden.' });
        try {
            if (!(await stat(filename)).isFile()) throw new Error('Not a file');
        } catch {
            filename = indexFile;
        }
        try {
            const content = await readFile(filename);
            res.writeHead(200, {
                'Content-Type': mimeTypes[extname(filename)] || 'application/octet-stream',
                'Cache-Control': filename === indexFile ? 'no-cache' : 'public, max-age=31536000, immutable'
            });
            res.end(content);
        } catch {
            sendJson(res, 503, { error: 'Frontend build not found. Run npm run build first.' });
        }
    };
}
