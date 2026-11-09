const STORAGE_KEY = 'study-lab-chats-v1';

function isMessage(value) {
    return value && typeof value.id === 'string' && ['user', 'assistant'].includes(value.role) && typeof value.content === 'string';
}

function isConversation(value) {
    return value && typeof value.id === 'string' && typeof value.subjectId === 'string' &&
        typeof value.title === 'string' && Array.isArray(value.messages) && value.messages.every(isMessage);
}

export function loadConversations(storage = globalThis.localStorage) {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(value))
        return [];
    return value.filter(isConversation).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function saveConversations(conversations, storage = globalThis.localStorage) {
    if (!Array.isArray(conversations))
        throw new TypeError('Conversations must be an array.');
    storage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    return conversations;
}

export function makeId(prefix = 'chat') {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${id}`;
}

export function createConversation(subjectId, title = 'New study chat') {
    const now = new Date().toISOString();
    return { id: makeId(), subjectId, title, createdAt: now, updatedAt: now, messages: [] };
}

export function titleFromMessage(content) {
    const compact = content.trim().replace(/\s+/g, ' ');
    return compact.length > 42 ? `${compact.slice(0, 42).trim()}…` : compact || 'New study chat';
}

export { STORAGE_KEY };
