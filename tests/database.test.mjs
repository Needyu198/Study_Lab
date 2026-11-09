import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuestSession, createImportedLesson, createResourceAndNote, deleteConversation, insertMessage, listConversations, listLessons, listStudyNotes, openDatabase, ownedConversation, publishStudyNote, publishedNotesAsTopics, updateMessage, upsertConversation, userForSession } from '../server/database.js';

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

test('uploaded files create subject-scoped lessons', () => {
    const db = openDatabase(':memory:');
    const first = createGuestSession(db, 'lesson-owner').userId;
    const second = createGuestSession(db, 'other-owner').userId;
    const lesson = { id: 'lesson-1', title: 'Compiler notes', description: 'How compilation works.', sections: [{ title: 'Parsing', text: 'Parsing creates a syntax tree.' }], takeaway: 'A compiler has multiple stages.' };
    createImportedLesson(db, { userId: first, subjectId: 'programming-languages', filename: 'compiler.md', mimeType: 'text/markdown', buffer: Buffer.from('# Compiler'), text: '# Compiler', lesson });
    assert.equal(listLessons(db, first, 'programming-languages')[0].sections[0].title, 'Parsing');
    assert.equal(listLessons(db, second, 'programming-languages').length, 0);
    db.close();
});

test('published study notes become the trusted source and generate study artifacts', () => {
    const db = openDatabase(':memory:');
    const userId = createGuestSession(db, 'resource-owner').userId;
    const created = createResourceAndNote(db, {
        resource: { id: 'resource-1', userId, subjectId: 'networks', filename: 'networks.pptx', storedPath: '/safe/networks.pptx', resourceType: 'powerpoint', mimeType: 'application/pptx', byteSize: 1200 },
        chunks: [{ id: 'chunk-1', heading: 'Consensus', content: 'Consensus allows nodes to agree on shared state.', locationLabel: 'Slide 8' }],
        note: { id: 'note-1', title: 'Distributed consensus', summary: 'How nodes agree.' }
    });
    assert.equal(created.status, 'draft');
    assert.equal(created.sections[0].sourceLocation, 'Slide 8');
    assert.equal(publishedNotesAsTopics(db, userId, 'networks').length, 0);

    const published = publishStudyNote(db, userId, created.id);
    assert.equal(published.status, 'published');
    assert.equal(published.artifacts.filter(item => item.type === 'flashcard').length, 1);
    assert.equal(published.artifacts.filter(item => item.type === 'question').length, 1);
    assert.equal(publishedNotesAsTopics(db, userId, 'networks')[0].source, 'Published study note: Distributed consensus');
    assert.equal(listStudyNotes(db, userId, 'networks').length, 1);
    db.close();
});
