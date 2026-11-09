import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const iso = value => value instanceof Date ? value.toISOString() : value;
const conversationRow = row => row && ({ id: row.id, subjectId: row.subject_id, title: row.title, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) });

export function createPostgresRepository(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error('DATABASE_URL is required for the PostgreSQL adapter.');
    const sql = postgres(connectionString, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 15 });

    async function getStudyNote(userId, noteId, client = sql) {
        const [row] = await client`SELECT * FROM study_notes WHERE id = ${noteId} AND user_id = ${userId}`;
        if (!row) return undefined;
        const sections = await client`SELECT sns.id, sns.resource_chunk_id, sns.title, sns.content, sns.section_order,
            r.filename AS source_filename, rc.location_label AS source_location
            FROM study_note_sections sns
            LEFT JOIN resource_chunks rc ON rc.id = sns.resource_chunk_id
            LEFT JOIN resources r ON r.id = rc.resource_id
            WHERE sns.note_id = ${noteId} ORDER BY sns.section_order`;
        const artifacts = await client`SELECT id, artifact_type, data_json FROM study_artifacts WHERE note_id = ${noteId}`;
        return {
            id: row.id, subjectId: row.subject_id, resourceId: row.resource_id, title: row.title, summary: row.summary,
            status: row.status, version: row.version, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
            sections: sections.map(item => ({ id: item.id, resourceChunkId: item.resource_chunk_id, title: item.title, content: item.content, sectionOrder: item.section_order, sourceFilename: item.source_filename, sourceLocation: item.source_location })),
            artifacts: artifacts.map(item => ({ id: item.id, type: item.artifact_type, ...item.data_json }))
        };
    }

    async function listStudyNotes(userId, subjectId, status = null) {
        const rows = status
            ? await sql`SELECT id FROM study_notes WHERE user_id = ${userId} AND subject_id = ${subjectId} AND status = ${status} ORDER BY updated_at DESC`
            : await sql`SELECT id FROM study_notes WHERE user_id = ${userId} AND subject_id = ${subjectId} ORDER BY updated_at DESC`;
        return Promise.all(rows.map(row => getStudyNote(userId, row.id)));
    }

    return {
        async createGuestSession(tokenHash, ttlDays = 30) {
            const userId = randomUUID();
            const expiresAt = new Date(Date.now() + ttlDays * 86400000);
            await sql.begin(async tx => {
                await tx`INSERT INTO users (id, name) VALUES (${userId}, ${'Study Lab guest'})`;
                await tx`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${tokenHash}, ${userId}, ${expiresAt})`;
            });
            return { userId, expiresAt: expiresAt.toISOString() };
        },
        async userForSession(tokenHash) {
            const [row] = await sql`SELECT users.id, users.name FROM sessions JOIN users ON users.id = sessions.user_id
                WHERE sessions.token_hash = ${tokenHash} AND sessions.expires_at > NOW()`;
            return row;
        },
        async listConversations(userId, subjectId) {
            const rows = await sql`SELECT * FROM conversations WHERE user_id = ${userId} AND subject_id = ${subjectId} ORDER BY updated_at DESC`;
            return Promise.all(rows.map(async row => ({ ...conversationRow(row), messages: (await sql`SELECT id, role, content, status, created_at FROM messages WHERE conversation_id = ${row.id} ORDER BY created_at`).map(item => ({ ...item, createdAt: iso(item.created_at), created_at: undefined })) })));
        },
        async upsertConversation({ id, userId, subjectId, title }) {
            const rows = await sql`INSERT INTO conversations (id, user_id, subject_id, title) VALUES (${id}, ${userId}, ${subjectId}, ${title})
                ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()
                WHERE conversations.user_id = EXCLUDED.user_id RETURNING *`;
            return conversationRow(rows[0]);
        },
        async deleteConversation(id, userId) {
            const result = await sql`DELETE FROM conversations WHERE id = ${id} AND user_id = ${userId}`;
            return result.count > 0;
        },
        async insertMessage(message) {
            await sql`INSERT INTO messages (id, conversation_id, role, content, status, created_at)
                VALUES (${message.id}, ${message.conversationId}, ${message.role}, ${message.content}, ${message.status}, ${message.createdAt || new Date()})
                ON CONFLICT (id) DO NOTHING`;
        },
        async updateMessage(id, conversationId, content, status) {
            await sql.begin(async tx => {
                await tx`UPDATE messages SET content = ${content}, status = ${status} WHERE id = ${id} AND conversation_id = ${conversationId}`;
                await tx`UPDATE conversations SET updated_at = NOW() WHERE id = ${conversationId}`;
            });
        },
        async listLessons() { return []; },
        async createImportedLesson() { throw new Error('Legacy lesson import is unavailable in PostgreSQL mode. Use Resources.'); },
        async listResources(userId, subjectId) {
            const rows = await sql`SELECT * FROM resources WHERE user_id = ${userId} AND subject_id = ${subjectId} ORDER BY created_at DESC`;
            return rows.map(row => ({ id: row.id, subjectId: row.subject_id, filename: row.filename, resourceType: row.resource_type, mimeType: row.mime_type, byteSize: row.byte_size, status: row.status, includeInStudy: row.include_in_study, processingError: row.processing_error, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }));
        },
        async createResourceAndNote({ resource, chunks, note }) {
            await sql.begin(async tx => {
                await tx`INSERT INTO resources (id, user_id, subject_id, filename, stored_path, resource_type, mime_type, byte_size, status)
                    VALUES (${resource.id}, ${resource.userId}, ${resource.subjectId}, ${resource.filename}, ${resource.storedPath}, ${resource.resourceType}, ${resource.mimeType}, ${resource.byteSize}, ${'ready'})`;
                await tx`INSERT INTO study_notes (id, user_id, subject_id, resource_id, title, summary, status)
                    VALUES (${note.id}, ${resource.userId}, ${resource.subjectId}, ${resource.id}, ${note.title}, ${note.summary}, ${'draft'})`;
                for (let index = 0; index < chunks.length; index++) {
                    const chunk = chunks[index];
                    await tx`INSERT INTO resource_chunks (id, resource_id, heading, content, location_label, chunk_order)
                        VALUES (${chunk.id}, ${resource.id}, ${chunk.heading}, ${chunk.content}, ${chunk.locationLabel}, ${index})`;
                    await tx`INSERT INTO study_note_sections (id, note_id, resource_chunk_id, title, content, section_order)
                        VALUES (${`section-${randomUUID()}`}, ${note.id}, ${chunk.id}, ${chunk.heading}, ${chunk.content}, ${index})`;
                }
            });
            return getStudyNote(resource.userId, note.id);
        },
        listStudyNotes,
        getStudyNote,
        async updateStudyNote(userId, noteId, values) {
            const note = await getStudyNote(userId, noteId);
            if (!note || note.status === 'published') return undefined;
            await sql.begin(async tx => {
                await tx`UPDATE study_notes SET title = ${values.title}, summary = ${values.summary}, updated_at = NOW() WHERE id = ${noteId} AND user_id = ${userId}`;
                for (const section of values.sections) await tx`UPDATE study_note_sections SET title = ${section.title}, content = ${section.content} WHERE id = ${section.id} AND note_id = ${noteId}`;
            });
            return getStudyNote(userId, noteId);
        },
        async publishStudyNote(userId, noteId) {
            const note = await getStudyNote(userId, noteId);
            if (!note) return undefined;
            await sql.begin(async tx => {
                await tx`UPDATE study_notes SET status = ${'published'}, updated_at = NOW() WHERE id = ${noteId} AND user_id = ${userId}`;
                await tx`DELETE FROM study_artifacts WHERE note_id = ${noteId}`;
                for (const section of note.sections) {
                    const answer = section.content.split(/(?<=[.!?])\s+/)[0].slice(0, 500);
                    await tx`INSERT INTO study_artifacts (id, note_id, artifact_type, data_json) VALUES (${`artifact-${randomUUID()}`}, ${noteId}, ${'flashcard'}, ${tx.json({ question: `What should you remember about ${section.title}?`, answer, sectionId: section.id })})`;
                    await tx`INSERT INTO study_artifacts (id, note_id, artifact_type, data_json) VALUES (${`artifact-${randomUUID()}`}, ${noteId}, ${'question'}, ${tx.json({ prompt: `Explain ${section.title} in your own words.`, answer, sectionId: section.id })})`;
                }
            });
            return getStudyNote(userId, noteId);
        },
        async publishedNotesAsTopics(userId, subjectId) {
            return (await listStudyNotes(userId, subjectId, 'published')).map(note => ({
                id: note.id, title: note.title, description: note.summary, group: 'Published study notes',
                sections: note.sections.map(section => ({ title: section.title, text: section.content })),
                takeaway: `Based on the reviewed study note “${note.title}”.`, source: `Published study note: ${note.title}`, questions: [], cards: []
            }));
        },
        close: () => sql.end()
    };
}
