import { listResources } from '../database.js';
import { readJson, sendJson, validText } from '../http.js';
import { acceptedLessonExtensions } from '../lesson-import.js';
import { storeResourceAndCreateNote } from '../resource-service.js';

export async function handleResourceRoutes(req, res, url, context) {
    const { db, user, headers } = context;
    if (url.pathname === '/api/resources' && req.method === 'GET') {
        const subjectId = url.searchParams.get('subjectId');
        if (!validText(subjectId, 128)) sendJson(res, 400, { error: 'A valid subjectId is required.' }, headers);
        else sendJson(res, 200, { resources: listResources(db, user.id, subjectId) }, headers);
        return true;
    }
    if (url.pathname !== '/api/resources/import' || req.method !== 'POST') return false;
    const body = await readJson(req, 15_000_000);
    if (!validText(body.subjectId, 128) || !validText(body.filename, 255) || !validText(body.base64, 14_000_000)) {
        sendJson(res, 400, { error: 'subjectId, filename and file data are required.' }, headers);
        return true;
    }
    try {
        const note = await storeResourceAndCreateNote(db, {
            userId: user.id,
            subjectId: body.subjectId,
            filename: body.filename,
            mimeType: String(body.mimeType || 'application/octet-stream').slice(0, 150),
            base64: body.base64
        });
        sendJson(res, 201, { note }, headers);
    } catch (error) {
        sendJson(res, 400, { error: error.message, acceptedExtensions: acceptedLessonExtensions }, headers);
    }
    return true;
}
