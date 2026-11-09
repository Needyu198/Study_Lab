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

export { apiRoot };
