import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreApiUrl } from '../server/vercel-path.js';

test('restores Vercel resource rewrites without losing query parameters', () => {
    const req = {
        url: '/api/router?path=resources&subjectId=programming-languages',
        headers: { host: 'study-lab.example' },
        query: { path: 'resources', subjectId: 'programming-languages' }
    };
    assert.equal(restoreApiUrl(req), '/api/resources?subjectId=programming-languages');
});

test('restores nested Vercel API paths from array parameters', () => {
    const req = {
        url: '/api/router?path=study-notes%2Fnote-1%2Fpublish',
        headers: { host: 'study-lab.example' },
        query: { path: ['study-notes', 'note-1', 'publish'] }
    };
    assert.equal(restoreApiUrl(req), '/api/study-notes/note-1/publish');
});
