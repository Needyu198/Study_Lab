import { useEffect, useState } from 'react';
import { BookOpen, Check, FileText, Layers3, ListChecks, Save, Send } from 'lucide-react';
import { listStudyNotes, publishStudyNote, saveStudyNote } from '../lib/resource-api.js';

export default function StudyNotesPage({ subjectId, subjectName, onOpenResources, onOpenChat }) {
    const [notes, setNotes] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const selected = notes.find(note => note.id === selectedId) || notes[0];

    useEffect(() => { const controller = new AbortController(); listStudyNotes(subjectId, controller.signal).then(items => { setNotes(items); setSelectedId(items[0]?.id || ''); }).catch(reason => { if (reason?.name !== 'AbortError') setError(reason.message); }); return () => controller.abort(); }, [subjectId]);
    useEffect(() => { setDraft(selected ? structuredClone(selected) : null); }, [selected?.id, selected?.updatedAt]);

    function updateSection(index, field, value) {
        setDraft(current => ({ ...current, sections: current.sections.map((section, position) => position === index ? { ...section, [field]: value } : section) }));
    }
    async function save() {
        setBusy(true); setError('');
        try { const note = await saveStudyNote(draft); setNotes(current => current.map(item => item.id === note.id ? note : item)); }
        catch (reason) { setError(reason.message); }
        finally { setBusy(false); }
    }
    async function publish() {
        setBusy(true); setError('');
        try { const note = await publishStudyNote(draft.id); setNotes(current => current.map(item => item.id === note.id ? note : item)); }
        catch (reason) { setError(reason.message); }
        finally { setBusy(false); }
    }

    if (!draft) return <section><div className="page-heading"><div><div className="eyebrow">STUDY NOTES / {subjectName}</div><h1>Your reviewed learning layer.</h1><p>Published notes become the foundation for chat, flashcards and practice.</p></div></div><div className="resource-empty"><BookOpen size={34}/><h2>No study notes yet.</h2><p>Add a source resource first; Study Lab will create a draft for review.</p><button className="button primary" onClick={onOpenResources}>Add resources</button></div></section>;

    const cards = draft.artifacts.filter(item => item.type === 'flashcard');
    const questions = draft.artifacts.filter(item => item.type === 'question');
    return <section className="notes-page"><div className="page-heading"><div><div className="eyebrow">STUDY NOTES / {subjectName}</div><h1>Review before you rely on it.</h1><p>Only published notes are used as the trusted source for Study Chat and generated study material.</p></div><span className={`note-status ${draft.status}`}>{draft.status}</span></div>{error && <div className="state-banner error">{error}</div>}
        <div className="notes-layout"><aside className="notes-list"><div className="notes-list-title">STUDY NOTES <button onClick={onOpenResources}>+ Add source</button></div>{notes.map(note => <button className={note.id === draft.id ? 'active' : ''} key={note.id} onClick={() => setSelectedId(note.id)}><FileText size={15}/><span>{note.title}<small>{note.status} · version {note.version}</small></span></button>)}</aside>
            <article className="note-editor"><label>NOTE TITLE<input disabled={draft.status === 'published'} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })}/></label><label>OVERVIEW<textarea disabled={draft.status === 'published'} rows="3" value={draft.summary} onChange={event => setDraft({ ...draft, summary: event.target.value })}/></label><div className="note-sections">{draft.sections.map((section, index) => <section key={section.id}><div className="note-section-heading"><span>{index + 1}</span><input disabled={draft.status === 'published'} value={section.title} onChange={event => updateSection(index, 'title', event.target.value)}/><small>Source: {section.sourceFilename ? `${section.sourceFilename} · ${section.sourceLocation}` : 'manual section'}</small></div><textarea disabled={draft.status === 'published'} rows="6" value={section.content} onChange={event => updateSection(index, 'content', event.target.value)}/></section>)}</div>
                <div className="note-actions">{draft.status === 'draft' ? <><button className="button light" disabled={busy} onClick={save}><Save size={15}/>Save draft</button><button className="button primary" disabled={busy} onClick={publish}><Check size={15}/>Publish note</button></> : <button className="button primary" onClick={onOpenChat}><Send size={15}/>Ask Study Chat</button>}</div>
                {draft.status === 'published' && <div className="generated-material"><h2>Generated from this published note</h2><div><article><Layers3/><strong>{cards.length} flashcards</strong>{cards.slice(0, 3).map(card => <p key={card.id}>{card.question}</p>)}</article><article><ListChecks/><strong>{questions.length} practice questions</strong>{questions.slice(0, 3).map(question => <p key={question.id}>{question.prompt}</p>)}</article></div></div>}
            </article></div>
    </section>;
}
