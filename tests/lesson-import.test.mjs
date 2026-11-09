import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildLesson, extractLessonText, importLessonFile } from '../server/lesson-import.js';

function simplePdf(text) {
    const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf);
}

test('creates structured sections from Markdown headings', () => {
    const lesson = buildLesson('notes.md', '# Compiler Design\n\n## Lexing\nLexing groups characters into tokens.\n\n## Parsing\nParsing builds a syntax tree.');
    assert.equal(lesson.title, 'Compiler Design');
    assert.deepEqual(lesson.sections.map(section => section.title), ['Lexing', 'Parsing']);
});

test('imports base64 text files and rejects unsupported files', async () => {
    const source = '# Semantics\n\n## Meaning\nSemantics describes what valid programs mean.';
    const imported = await importLessonFile('semantics.md', Buffer.from(source).toString('base64'));
    assert.equal(imported.lesson.title, 'Semantics');
    await assert.rejects(() => extractLessonText('notes.exe', Buffer.from(source)), /Unsupported file type/);
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

test('extracts selectable text from PDF books', async () => {
    const text = await extractLessonText('distributed-systems.pdf', simplePdf('Consensus keeps nodes aligned.'));
    assert.match(text, /Page 1/);
    assert.match(text, /Consensus keeps nodes aligned/);
});
