import { extname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const textExtensions = new Set(['.txt', '.md', '.markdown', '.json', '.csv']);
const archiveExtensions = new Set(['.docx', '.pptx']);
export const acceptedLessonExtensions = [...textExtensions, ...archiveExtensions, '.pdf'];

function decodeEntities(value) {
    return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function xmlText(xml, paragraphTag) {
    const blocks = paragraphTag ? xml.match(new RegExp(`<${paragraphTag}\\b[\\s\\S]*?<\\/${paragraphTag}>`, 'g')) || [xml] : [xml];
    return blocks.map(block => decodeEntities([...block.matchAll(/<(?:a|w):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:a|w):t>/g)].map(match => match[1]).join(' ')).trim()).filter(Boolean).join('\n\n');
}

async function extractDocx(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const document = zip.file('word/document.xml');
    if (!document) throw new Error('This Word file does not contain a readable document.');
    return xmlText(await document.async('text'), 'w:p');
}

async function extractPptx(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
    if (!slides.length) throw new Error('This PowerPoint does not contain readable slides.');
    const output = [];
    for (let index = 0; index < slides.length; index++) {
        const text = xmlText(await zip.file(slides[index]).async('text'), 'a:p');
        if (text) output.push(`Slide ${index + 1}\n${text}`);
    }
    return output.join('\n\n');
}

async function extractPdf(buffer) {
    const document = await getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim();
        if (text) pages.push(`Page ${pageNumber}\n${text}`);
    }
    if (!pages.length) throw new Error('This PDF has no selectable text. Use OCR for a scanned book.');
    return pages.join('\n\n');
}

export async function extractLessonText(filename, buffer) {
    const extension = extname(filename).toLowerCase();
    if (!acceptedLessonExtensions.includes(extension)) throw new Error(`Unsupported file type. Use ${acceptedLessonExtensions.join(', ')}.`);
    if (!buffer?.length) throw new Error('The selected file is empty.');
    let text;
    if (textExtensions.has(extension)) text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    else if (extension === '.docx') text = await extractDocx(buffer);
    else if (extension === '.pptx') text = await extractPptx(buffer);
    else if (extension === '.pdf') text = await extractPdf(buffer);
    text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
    if (text.length < 20) throw new Error('The file does not contain enough readable text to create a lesson.');
    return text.slice(0, 200000);
}

function cleanTitle(filename) {
    return basename(filename, extname(filename)).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Imported lesson';
}

function splitLongText(text, target = 1800) {
    const pieces = text.split(/(?<=[.!?])\s+/);
    const groups = [];
    let current = '';
    for (const piece of pieces) {
        if (current && current.length + piece.length > target) { groups.push(current.trim()); current = ''; }
        current += `${piece} `;
    }
    if (current.trim()) groups.push(current.trim());
    return groups;
}

export function buildLesson(filename, text) {
    const lines = text.split('\n');
    const markdownTitle = lines.find(line => /^#\s+/.test(line));
    const title = (markdownTitle ? markdownTitle.replace(/^#\s+/, '') : cleanTitle(filename)).slice(0, 180);
    const sections = [];
    let heading = 'Lesson notes';
    let content = [];
    function flush() {
        const value = content.join('\n').trim();
        if (value) sections.push({ title: heading.slice(0, 180), text: value.slice(0, 12000) });
        content = [];
    }
    for (const line of lines) {
        const match = line.match(/^#{2,6}\s+(.+)/) || line.match(/^Slide\s+(\d+)\s*$/i);
        if (match) { flush(); heading = match[1] ? (line.startsWith('#') ? match[1] : `Slide ${match[1]}`) : line; }
        else if (!/^#\s+/.test(line)) content.push(line);
    }
    flush();
    if (sections.length === 1 && sections[0].text.length > 2600) {
        const chunks = splitLongText(sections[0].text);
        sections.splice(0, 1, ...chunks.map((chunk, index) => ({ title: `Part ${index + 1}`, text: chunk })));
    }
    const usableSections = sections.filter(section => section.text.length >= 10).slice(0, 30);
    if (!usableSections.length) throw new Error('A lesson could not be created from the extracted text.');
    const description = usableSections[0].text.replace(/\s+/g, ' ').slice(0, 220);
    return {
        id: `lesson-${randomUUID()}`,
        title,
        description: description.length === 220 ? `${description.slice(0, 219)}…` : description,
        sections: usableSections,
        takeaway: `Review the key ideas from ${title} and connect them to your other study material.`
    };
}

export async function importLessonFile(filename, base64) {
    if (typeof base64 !== 'string' || !base64) throw new Error('File data is required.');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 10 * 1024 * 1024) throw new Error('The file is larger than the 10 MB lesson limit.');
    const text = await extractLessonText(filename, buffer);
    return { buffer, text, lesson: buildLesson(filename, text) };
}
