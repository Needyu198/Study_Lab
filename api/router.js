import blobUpload from './blob-upload.js';
import { createApiHandler } from '../server/app.js';
import { createPostgresRepository } from '../server/postgres-repository.js';
import { restoreApiUrl } from '../server/vercel-path.js';

const repository = createPostgresRepository();
const handler = createApiHandler({ repository, secure: true, database: 'postgresql' });

export default async function routeApi(req, res) {
    req.url = restoreApiUrl(req);

    if (req.url.split('?')[0] === '/api/blob-upload') return blobUpload(req, res);
    return handler(req, res);
}
