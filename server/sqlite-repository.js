import * as database from './database.js';

export function createSqliteRepository(db) {
    return {
        createGuestSession: (tokenHash, ttlDays) => database.createGuestSession(db, tokenHash, ttlDays),
        userForSession: tokenHash => database.userForSession(db, tokenHash),
        listConversations: (userId, subjectId) => database.listConversations(db, userId, subjectId),
        upsertConversation: values => database.upsertConversation(db, values),
        deleteConversation: (id, userId) => database.deleteConversation(db, id, userId),
        insertMessage: message => database.insertMessage(db, message),
        updateMessage: (id, conversationId, content, status) => database.updateMessage(db, id, conversationId, content, status),
        listLessons: (userId, subjectId) => database.listLessons(db, userId, subjectId),
        createImportedLesson: values => database.createImportedLesson(db, values),
        listResources: (userId, subjectId) => database.listResources(db, userId, subjectId),
        createResourceAndNote: values => database.createResourceAndNote(db, values),
        listStudyNotes: (userId, subjectId, status) => database.listStudyNotes(db, userId, subjectId, status),
        getStudyNote: (userId, noteId) => database.getStudyNote(db, userId, noteId),
        updateStudyNote: (userId, noteId, values) => database.updateStudyNote(db, userId, noteId, values),
        publishStudyNote: (userId, noteId) => database.publishStudyNote(db, userId, noteId),
        publishedNotesAsTopics: (userId, subjectId) => database.publishedNotesAsTopics(db, userId, subjectId)
    };
}
