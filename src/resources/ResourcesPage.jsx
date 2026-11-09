import { useEffect, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, File, FileText, Presentation, RefreshCw, Upload } from 'lucide-react';
import { importResource, listResources } from '../lib/resource-api.js';

function iconFor(type) {
    return type === 'book' ? BookOpen : type === 'powerpoint' ? Presentation : FileText;
}

function sizeLabel(bytes) {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ResourcesPage({ subjectId, subjectName, onOpenNotes }) {
    const [resources, setResources] = useState([]);
    const [status, setStatus] = useState('loading');
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    async function load(signal) {
        setStatus('loading');
        try { setResources(await listResources(subjectId, signal)); setStatus('ready'); }
        catch (reason) { if (reason?.name !== 'AbortError') { setError(reason.message); setStatus('error'); } }
    }
    useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [subjectId]);

    async function upload(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setStatus('uploading'); setError(''); setMessage('');
        try {
            setProgress(0);
            const result = await importResource(subjectId, file, setProgress);
            setMessage(`Saved ${file.name} and created the draft note “${result.note.title}”.`);
            await load();
        } catch (reason) { setError(reason.message); setStatus('error'); }
    }

    return <section className="resource-page"><div className="page-heading resource-heading"><div><div className="eyebrow">SOURCE LIBRARY / {subjectName}</div><h1>Your trusted study resources.</h1><p>Upload a book, PowerPoint or document. Study Lab saves the original and creates a reviewable study-note draft.</p></div><div className="resource-actions"><input ref={inputRef} hidden type="file" accept=".pdf,.pptx,.docx,.txt,.md,.markdown,.csv,.json" onChange={upload}/><button className="button primary" disabled={status === 'uploading'} onClick={() => inputRef.current?.click()}><Upload size={16}/>{status === 'uploading' ? progress > 0 && progress < 100 ? `Uploading ${Math.round(progress)}%` : 'Processing…' : 'Add resource'}</button></div></div>
        {message && <div className="state-banner"><CheckCircle2 size={17}/><span>{message}</span><button onClick={onOpenNotes}>Review note</button></div>}
        {error && <div className="state-banner error"><span>{error}</span><button onClick={() => load()}>Retry</button></div>}
        <div className="resource-summary"><div><strong>{resources.length}</strong><span>source files</span></div><div><strong>{resources.filter(item => item.status === 'ready').length}</strong><span>ready for notes</span></div><button className="text-button" onClick={onOpenNotes}>Open study notes</button></div>
        {status === 'loading' ? <div className="empty"><RefreshCw className="spin"/><p>Loading resources…</p></div> : resources.length ? <div className="resource-grid">{resources.map(resource => { const Icon = iconFor(resource.resourceType); return <article className="resource-card" key={resource.id}><span className={`resource-icon ${resource.resourceType}`}><Icon size={22}/></span><div><h3>{resource.filename}</h3><p>{resource.resourceType} · {sizeLabel(resource.byteSize)}</p><span className="resource-status"><i/>{resource.status} · included in study</span></div></article>; })}</div> : <div className="resource-empty"><span><File size={32}/></span><h2>Build this subject from your own sources.</h2><p>Add a textbook, lecture slides or notes. A draft study note will be created with source-linked sections.</p><button className="button primary" onClick={() => inputRef.current?.click()}><Upload size={16}/>Choose a source file</button><small>PDF, PowerPoint, Word, text and Markdown · up to 50 MB on Vercel</small></div>}
    </section>;
}
