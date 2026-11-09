CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('streaming', 'complete', 'failed', 'stopped')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    include_in_study BOOLEAN NOT NULL DEFAULT TRUE,
    processing_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'outdated')),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    artifact_type TEXT NOT NULL CHECK (artifact_type IN ('flashcard', 'question')),
    data_json JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_owner_subject_idx ON conversations(user_id, subject_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS resources_owner_subject_idx ON resources(user_id, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS study_notes_owner_subject_idx ON study_notes(user_id, subject_id, updated_at DESC);
