import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export function openDatabase(filename = process.env.DATABASE_PATH || resolve('data/study-lab.sqlite')) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
    const db = new DatabaseSync(filename);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    migrate(db);
    return db;
}

export function migrate(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subject_id TEXT NOT NULL,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('streaming', 'complete', 'failed', 'stopped')),
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS uploaded_files (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subject_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            byte_size INTEGER NOT NULL,
            file_data BLOB NOT NULL,
            extracted_text TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS lessons (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subject_id TEXT NOT NULL,
            file_id TEXT REFERENCES uploaded_files(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            sections_json TEXT NOT NULL,
            takeaway TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS resources (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subject_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            stored_path TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            byte_size INTEGER NOT NULL,
            status TEXT NOT NULL,
            include_in_study INTEGER NOT NULL DEFAULT 1,
            processing_error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS resource_chunks (
            id TEXT PRIMARY KEY,
            resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
            heading TEXT NOT NULL,
            content TEXT NOT NULL,
            location_label TEXT NOT NULL,
            chunk_order INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS study_notes (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subject_id TEXT NOT NULL,
            resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('draft', 'published', 'outdated')),
            version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS study_note_sections (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL REFERENCES study_notes(id) ON DELETE CASCADE,
            resource_chunk_id TEXT REFERENCES resource_chunks(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            section_order INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS study_artifacts (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL REFERENCES study_notes(id) ON DELETE CASCADE,
            artifact_type TEXT NOT NULL CHECK(artifact_type IN ('flashcard', 'question')),
            data_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS conversations_owner_subject_idx
            ON conversations(user_id, subject_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
            ON messages(conversation_id, created_at);
        CREATE INDEX IF NOT EXISTS lessons_owner_subject_idx
            ON lessons(user_id, subject_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS resources_owner_subject_idx
            ON resources(user_id, subject_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS study_notes_owner_subject_idx
            ON study_notes(user_id, subject_id, updated_at DESC);
    `);
}

export function createGuestSession(db, tokenHash, ttlDays = 30) {
    const now = new Date();
    const userId = randomUUID();
    const expiresAt = new Date(now.getTime() + ttlDays * 86400000).toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
        db.prepare('INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)').run(userId, 'Study Lab guest', now.toISOString());
        db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(tokenHash, userId, expiresAt, now.toISOString());
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    return { userId, expiresAt };
}

export function userForSession(db, tokenHash) {
    return db.prepare(`SELECT users.id, users.name FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(tokenHash, new Date().toISOString());
}

export function listConversations(db, userId, subjectId) {
    const conversations = db.prepare(`SELECT id, subject_id AS subjectId, title, created_at AS createdAt, updated_at AS updatedAt
        FROM conversations WHERE user_id = ? AND subject_id = ? ORDER BY updated_at DESC`).all(userId, subjectId);
    const getMessages = db.prepare(`SELECT id, role, content, status, created_at AS createdAt
        FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid`);
    return conversations.map(chat => ({ ...chat, messages: getMessages.all(chat.id) }));
}

export function upsertConversation(db, { id, userId, subjectId, title }) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO conversations (id, user_id, subject_id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at
        WHERE conversations.user_id = excluded.user_id`).run(id, userId, subjectId, title, now, now);
    return ownedConversation(db, id, userId);
}

export function ownedConversation(db, id, userId) {
    return db.prepare(`SELECT id, subject_id AS subjectId, title, created_at AS createdAt, updated_at AS updatedAt
        FROM conversations WHERE id = ? AND user_id = ?`).get(id, userId);
}

export function deleteConversation(db, id, userId) {
    return db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

export function insertMessage(db, message) {
    db.prepare(`INSERT OR IGNORE INTO messages (id, conversation_id, role, content, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(message.id, message.conversationId, message.role, message.content, message.status, message.createdAt || new Date().toISOString());
}

export function updateMessage(db, id, conversationId, content, status) {
    db.prepare('UPDATE messages SET content = ?, status = ? WHERE id = ? AND conversation_id = ?').run(content, status, id, conversationId);
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), conversationId);
}

export function createImportedLesson(db, { userId, subjectId, filename, mimeType, buffer, text, lesson }) {
    const fileId = `file-${randomUUID()}`;
    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
        db.prepare(`INSERT INTO uploaded_files
            (id, user_id, subject_id, filename, mime_type, byte_size, file_data, extracted_text, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(fileId, userId, subjectId, filename, mimeType, buffer.length, buffer, text, now);
        db.prepare(`INSERT INTO lessons
            (id, user_id, subject_id, file_id, title, description, sections_json, takeaway, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(lesson.id, userId, subjectId, fileId, lesson.title, lesson.description, JSON.stringify(lesson.sections), lesson.takeaway, now);
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    return { ...lesson, subjectId, filename, createdAt: now };
}

export function listLessons(db, userId, subjectId) {
    return db.prepare(`SELECT lessons.id, lessons.subject_id AS subjectId, lessons.title, lessons.description,
        lessons.sections_json AS sectionsJson, lessons.takeaway, lessons.created_at AS createdAt,
        uploaded_files.filename
        FROM lessons LEFT JOIN uploaded_files ON uploaded_files.id = lessons.file_id
        WHERE lessons.user_id = ? AND lessons.subject_id = ? ORDER BY lessons.created_at DESC`).all(userId, subjectId).map(row => {
            const { sectionsJson, ...lesson } = row;
            return { ...lesson, sections: JSON.parse(sectionsJson), questions: [], cards: [], group: 'Uploaded lessons' };
        });
}

export function createResourceAndNote(db, { resource, chunks, note }) {
    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
        db.prepare(`INSERT INTO resources
            (id, user_id, subject_id, filename, stored_path, resource_type, mime_type, byte_size, status, include_in_study, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', 1, ?, ?)`).run(resource.id, resource.userId, resource.subjectId, resource.filename, resource.storedPath, resource.resourceType, resource.mimeType, resource.byteSize, now, now);
        const addChunk = db.prepare(`INSERT INTO resource_chunks
            (id, resource_id, heading, content, location_label, chunk_order) VALUES (?, ?, ?, ?, ?, ?)`);
        const addSection = db.prepare(`INSERT INTO study_note_sections
            (id, note_id, resource_chunk_id, title, content, section_order) VALUES (?, ?, ?, ?, ?, ?)`);
        db.prepare(`INSERT INTO study_notes
            (id, user_id, subject_id, resource_id, title, summary, status, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)`).run(note.id, resource.userId, resource.subjectId, resource.id, note.title, note.summary, now, now);
        chunks.forEach((chunk, index) => {
            addChunk.run(chunk.id, resource.id, chunk.heading, chunk.content, chunk.locationLabel, index);
            addSection.run(`section-${randomUUID()}`, note.id, chunk.id, chunk.heading, chunk.content, index);
        });
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    return getStudyNote(db, resource.userId, note.id);
}

export function listResources(db, userId, subjectId) {
    return db.prepare(`SELECT id, subject_id AS subjectId, filename, resource_type AS resourceType,
        mime_type AS mimeType, byte_size AS byteSize, status, include_in_study AS includeInStudy,
        processing_error AS processingError, created_at AS createdAt, updated_at AS updatedAt
        FROM resources WHERE user_id = ? AND subject_id = ? ORDER BY created_at DESC`).all(userId, subjectId).map(row => ({ ...row, includeInStudy: Boolean(row.includeInStudy) }));
}

export function listStudyNotes(db, userId, subjectId, status = null) {
    const rows = status
        ? db.prepare('SELECT * FROM study_notes WHERE user_id = ? AND subject_id = ? AND status = ? ORDER BY updated_at DESC').all(userId, subjectId, status)
        : db.prepare('SELECT * FROM study_notes WHERE user_id = ? AND subject_id = ? ORDER BY updated_at DESC').all(userId, subjectId);
    return rows.map(row => getStudyNote(db, userId, row.id));
}

export function getStudyNote(db, userId, noteId) {
    const row = db.prepare(`SELECT id, subject_id AS subjectId, resource_id AS resourceId, title, summary,
        status, version, created_at AS createdAt, updated_at AS updatedAt
        FROM study_notes WHERE id = ? AND user_id = ?`).get(noteId, userId);
    if (!row) return undefined;
    const sections = db.prepare(`SELECT study_note_sections.id, study_note_sections.resource_chunk_id AS resourceChunkId,
        study_note_sections.title, study_note_sections.content, study_note_sections.section_order AS sectionOrder,
        resources.filename AS sourceFilename, resource_chunks.location_label AS sourceLocation
        FROM study_note_sections
        LEFT JOIN resource_chunks ON resource_chunks.id = study_note_sections.resource_chunk_id
        LEFT JOIN resources ON resources.id = resource_chunks.resource_id
        WHERE study_note_sections.note_id = ? ORDER BY study_note_sections.section_order`).all(noteId);
    const artifacts = db.prepare('SELECT id, artifact_type AS type, data_json AS dataJson FROM study_artifacts WHERE note_id = ?').all(noteId).map(item => ({ id: item.id, type: item.type, ...JSON.parse(item.dataJson) }));
    return { ...row, sections, artifacts };
}

export function updateStudyNote(db, userId, noteId, { title, summary, sections }) {
    const existing = getStudyNote(db, userId, noteId);
    if (!existing || existing.status === 'published') return undefined;
    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
        db.prepare('UPDATE study_notes SET title = ?, summary = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(title, summary, now, noteId, userId);
        const updateSection = db.prepare('UPDATE study_note_sections SET title = ?, content = ? WHERE id = ? AND note_id = ?');
        for (const section of sections) updateSection.run(section.title, section.content, section.id, noteId);
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    return getStudyNote(db, userId, noteId);
}

export function publishStudyNote(db, userId, noteId) {
    const note = getStudyNote(db, userId, noteId);
    if (!note) return undefined;
    db.exec('BEGIN IMMEDIATE');
    try {
        db.prepare("UPDATE study_notes SET status = 'published', updated_at = ? WHERE id = ? AND user_id = ?").run(new Date().toISOString(), noteId, userId);
        db.prepare('DELETE FROM study_artifacts WHERE note_id = ?').run(noteId);
        const add = db.prepare('INSERT INTO study_artifacts (id, note_id, artifact_type, data_json) VALUES (?, ?, ?, ?)');
        for (const section of note.sections) {
            const answer = section.content.split(/(?<=[.!?])\s+/)[0].slice(0, 500);
            add.run(`artifact-${randomUUID()}`, noteId, 'flashcard', JSON.stringify({ question: `What should you remember about ${section.title}?`, answer, sectionId: section.id }));
            add.run(`artifact-${randomUUID()}`, noteId, 'question', JSON.stringify({ prompt: `Explain ${section.title} in your own words.`, answer, sectionId: section.id }));
        }
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    return getStudyNote(db, userId, noteId);
}

export function publishedNotesAsTopics(db, userId, subjectId) {
    return listStudyNotes(db, userId, subjectId, 'published').map(note => ({
        id: note.id,
        title: note.title,
        description: note.summary,
        group: 'Published study notes',
        sections: note.sections.map(section => ({ title: section.title, text: section.content })),
        takeaway: `Based on the reviewed study note “${note.title}”.`,
        source: `Published study note: ${note.title}`,
        questions: [],
        cards: []
    }));
}
