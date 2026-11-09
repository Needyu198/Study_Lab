function apiRoot() {
    return (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
}

async function request(path, options = {}) {
    const response = await fetch(`${apiRoot()}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${response.status}.`);
    }
    return response.json();
}

export async function loadServerConversations(subjectId, signal) {
    const data = await request(`/conversations?subjectId=${encodeURIComponent(subjectId)}`, { signal });
    return data.conversations;
}

export function saveServerConversation(conversation) {
    return request('/conversations', { method: 'POST', body: JSON.stringify(conversation) });
}

export function deleteServerConversation(id) {
    return request(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function loadServerLessons(subjectId, signal) {
    const data = await request(`/lessons?subjectId=${encodeURIComponent(subjectId)}`, { signal });
    return data.lessons;
}

export async function uploadLessonFile(subjectId, file) {
    if (file.size > 10 * 1024 * 1024) throw new Error('The file is larger than the 10 MB lesson limit.');
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('The selected file could not be read.'));
        reader.readAsDataURL(file);
    });
    const base64 = String(dataUrl).slice(String(dataUrl).indexOf(',') + 1);
    const data = await request('/lessons/import', {
        method: 'POST',
        body: JSON.stringify({ subjectId, filename: file.name, mimeType: file.type, base64 })
    });
    return data.lesson;
}

export { apiRoot };
