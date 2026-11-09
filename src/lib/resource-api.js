import { upload } from '@vercel/blob/client';

const root = () => (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const useBlobUploads = () => import.meta.env.VITE_BLOB_UPLOADS === 'true';
const safeSegment = value => String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);

async function request(path, options = {}) {
    const response = await fetch(`${root()}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Server returned ${response.status}.`);
    return data;
}

export async function listResources(subjectId, signal) {
    return (await request(`/resources?subjectId=${encodeURIComponent(subjectId)}`, { signal })).resources;
}

export async function importResource(subjectId, file, onProgress) {
    const maximum = useBlobUploads() ? 50 : 10;
    if (file.size > maximum * 1024 * 1024) throw new Error(`The resource is larger than the ${maximum} MB limit.`);
    if (useBlobUploads()) {
        const { user } = await request('/session');
        const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        const blob = await upload(`resources/${safeSegment(user.id)}/${safeSegment(subjectId)}/resource-${crypto.randomUUID()}${extension}`, file, {
            access: 'private',
            handleUploadUrl: '/api/blob-upload',
            clientPayload: JSON.stringify({ subjectId, filename: file.name }),
            contentType: file.type || 'application/octet-stream',
            multipart: file.size > 5 * 1024 * 1024,
            onUploadProgress: progress => onProgress?.(progress.percentage)
        });
        return request('/resources/process', {
            method: 'POST',
            body: JSON.stringify({
                subjectId,
                filename: file.name,
                mimeType: file.type,
                byteSize: file.size,
                blobUrl: blob.url
            })
        });
    }
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('The selected file could not be read.'));
        reader.readAsDataURL(file);
    });
    return request('/resources/import', {
        method: 'POST',
        body: JSON.stringify({
            subjectId,
            filename: file.name,
            mimeType: file.type,
            base64: String(dataUrl).split(',')[1]
        })
    });
}

export async function listStudyNotes(subjectId, signal) {
    return (await request(`/study-notes?subjectId=${encodeURIComponent(subjectId)}`, { signal })).notes;
}

export async function saveStudyNote(note) {
    return (await request(`/study-notes/${encodeURIComponent(note.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: note.title, summary: note.summary, sections: note.sections })
    })).note;
}

export async function publishStudyNote(noteId) {
    return (await request(`/study-notes/${encodeURIComponent(noteId)}/publish`, { method: 'POST' })).note;
}
