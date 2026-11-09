import { readJson, sendJson, validText } from '../http.js';

export async function handleStudyNoteRoutes(req, res, url, context) {
    const { repository, user, headers } = context;
    if (url.pathname === '/api/study-notes' && req.method === 'GET') {
        const subjectId = url.searchParams.get('subjectId');
        if (!validText(subjectId, 128)) sendJson(res, 400, { error: 'A valid subjectId is required.' }, headers);
        else sendJson(res, 200, { notes: await repository.listStudyNotes(user.id, subjectId) }, headers);
        return true;
    }
    const match = url.pathname.match(/^\/api\/study-notes\/([^/]+)(?:\/(publish))?$/);
    if (!match) return false;
    const noteId = decodeURIComponent(match[1]);
    if (req.method === 'POST' && match[2] === 'publish') {
        const note = await repository.publishStudyNote(user.id, noteId);
        sendJson(res, note ? 200 : 404, note ? { note } : { error: 'Study note not found.' }, headers);
        return true;
    }
    if (req.method === 'PATCH' && !match[2]) {
        const body = await readJson(req, 200_000);
        const validSections = Array.isArray(body.sections) && body.sections.length <= 50 && body.sections.every(section => validText(section.id, 128) && validText(section.title, 180) && validText(section.content, 12_000));
        if (!validText(body.title, 180) || !validText(body.summary, 1000) || !validSections) {
            sendJson(res, 400, { error: 'A valid title, summary and sections are required.' }, headers);
            return true;
        }
        const note = await repository.updateStudyNote(user.id, noteId, body);
        sendJson(res, note ? 200 : 409, note ? { note } : { error: 'Only an existing draft note can be edited.' }, headers);
        return true;
    }
    return false;
}
