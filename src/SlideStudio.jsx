import { useEffect, useRef, useState } from 'react';
import { Upload, FilePlus2, FolderInput, ArrowUp, ArrowDown, Trash2, Download, ScanText, ImagePlus, Layers3 } from 'lucide-react';
import { readDraft, writeDraft } from './lib/studio-storage.js';
export default function SlideStudio({ subjectId, subjectName, onBusy }) {
    const [photos, setPhotos] = useState([]), [title, setTitle] = useState(subjectName + ' lecture'), [loaded, setLoaded] = useState(false);
    const [mode, setMode] = useState('new'), [layout, setLayout] = useState('photo'), [base, setBase] = useState();
    const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [draftStatus, setDraftStatus] = useState('Loading draft…');
    const [language, setLanguage] = useState('eng'), [selected, setSelected] = useState('');
    const alive = useRef(true), input = useRef(null);
    const current = photos.find(p => p.id === selected) || photos[0];
    useEffect(() => { alive.current = true; readDraft(subjectId).then(d => { if (alive.current) {
        if (d) {
            setPhotos(d.photos);
            setTitle(d.title);
        }
        setLoaded(true);
        setDraftStatus('Draft saved on this device');
    } }).catch(() => { if (alive.current) {
        setLoaded(true);
        setDraftStatus('Draft storage is unavailable. Download before leaving.');
    } }); return () => { alive.current = false; }; }, [subjectId]);
    useEffect(() => { onBusy(!!busy); return () => onBusy(false); }, [busy, onBusy]);
    useEffect(() => { if (!loaded)
        return; setDraftStatus('Saving draft…'); writeDraft(subjectId, { photos, title }).then(() => { if (alive.current)
        setDraftStatus('Draft saved on this device'); }).catch(() => { if (alive.current)
        setDraftStatus('Draft could not be saved. Download before leaving.'); }); }, [photos, title, loaded, subjectId]);
    useEffect(() => { if (!busy)
        return; const f = (e) => e.preventDefault(); window.addEventListener('beforeunload', f); return () => window.removeEventListener('beforeunload', f); }, [busy]);
    function patch(id, change) { setPhotos(old => old.map(p => p.id === id ? { ...p, ...change } : p)); setNotice(''); }
    async function addFiles(files) {
        if (!files?.length)
            return;
        setError('');
        setNotice('');
        setBusy('Preparing photos…');
        try {
            if (photos.length + files.length > 40)
                throw new Error('You can add up to 40 photos per batch.');
            const added = [];
            for (const file of Array.from(files)) {
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
                    throw new Error(`${file.name}: use JPG, PNG or WebP.`);
                if (file.size > 15 * 1024 * 1024)
                    throw new Error(`${file.name} is larger than 15 MB.`);
                const data = await imageData(file);
                added.push({ id: crypto.randomUUID(), name: file.name, ...data, title: file.name.replace(/\.[^.]+$/, ''), text: '', reviewed: false });
            }
            setPhotos(old => [...old, ...added]);
            if (!selected)
                setSelected(added[0].id);
        }
        catch (e) {
            setError(message(e));
        }
        finally {
            setBusy('');
            if (input.current)
                input.current.value = '';
        }
    }
    async function importBase(file) { if (!file)
        return; setBusy('Reading PowerPoint…'); setError(''); setBase(undefined); try {
        if (!file.name.toLowerCase().endsWith('.pptx'))
            throw new Error('Choose a .pptx file.');
        const { inspectDeck } = await import('./lib/slide-deck.js');
        setBase(await inspectDeck(await file.arrayBuffer(), file.name));
        setNotice('Existing slides will stay in their original order. New slides are added at the end.');
    }
    catch (e) {
        setError(message(e));
    }
    finally {
        setBusy('');
    } }
    async function extract() {
        if (!current)
            return;
        setBusy('Loading text recognition…');
        setError('');
        setNotice('');
        let worker;
        try {
            const { createWorker } = await import('tesseract.js');
            worker = await createWorker(language, 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr/core', langPath: '/ocr/languages', logger: m => { if (alive.current)
                    setBusy(`${m.status} ${Math.round((m.progress || 0) * 100)}%`); } });
            const { data } = await worker.recognize(current.data);
            const lines = data.text.trim().split('\n').filter(Boolean);
            patch(current.id, { text: lines.slice(1).join('\n'), title: lines[0] || current.title, confidence: data.confidence, reviewed: false });
            setLayout('editable');
            setNotice(data.text.trim() ? 'Text extracted. Compare it with the photo, correct any mistakes, then mark it reviewed.' : 'No clear text found. Enter the title and text manually or export the original photo.');
        }
        catch (e) {
            setError('Text extraction failed. You can retry or type the text manually. ' + message(e));
        }
        finally {
            await worker?.terminate();
            setBusy('');
        }
    }
    function move(id, delta) { setPhotos(old => { const next = [...old], i = next.findIndex(p => p.id === id), j = i + delta; if (j < 0 || j >= next.length)
        return old; [next[i], next[j]] = [next[j], next[i]]; return next; }); }
    async function download() { setBusy('Building your PowerPoint…'); setError(''); setNotice(''); try {
        if (!title.trim())
            throw new Error('Enter a presentation title.');
        if (mode === 'append' && !base)
            throw new Error('Choose the existing .pptx first.');
        if (layout === 'editable' && photos.some(p => !p.reviewed))
            throw new Error('Review the text of every photo before exporting editable slides.');
        const { makeDeck } = await import('./lib/slide-deck.js');
        const result = await makeDeck(photos, title, subjectName, layout === 'editable', mode === 'append' ? base : undefined);
        const blob = new Blob([result.bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (title.trim().replace(/[^\p{L}\p{N}_ -]/gu, '').slice(0, 100) || 'Lecture') + (mode === 'append' ? '_updated' : '') + '.pptx';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setNotice(`PowerPoint ready: ${result.count} slides${mode === 'append' ? `, including ${result.added} new slides` : ''}. Your download has started.`);
    }
    catch (e) {
        setError(message(e));
    }
    finally {
        setBusy('');
    } }
    return <section className="studio"><div className="page-heading"><div><div className="eyebrow">{subjectName} / SLIDE STUDIO</div><h1>From classroom to PowerPoint.</h1><p>Turn lecture photos into a new deck, or add them to one you already have.</p></div><span className="page-icon"><Layers3 size={28}/></span></div>
 <div className="studio-mode"><button disabled={!!busy} className={mode === 'new' ? 'chosen' : ''} onClick={() => setMode('new')}><FilePlus2 /><span><strong>Create new PowerPoint</strong><small>Start a presentation from your photos</small></span></button><button disabled={!!busy} className={mode === 'append' ? 'chosen' : ''} onClick={() => setMode('append')}><FolderInput /><span><strong>Add to existing PowerPoint</strong><small>Keep existing slides and append new ones</small></span></button></div>
 <div className="studio-settings"><label>Presentation title<input maxLength={120} value={title} disabled={!!busy || !loaded} onChange={e => setTitle(e.target.value)}/></label><label>Slide style<select value={layout} disabled={!!busy} onChange={e => setLayout(e.target.value)}><option value="photo">Original photos · one per slide</option><option value="editable">Editable text + source photo</option></select></label></div>
 {mode === 'append' && <div className="base-upload"><label className="button light"><FolderInput size={18}/>Choose existing .pptx<input type="file" accept=".pptx" disabled={!!busy} onChange={e => importBase(e.target.files?.[0])}/></label><span>{base ? `${base.name} · ${base.count} existing slides` : 'Up to 40 MB. The original file stays unchanged.'}</span></div>}
 <div className="upload-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy && loaded)
        addFiles(e.dataTransfer.files); }}><ImagePlus size={29}/><h3>Add your lecture photos</h3><p>Drop photos here, or choose files. JPG, PNG and WebP · up to 40 photos, 15 MB each.</p><button className="button primary" disabled={!!busy || !loaded} onClick={() => input.current?.click()}><Upload size={16}/>Choose photos</button><input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e => addFiles(e.target.files)}/></div>
 {error && <p className="studio-message problem" role="alert">{error}</p>}{notice && <p className="studio-message" role="status">{notice}</p>}{busy && <p className="studio-message" role="status" aria-live="polite">{busy}</p>}
 {photos.length > 0 && <><div className="section-heading"><div><h2>Review your slides <span className="count-pill">{photos.length}</span></h2><p>Use the arrows to change slide order. Select a photo to review or edit it.</p></div></div><div className="studio-editor"><div className="photo-list">{photos.map((p, i) => <div key={p.id} className={`photo-row ${current?.id === p.id ? 'selected' : ''}`}><button className="photo-select" disabled={!!busy} onClick={() => setSelected(p.id)}><img src={p.data} alt={`Slide ${i + 1}: ${p.name}`}/><span><strong>{i + 1}. {p.title}</strong><small>{p.reviewed ? 'Text reviewed' : p.text ? 'Text needs review' : 'Original photo'}</small></span></button><div className="photo-actions"><button title="Move up" aria-label={`Move slide ${i + 1} up`} disabled={!!busy || i === 0} onClick={() => move(p.id, -1)}><ArrowUp size={15}/></button><button title="Move down" aria-label={`Move slide ${i + 1} down`} disabled={!!busy || i === photos.length - 1} onClick={() => move(p.id, 1)}><ArrowDown size={15}/></button><button title="Remove photo" aria-label={`Remove slide ${i + 1}`} disabled={!!busy} onClick={() => setPhotos(old => old.filter(x => x.id !== p.id))}><Trash2 size={15}/></button></div></div>)}</div>
 {current && <div className="photo-detail"><img className="source-preview" src={current.data} alt={current.name}/><div className="ocr-controls"><label>Photo language<select value={language} disabled={!!busy} onChange={e => setLanguage(e.target.value)}><option value="eng">English</option><option value="mya">Myanmar</option><option value="eng+mya">English + Myanmar</option></select></label><button className="button light" disabled={!!busy} onClick={extract}><ScanText size={16}/>{current.text ? 'Re-extract text' : 'Extract text'}</button></div><p className="studio-hint">Text recognition may miss equations, handwriting or blurry text. Edit it below; diagrams remain in the source photo.</p><label>Slide title<input value={current.title} maxLength={200} disabled={!!busy} onChange={e => patch(current.id, { title: e.target.value, reviewed: false })}/></label><label>Editable text<textarea value={current.text} maxLength={15000} disabled={!!busy} rows={9} placeholder="Extract the text above, or type your slide content here." onChange={e => patch(current.id, { text: e.target.value, reviewed: false })}/></label>{current.confidence !== undefined && <p className="studio-hint">Recognition confidence: {Math.round(current.confidence)}%. Review the full text against the photo.</p>}<label className="review-checkbox"><input type="checkbox" checked={current.reviewed} disabled={!!busy} onChange={e => patch(current.id, { reviewed: e.target.checked })}/>I checked the title and text against the photo.</label></div>}</div></>}
 <div className="studio-bottom"><div><strong>{photos.length} photos ready</strong><p>{draftStatus}. Subjects and photo drafts stay in this browser.</p>{layout === 'editable' && <p>Long text is split across slides. {photos.filter(p => p.reviewed).length} of {photos.length} photos reviewed.</p>}</div><button className="button primary" disabled={!!busy || !photos.length || !loaded || (mode === 'append' && !base)} onClick={download}><Download size={17}/>{mode === 'new' ? 'Download PowerPoint' : 'Download updated PowerPoint'}</button></div></section>;
}
function message(e) { return e instanceof Error ? e.message : 'Something went wrong. Please try again.'; }
async function imageData(file) { const url = URL.createObjectURL(file); try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const ratio = Math.min(1, 2200 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx)
        throw new Error('This browser cannot process the photo.');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', .9), width: canvas.width, height: canvas.height };
}
finally {
    URL.revokeObjectURL(url);
} }
