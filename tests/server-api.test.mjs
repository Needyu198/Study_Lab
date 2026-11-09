import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/database.js';

async function startTestServer() {
    const uploadsDirectory = await mkdtemp(join(tmpdir(), 'study-lab-api-'));
    process.env.UPLOADS_DIRECTORY = uploadsDirectory;
    const { createStudyServer } = await import(`../server/index.js?uploads=${Date.now()}`);
    const db = openDatabase(':memory:');
    const server = createStudyServer({ db, secure: false });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    return {
        db,
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
        async close() { await new Promise(resolve => server.close(resolve)); db.close(); await rm(uploadsDirectory, { recursive: true, force: true }); }
    };
}

test('API stores a resource, publishes its note and uses it in chat', async context => {
    let app;
    try {
        app = await startTestServer();
    } catch (error) {
        if (error?.code === 'EPERM') {
            context.skip('This environment does not allow binding a local test port.');
            return;
        }
        throw error;
    }
    try {
        const session = await fetch(`${app.baseUrl}/api/session`);
        const cookie = session.headers.get('set-cookie').split(';')[0];
        const source = '# Networks\n\n## Gossip\nA gossip protocol spreads updates by having nodes repeatedly exchange information with peers.';
        const upload = await fetch(`${app.baseUrl}/api/resources/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify({ subjectId: 'networks', filename: 'networks.md', mimeType: 'text/markdown', base64: Buffer.from(source).toString('base64') })
        });
        assert.equal(upload.status, 201);
        const note = (await upload.json()).note;
        assert.equal(note.title, 'Networks');
        assert.equal(note.status, 'draft');

        const publish = await fetch(`${app.baseUrl}/api/study-notes/${note.id}/publish`, { method: 'POST', headers: { Cookie: cookie } });
        assert.equal(publish.status, 200);
        const published = (await publish.json()).note;
        assert.equal(published.status, 'published');
        assert.equal(published.artifacts.length, 2);

        const chat = await fetch(`${app.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            body: JSON.stringify({ subjectId: 'networks', subjectName: 'Networks', conversationId: 'chat-1', userMessageId: 'user-1', assistantMessageId: 'assistant-1', title: 'Gossip', content: 'What is a gossip protocol?' })
        });
        assert.equal(chat.status, 200);
        assert.match(await chat.text(), /repeatedly exchange information with peers/i);

        const resources = await fetch(`${app.baseUrl}/api/resources?subjectId=networks`, { headers: { Cookie: cookie } }).then(response => response.json());
        assert.equal(resources.resources.length, 1);
        assert.match(resources.resources[0].filename, /networks\.md/);
    } finally {
        await app.close();
    }
});
