import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const parser = () => new DOMParser();
const serialize = (d) => new XMLSerializer().serializeToString(d);
async function xml(z, path) { const f = z.file(path); if (!f)
    throw new Error('This file is not a supported PowerPoint presentation.'); return parser().parseFromString(await f.async('string'), 'application/xml'); }
async function safeZip(bytes) {
    if (bytes.byteLength > 40 * 1024 * 1024)
        throw new Error('Choose a PowerPoint smaller than 40 MB.');
    const z = await JSZip.loadAsync(bytes);
    let total = 0;
    for (const f of Object.values(z.files)) {
        total += f._data?.uncompressedSize || 0;
        if (total > 200 * 1024 * 1024)
            throw new Error('This presentation is too large when unpacked (200 MB limit).');
    }
    return z;
}
export async function inspectDeck(bytes, name) {
    const z = await safeZip(bytes);
    const d = await xml(z, 'ppt/presentation.xml');
    const sz = d.getElementsByTagNameNS(P, 'sldSz')[0];
    const width = Number(sz?.getAttribute('cx')) / 914400, height = Number(sz?.getAttribute('cy')) / 914400;
    if (!width || !height || width > 56 || height > 56)
        throw new Error('The slide dimensions could not be read.');
    return { bytes, name, width, height, count: d.getElementsByTagNameNS(P, 'sldId').length };
}
export function splitSlideText(text, maxChars = 720) {
    const paragraphs = text.split('\n');
    const out = [];
    let current = '';
    for (const paragraph of paragraphs) {
        for (const word of (paragraph + '\n').match(/\S+[^\S\n]*|\n/g) || []) {
            if (current.length + word.length > maxChars && current.trim()) {
                out.push(current.trim());
                current = '';
            }
            if (word.length > maxChars) {
                if (current.trim())
                    out.push(current.trim());
                current = '';
                for (let i = 0; i < word.length; i += maxChars)
                    out.push(word.slice(i, i + maxChars));
            }
            else
                current += word;
        }
    }
    if (current.trim())
        out.push(current.trim());
    return out.length ? out : [''];
}
export async function makeDeck(photos, title, subject, editable, base) {
    if (!photos.length)
        throw new Error('Add at least one slide photo.');
    const pptx = new PptxGenJS();
    const w = base?.width || 13.333333, h = base?.height || 7.5;
    pptx.defineLayout({ name: 'LECTURE', width: w, height: h });
    pptx.layout = 'LECTURE';
    pptx.title = title;
    pptx.subject = subject;
    pptx.author = 'Study Lab';
    let generatedCount = 0;
    for (const photo of photos) {
        const pages = editable ? splitSlideText(photo.text, Math.max(120, Math.floor(700 * (w / h) / (16 / 9)))) : [''];
        for (let i = 0; i < pages.length; i++) {
            const slide = pptx.addSlide();
            generatedCount++;
            slide.background = { color: editable ? 'FAFBF6' : 'FFFFFF' };
            if (!editable) {
                slide.addImage({ data: photo.data, ...pptxgenImageContain(photo.width, photo.height, 0, 0, w, h) });
            }
            else {
                const scale = Math.min(w / 13.333, h / 7.5);
                const margin = .45 * scale;
                slide.addText(`${photo.title || 'Lecture slide'}${i ? ` (continued ${i + 1})` : ''}`, { x: margin, y: .3 * scale, w: w - 2 * margin, h: .8 * scale, fontFace: 'Arial', fontSize: 26 * scale, bold: true, color: '334A35', breakLine: false, fit: 'shrink', margin: 0 });
                slide.addText(pages[i], { x: margin, y: 1.35 * scale, w: w * .57 - margin, h: h - 2 * scale, fontFace: 'Arial', fontSize: 19 * scale, color: '334037', valign: 'top', fit: 'shrink', margin: 0, paraSpaceAfter: 7 * scale });
                slide.addImage({ data: photo.data, ...pptxgenImageContain(photo.width, photo.height, w * .60, 1.35 * scale, w * .36, h - 2.25 * scale) });
                slide.addText('Source photo · diagrams and original wording', { x: w * .60, y: h - .75 * scale, w: w * .36, h: .3 * scale, fontFace: 'Arial', fontSize: 9 * scale, color: '66735E', margin: 0 });
                slide.addText(`${subject}  ·  ${generatedCount}`, { x: margin, y: h - .35 * scale, w: w - 2 * margin, h: .2 * scale, fontFace: 'Arial', fontSize: 9 * scale, color: '718165', margin: 0 });
            }
            slide.addNotes(`${subject}\nSource photo: ${photo.name}\n${photo.text}`);
        }
    }
    const bytes = await pptx.write({ outputType: 'arraybuffer' });
    return { bytes: base ? await appendDeck(base.bytes, bytes) : bytes, count: (base?.count || 0) + generatedCount, added: generatedCount };
}
function pptxgenImageContain(iw, ih, x, y, w, h) { const s = Math.min(w / iw, h / ih); return { x: x + (w - iw * s) / 2, y: y + (h - ih * s) / 2, w: iw * s, h: ih * s }; }
// Append fresh generated slides, retaining every existing slide and package part.
// All generated parts get an isolated directory namespace, including masters,
// layouts, notes and media, so no source relationships are lost or overwritten.
export async function appendDeck(original, addition) {
    const dst = await safeZip(original), src = await JSZip.loadAsync(addition);
    const pres = await xml(dst, 'ppt/presentation.xml'), rels = await xml(dst, 'ppt/_rels/presentation.xml.rels'), types = await xml(dst, '[Content_Types].xml');
    const sp = await xml(src, 'ppt/presentation.xml'), sr = await xml(src, 'ppt/_rels/presentation.xml.rels'), st = await xml(src, '[Content_Types].xml');
    const prefix = `study_${globalThis.crypto.randomUUID().replaceAll('-', '')}`;
    const map = (path) => `${prefix}/${path}`;
    // Copy the generated package's complete dependency graph. Relative links remain valid.
    for (const [path, f] of Object.entries(src.files)) {
        if (f.dir || path === '[Content_Types].xml' || path.startsWith('_rels/') || path.startsWith('docProps/'))
            continue;
        if (path.endsWith('.rels')) {
            const d = await xml(src, path);
            for (const r of Array.from(d.getElementsByTagNameNS(PKG, 'Relationship'))) {
                const target = r.getAttribute('Target') || '';
                if (r.getAttribute('TargetMode') !== 'External' && target.startsWith('/'))
                    r.setAttribute('Target', '/' + map(target.slice(1)));
            }
            dst.file(map(path), serialize(d));
        }
        else
            dst.file(map(path), await f.async('uint8array'));
    }
    for (const node of Array.from(st.documentElement.childNodes)) {
        if (node.nodeType !== 1)
            continue;
        const el = node;
        if (el.localName === 'Override') {
            const path = (el.getAttribute('PartName') || '').slice(1);
            if (!src.file(path) || path.startsWith('docProps/'))
                continue;
            const n = types.importNode(el, true);
            n.setAttribute('PartName', '/' + map(path));
            types.documentElement.appendChild(n);
        }
        if (el.localName === 'Default' && !Array.from(types.getElementsByTagNameNS(CT, 'Default')).some(n => n.getAttribute('Extension') === el.getAttribute('Extension')))
            types.documentElement.appendChild(types.importNode(el, true));
    }
    let list = pres.getElementsByTagNameNS(P, 'sldIdLst')[0];
    if (!list) {
        list = pres.createElementNS(P, 'p:sldIdLst');
        pres.documentElement.insertBefore(list, pres.getElementsByTagNameNS(P, 'sldSz')[0] || null);
    }
    const masterNodes = Array.from(sp.getElementsByTagNameNS(P, 'sldMasterId'));
    let masters = pres.getElementsByTagNameNS(P, 'sldMasterIdLst')[0];
    if (masterNodes.length && !masters) {
        masters = pres.createElementNS(P, 'p:sldMasterIdLst');
        pres.documentElement.insertBefore(masters, pres.documentElement.firstChild);
    }
    let masterNumber = Math.max(2147483647, ...Array.from(pres.getElementsByTagNameNS(P, 'sldMasterId')).map(n => Number(n.getAttribute('id')) || 2147483647)) + 1;
    for (const node of masterNodes) {
        const originalRel = Array.from(sr.getElementsByTagNameNS(PKG, 'Relationship')).find(n => n.getAttribute('Id') === node.getAttributeNS(R, 'id'));
        if (!originalRel)
            continue;
        const id = `rId_${prefix}_master_${masterNumber}`;
        const rel = rels.createElementNS(PKG, 'Relationship');
        rel.setAttribute('Id', id);
        rel.setAttribute('Type', `${R}/slideMaster`);
        const target = originalRel.getAttribute('Target') || '';
        rel.setAttribute('Target', '/' + map(target.startsWith('/') ? target.slice(1) : 'ppt/' + target));
        rels.documentElement.appendChild(rel);
        const master = pres.createElementNS(P, 'p:sldMasterId');
        master.setAttribute('id', String(masterNumber++));
        master.setAttributeNS(R, 'r:id', id);
        masters.appendChild(master);
    }
    let next = Math.max(255, ...Array.from(pres.getElementsByTagNameNS(P, 'sldId')).map(n => Number(n.getAttribute('id')) || 255)) + 1;
    const sourceRels = Array.from(sr.getElementsByTagNameNS(PKG, 'Relationship'));
    for (const node of Array.from(sp.getElementsByTagNameNS(P, 'sldId'))) {
        const oldId = node.getAttributeNS(R, 'id');
        const relation = sourceRels.find(n => n.getAttribute('Id') === oldId);
        if (!relation)
            throw new Error('The generated presentation is incomplete.');
        const id = `rId_${prefix}_${next}`;
        const rel = rels.createElementNS(PKG, 'Relationship');
        rel.setAttribute('Id', id);
        rel.setAttribute('Type', `${R}/slide`);
        const target = relation.getAttribute('Target') || '';
        const full = target.startsWith('/') ? target.slice(1) : 'ppt/' + target;
        rel.setAttribute('Target', '/' + map(full));
        rels.documentElement.appendChild(rel);
        const slide = pres.createElementNS(P, 'p:sldId');
        slide.setAttribute('id', String(next++));
        slide.setAttributeNS(R, 'r:id', id);
        list.appendChild(slide);
    }
    dst.file('ppt/presentation.xml', serialize(pres));
    dst.file('ppt/_rels/presentation.xml.rels', serialize(rels));
    dst.file('[Content_Types].xml', serialize(types));
    if (dst.file('docProps/app.xml')) {
        const app = await xml(dst, 'docProps/app.xml');
        const slides = app.getElementsByTagName('Slides')[0];
        if (slides)
            slides.textContent = String(pres.getElementsByTagNameNS(P, 'sldId').length);
        dst.file('docProps/app.xml', serialize(app));
    }
    return dst.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}
