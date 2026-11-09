import blobUpload from './blob-upload.js';
import { createApiHandler } from '../server/app.js';
import { createPostgresRepository } from '../server/postgres-repository.js';

const repository = createPostgresRepository();
const handler = createApiHandler({ repository, secure: true, database: 'postgresql' });

export default async function routeApi(req, res) {
    const incoming = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
    const queryPath = req.query?.path ?? incoming.searchParams.get('path') ?? '';
    const path = (Array.isArray(queryPath) ? queryPath.join('/') : String(queryPath)).replace(/^\/+/, '');
    incoming.searchParams.delete('path');
    const query = incoming.searchParams.toString();
    req.url = `/api/${path}${query ? `?${query}` : ''}`;

    if (req.url.split('?')[0] === '/api/blob-upload') return blobUpload(req, res);
    return handler(req, res);
}
