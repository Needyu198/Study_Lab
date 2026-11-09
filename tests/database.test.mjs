import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuestSession, deleteConversation, insertMessage, listConversations, openDatabase, ownedConversation, updateMessage, upsertConversation, userForSession } from '../server/database.js';

test('sessions resolve to their owning user', () => {
    const db = openDatabase(':memory:');
    const session = createGuestSession(db, 'hashed-token');
    assert.equal(userForSession(db, 'hashed-token').id, session.userId);
    assert.equal(userForSession(db, 'wrong-token'), undefined);
    db.close();
});

test('conversation queries enforce ownership and include messages', () => {
    const db = openDatabase(':memory:');
    const first = createGuestSession(db, 'first').userId;
    const second = createGuestSession(db, 'second').userId;
    upsertConversation(db, { id: 'chat-1', userId: first, subjectId: 'programming-languages', title: 'BNF help' });
    assert.equal(ownedConversation(db, 'chat-1', second), undefined);

    insertMessage(db, { id: 'user-1', conversationId: 'chat-1', role: 'user', content: 'Explain BNF', status: 'complete' });
    insertMessage(db, { id: 'assistant-1', conversationId: 'chat-1', role: 'assistant', content: '', status: 'streaming' });
    updateMessage(db, 'assistant-1', 'chat-1', 'BNF describes grammar.', 'complete');

    const chats = listConversations(db, first, 'programming-languages');
    assert.equal(chats.length, 1);
    assert.equal(chats[0].messages.length, 2);
    assert.equal(chats[0].messages[1].content, 'BNF describes grammar.');
    assert.equal(listConversations(db, second, 'programming-languages').length, 0);
    assert.equal(deleteConversation(db, 'chat-1', second), false);
    assert.equal(deleteConversation(db, 'chat-1', first), true);
    db.close();
});
