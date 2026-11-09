import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { createResourceAndNote } from './database.js';
import { importLessonFile } from './lesson-import.js';

function safeSegment(value) {
    return String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
}

function typeFor(filename) {
    const extension = extname(filename).toLowerCase();
    if (extension === '.pdf') return 'book';
    if (extension === '.pptx') return 'powerpoint';
    return 'document';
}

export async function storeResourceAndCreateNote(db, { userId, subjectId, filename, mimeType, base64 }) {
    const imported = await importLessonFile(filename, base64);
    const resourceId = `resource-${randomUUID()}`;
    const directory = join(config.uploadsDirectory, safeSegment(userId), safeSegment(subjectId), resourceId);
    const storedPath = join(directory, safeSegment(filename));
    await mkdir(directory, { recursive: true });
    await writeFile(storedPath, imported.buffer, { flag: 'wx' });
    const chunks = imported.lesson.sections.map((section, index) => ({
        id: `chunk-${randomUUID()}`,
        heading: section.title,
        content: section.text,
        locationLabel: section.title.match(/^(Page|Slide)\s+\d+/i)?.[0] || `Section ${index + 1}`
    }));
    try {
        return createResourceAndNote(db, {
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
    } catch (error) {
        await unlink(storedPath).catch(() => {});
        throw error;
    }
}
