import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';
import { createPostgresRepository } from '../server/postgres-repository.js';
import { createSessionService } from '../server/session.js';
import { readJson, sendJson, validText } from '../server/http.js';
import { acceptedLessonExtensions } from '../server/lesson-import.js';
import { extname } from 'node:path';

const repository = createPostgresRepository();
const sessions = createSessionService(repository, { secure: true });
const maximumSizeInBytes = 50 * 1024 * 1024;
const safeSegment = value => String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);

export default async function blobUpload(req, res) {
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed.' });
        return;
    }

    let sessionCookie = null;
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : await readJson(req, 20_000);
        const result = await handleUploadPresigned({
            request: req,
            body,
            getSignedToken: async (pathname, clientPayload) => {
                const payload = JSON.parse(clientPayload || '{}');
                if (!validText(payload.subjectId, 128) || !validText(payload.filename, 255)) throw new Error('Invalid upload details.');
                const extension = extname(payload.filename).toLowerCase();
                if (!acceptedLessonExtensions.includes(extension)) throw new Error(`Unsupported file type. Use ${acceptedLessonExtensions.join(', ')}.`);
                const { user, cookie } = await sessions.resolve(req);
                sessionCookie = cookie;
                const prefix = `resources/${safeSegment(user.id)}/${safeSegment(payload.subjectId)}/`;
                if (!pathname.startsWith(prefix) || !pathname.endsWith(extension)) throw new Error('The upload path does not match the resource.');
                const validUntil = Date.now() + 15 * 60 * 1000;
                return {
                    token: await issueSignedToken({ pathname, operations: ['put'], maximumSizeInBytes, validUntil }),
                    urlOptions: {
                        maximumSizeInBytes,
                        validUntil,
                        allowOverwrite: false,
                        tokenPayload: JSON.stringify({ userId: user.id, subjectId: payload.subjectId, filename: payload.filename })
                    }
                };
            },
            onUploadCompleted: async () => {}
        });
        sendJson(res, 200, result, sessionCookie ? { 'Set-Cookie': sessionCookie } : {});
    } catch (error) {
        console.error(error);
        sendJson(res, 400, { error: error.message || 'The upload could not be authorized.' }, sessionCookie ? { 'Set-Cookie': sessionCookie } : {});
    }
}
