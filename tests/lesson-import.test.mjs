import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildLesson, extractLessonText, importLessonFile } from '../server/lesson-import.js';

test('creates structured sections from Markdown headings', () => {
    const lesson = buildLesson('notes.md', '# Compiler Design\n\n## Lexing\nLexing groups characters into tokens.\n\n## Parsing\nParsing builds a syntax tree.');
    assert.equal(lesson.title, 'Compiler Design');
    assert.deepEqual(lesson.sections.map(section => section.title), ['Lexing', 'Parsing']);
});

test('imports base64 text files and rejects unsupported files', async () => {
    const source = '# Semantics\n\n## Meaning\nSemantics describes what valid programs mean.';
    const imported = await importLessonFile('semantics.md', Buffer.from(source).toString('base64'));
    assert.equal(imported.lesson.title, 'Semantics');
    await assert.rejects(() => extractLessonText('notes.pdf', Buffer.from(source)), /Unsupported file type/);
});

test('extracts readable text from PowerPoint slides', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', '<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Compiler Pipeline</a:t></a:r></a:p><a:p><a:r><a:t>Lexing creates tokens.</a:t></a:r></a:p></p:sld>');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const text = await extractLessonText('lecture.pptx', buffer);
    assert.match(text, /Slide 1/);
    assert.match(text, /Lexing creates tokens/);
});

test('extracts readable paragraphs from Word documents', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Database Transactions</w:t></w:r></w:p><w:p><w:r><w:t>Atomicity prevents partial updates.</w:t></w:r></w:p></w:body></w:document>');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const text = await extractLessonText('database.docx', buffer);
    assert.match(text, /Database Transactions/);
    assert.match(text, /Atomicity prevents partial updates/);
});
