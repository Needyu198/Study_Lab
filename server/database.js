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
        CREATE INDEX IF NOT EXISTS conversations_owner_subject_idx
            ON conversations(user_id, subject_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
            ON messages(conversation_id, created_at);
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
