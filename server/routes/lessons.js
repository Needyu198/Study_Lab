import { readJson, sendJson, validText } from '../http.js';
import { acceptedLessonExtensions, importLessonFile } from '../lesson-import.js';

export async function handleLessonRoutes(req, res, url, context) {
    const { repository, user, headers } = context;

    if (url.pathname === '/api/lessons' && req.method === 'GET') {
        const subjectId = url.searchParams.get('subjectId');
        if (!validText(subjectId, 128)) sendJson(res, 400, { error: 'A valid subjectId is required.' }, headers);
        else sendJson(res, 200, { lessons: await repository.listLessons(user.id, subjectId) }, headers);
        return true;
    }

    if (url.pathname !== '/api/lessons/import' || req.method !== 'POST') return false;

    const body = await readJson(req, 15_000_000);
    if (!validText(body.subjectId, 128) || !validText(body.filename, 255) || !validText(body.base64, 14_000_000)) {
        sendJson(res, 400, { error: 'subjectId, filename and file data are required.' }, headers);
        return true;
    }
    try {
        const imported = await importLessonFile(body.filename, body.base64);
        const lesson = await repository.createImportedLesson({
            userId: user.id,
            subjectId: body.subjectId,
            filename: body.filename,
            mimeType: String(body.mimeType || 'application/octet-stream').slice(0, 150),
            ...imported
        });
        sendJson(res, 201, { lesson }, headers);
    } catch (error) {
        sendJson(res, 400, { error: error.message, acceptedExtensions: acceptedLessonExtensions }, headers);
    }
    return true;
}
