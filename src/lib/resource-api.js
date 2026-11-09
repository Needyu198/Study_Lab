const root = () => (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

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

export async function importResource(subjectId, file) {
    if (file.size > 10 * 1024 * 1024) throw new Error('The resource is larger than the 10 MB limit.');
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
