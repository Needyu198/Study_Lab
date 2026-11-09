import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { importLessonBuffer, importLessonFile } from './lesson-import.js';

function safeSegment(value) {
    return String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
}

function typeFor(filename) {
    const extension = extname(filename).toLowerCase();
    if (extension === '.pdf') return 'book';
    if (extension === '.pptx') return 'powerpoint';
    return 'document';
}

async function createResourceAndNote(repository, { userId, subjectId, filename, mimeType, storedPath, imported }) {
    const resourceId = `resource-${randomUUID()}`;
    const chunks = imported.lesson.sections.map((section, index) => ({
        id: `chunk-${randomUUID()}`,
        heading: section.title,
        content: section.text,
        locationLabel: section.title.match(/^(Page|Slide)\s+\d+/i)?.[0] || `Section ${index + 1}`
    }));
    return repository.createResourceAndNote({
        resource: {
            id: resourceId,
            userId,
            subjectId,
            filename,
            storedPath,
            resourceType: typeFor(filename),
            mimeType,
            byteSize: imported.buffer.length
        },
        chunks,
        note: {
            id: `note-${randomUUID()}`,
            title: imported.lesson.title,
            summary: imported.lesson.description
        }
    });
}

export async function storeResourceAndCreateNote(repository, { userId, subjectId, filename, mimeType, base64 }) {
    const imported = await importLessonFile(filename, base64);
    const directory = join(config.uploadsDirectory, safeSegment(userId), safeSegment(subjectId), `resource-${randomUUID()}`);
    const storedPath = join(directory, safeSegment(filename));
    await mkdir(directory, { recursive: true });
    await writeFile(storedPath, imported.buffer, { flag: 'wx' });
    try {
        return await createResourceAndNote(repository, { userId, subjectId, filename, mimeType, storedPath, imported });
    } catch (error) {
        await unlink(storedPath).catch(() => {});
        throw error;
    }
}

export async function processBlobResource(repository, { userId, subjectId, filename, mimeType, blobUrl, byteSize }) {
    const { get } = await import('@vercel/blob');
    const result = await get(blobUrl, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) throw new Error('The uploaded resource could not be found.');
    if (!result.blob.pathname.startsWith(`resources/${safeSegment(userId)}/${safeSegment(subjectId)}/`)) throw new Error('The uploaded resource does not belong to this subject.');
    if (result.blob.size > 50 * 1024 * 1024 || byteSize > 50 * 1024 * 1024) throw new Error('The resource is larger than the 50 MB limit.');
    const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
    const imported = await importLessonBuffer(filename, buffer);
    return createResourceAndNote(repository, {
        userId,
        subjectId,
        filename,
        mimeType: result.blob.contentType || mimeType,
        storedPath: result.blob.pathname,
        imported
    });
}
