import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversation, loadConversations, saveConversations, STORAGE_KEY, titleFromMessage } from '../src/lib/chat-storage.js';

function memoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem(key) { return values.get(key) ?? null; },
        setItem(key, value) { values.set(key, String(value)); }
    };
}

test('creates and persists subject-scoped conversations', () => {
    const storage = memoryStorage();
    const chat = createConversation('programming-languages');
    saveConversations([chat], storage);
    assert.equal(loadConversations(storage)[0].subjectId, 'programming-languages');
    assert.equal(loadConversations(storage)[0].title, 'New study chat');
});

test('filters malformed stored conversations', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify([{ nope: true }, createConversation('valid')]) });
    assert.equal(loadConversations(storage).length, 1);
});

test('creates compact titles from the first message', () => {
    assert.equal(titleFromMessage('  Explain   BNF please  '), 'Explain BNF please');
    assert.ok(titleFromMessage('x'.repeat(80)).endsWith('…'));
});
