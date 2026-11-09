import { useEffect, useState } from 'react';
import { ArrowRight, ArrowLeft, BookOpen, Check, CheckCircle2, ChevronRight, Circle, Code2, Command, Layers3, LayoutDashboard, ListChecks, Search, Shuffle, Sparkles, X, Menu, GraduationCap, RotateCcw, Clock3, BarChart3, Globe2, ExternalLink, Lightbulb, RefreshCw, CloudCheck, AlertCircle } from 'lucide-react';
import SlideStudio from './SlideStudio.jsx';
import SubjectHome from './SubjectHome.jsx';
import { topics, groups, sourceUrl } from './content.js';
import { loadProgress, saveProgressItem } from './lib/progress.js';
import { nextUnreviewed } from './lib/study-path.js';
const nav = [{ name: 'Overview', icon: LayoutDashboard }, { name: 'All topics', icon: BookOpen }, { name: 'Flashcards', icon: Layers3 }, { name: 'Practice', icon: ListChecks }, { name: 'Compare topics', icon: BarChart3 }, { name: 'Slide studio', icon: Layers3 }];
const allCards = topics.flatMap(t => t.cards.map((card, i) => ({ ...card, topic: t, key: `card:${t.id}:${i}` })));
const allQuestions = topics.flatMap(t => t.questions.map((question, i) => ({ ...question, topic: t, key: `question:${t.id}:${i}` })));
const reviewedCount = (p) => topics.filter(t => p[`topic:${t.id}`] === 1).length;
export default function StudyApp() {
    const [subjects, setSubjects] = useState([{ id: 'programming-languages', name: 'Programming Languages' }]);
    const [subjectId, setSubjectId] = useState('programming-languages');
    const [subjectForm, setSubjectForm] = useState(false);
    const [subjectName, setSubjectName] = useState('');
    const [studioBusy, setStudioBusy] = useState(false);
    const activeSubject = subjects.find(s => s.id === subjectId) || subjects[0];
    const isProgramming = activeSubject.id === 'programming-languages';
    useEffect(() => { try {
        const saved = JSON.parse(localStorage.getItem('study-lab-subjects') || '[]');
        if (Array.isArray(saved)) {
            const valid = saved.filter(s => s && typeof s.id === 'string' && typeof s.name === 'string' && s.id !== 'programming-languages');
            setSubjects([{ id: 'programming-languages', name: 'Programming Languages' }, ...valid]);
        }
    }
    catch { } }, []);
    function addSubject(e) { e.preventDefault(); const name = subjectName.trim(); if (!name)
        return; if (subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) {
        setError('That subject already exists. Choose it from the subject menu.');
        return;
    } const subject = { id: crypto.randomUUID(), name }; const updated = [...subjects, subject]; try {
        localStorage.setItem('study-lab-subjects', JSON.stringify(updated));
        setSubjects(updated);
        setSubjectId(subject.id);
        setView('Overview');
        setSubjectForm(false);
        setSubjectName('');
    }
    catch {
        setError('Could not save this subject in your browser. Please free some storage and retry.');
    } }
    const [view, setView] = useState('Overview');
    const [selected, setSelected] = useState(topics[0]);
    const [progress, setProgress] = useState({});
    const [status, setStatus] = useState('loading');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [my, setMy] = useState(false);
    const [mobile, setMobile] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('All topics');
    const [group, setGroup] = useState('All');
    const [toast, setToast] = useState('');
    const count = reviewedCount(progress), pct = Math.round(count / topics.length * 100);
    const next = nextUnreviewed(topics, progress);
    const cardsKnown = allCards.filter(c => progress[c.key] === 1).length;
    const answered = allQuestions.filter(q => progress[q.key] > 0).length;
    const correct = allQuestions.filter(q => progress[q.key] === 2).length;
    async function load() { setStatus('loading'); setError(''); try {
        setProgress(loadProgress());
        setStatus('ready');
    }
    catch {
        setStatus('error');
        setError('Your local progress could not be loaded. Check browser storage settings and retry.');
    } }
    useEffect(() => { load(); try {
        setMy(localStorage.getItem('au-language-my') === 'true');
    }
    catch { } }, []);
    useEffect(() => { if (!toast)
        return; const id = setTimeout(() => setToast(''), 3500); return () => clearTimeout(id); }, [toast]);
    async function save(key, value) { if (status !== 'ready' || saving)
        return false; setSaving(true); setError(''); try {
        const updated = saveProgressItem(key, value);
        setProgress(updated);
        return true;
    }
    catch {
        setError('This change was not saved. Check browser storage settings and try again.');
        return false;
    }
    finally {
        setSaving(false);
    } }
    function go(v) { if (studioBusy)
        return; setView(v); setMobile(false); setSearch(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    function open(t) { setSelected(t); go('Lesson'); }
    function toggleMy() { setMy(m => { try {
        localStorage.setItem('au-language-my', String(!m));
    }
    catch { } return !m; }); }
    async function mark(t, advance = false) { const key = `topic:${t.id}`; if (await save(key, advance ? 1 : progress[key] === 1 ? 0 : 1)) {
        setToast(advance || progress[key] !== 1 ? 'Topic reviewed. Nice work!' : 'Topic moved back to your study path.');
        if (advance) {
            const n = nextUnreviewed(topics, progress, t.id);
            if (n)
                open(n);
            else
                go('Overview');
        }
    } }
    const visible = topics.filter(t => (!search || [t.title, t.myTitle, t.description, t.group, ...t.sections.map(s => s.text)].join(' ').toLowerCase().includes(search.toLowerCase())) && (filter === 'All topics' || (filter === 'Reviewed' ? progress[`topic:${t.id}`] === 1 : progress[`topic:${t.id}`] !== 1)) && (group === 'All' || t.group === group));
    function TopicCard({ t, i }) { const done = progress[`topic:${t.id}`] === 1; return <article className={`topic-card ${done ? 'reviewed' : ''}`}><div className="topic-top"><span className={`topic-symbol g${groups.indexOf(t.group)}`}>{t.symbol}</span><span className={`topic-status ${done ? 'is-done' : ''}`}>{done ? <><Check size={12}/> Reviewed</> : next?.id === t.id ? <><span className="little-dot"/> Up next</> : `${String(i + 1).padStart(2, '0')}`}</span></div><button className="topic-title" onClick={() => open(t)}>{t.title}</button>{my && <p lang="my" className="my tiny">{t.myTitle}</p>}<p className="topic-desc">{t.description}</p><div className="topic-footer"><span><Clock3 size={13}/>{t.minutes} min</span><button onClick={() => open(t)} aria-label={`Open ${t.title}`}>{done ? 'Revisit' : 'Explore'} <ArrowRight size={15}/></button></div></article>; }
    function TopicList({ limit }) { return <>{groups.filter(g => group === 'All' || g === group).map((g, gi) => { let items = visible.filter(t => t.group === g); if (limit)
        items = items.slice(0, limit); if (!items.length)
        return null; return <section className="topic-group" key={g}><div className="group-title"><h3><span>0{gi + 1}</span> {g}</h3><span>{topics.filter(t => t.group === g && progress[`topic:${t.id}`] === 1).length} / {topics.filter(t => t.group === g).length} reviewed</span></div><div className="topic-grid">{items.map(t => <TopicCard key={t.id} t={t} i={topics.indexOf(t)}/>)}</div></section>; })}{!visible.length && <div className="empty"><Search /><h3>No topics found</h3><p>Try a different keyword or clear the filters.</p><button className="button light" onClick={() => { setSearch(''); setFilter('All topics'); setGroup('All'); }}>Clear filters</button></div>}</>; }
    return <div className="app-shell">
  {mobile && <button className="backdrop" aria-label="Close navigation" onClick={() => setMobile(false)}/>}
  <aside className={`sidebar ${mobile ? 'open' : ''}`}><a className="brand" href="#" onClick={e => { e.preventDefault(); go('Overview'); }}><span className="brand-symbol"><Code2 size={25}/></span><span>study<span className="brand-lab">lab</span><small>YOUR STUDY COMPANION</small></span></a>
  <div className="course-label"><span className="au-badge">AU</span><div>Assumption University<small>All your subjects, one space</small></div></div><div className="subject-picker"><label htmlFor="subject-select">CURRENT SUBJECT</label><select id="subject-select" value={subjectId} disabled={studioBusy} onChange={e => { setSubjectId(e.target.value); go('Overview'); }}>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button disabled={studioBusy} onClick={() => setSubjectForm(!subjectForm)}>+ Add subject</button>{subjectForm && <form onSubmit={addSubject}><label htmlFor="new-subject">Subject name</label><input id="new-subject" autoFocus required maxLength={80} placeholder="e.g. Artificial Intelligence" value={subjectName} onChange={e => setSubjectName(e.target.value)}/><button type="submit">Create subject</button><button type="button" onClick={() => setSubjectForm(false)}>Cancel</button></form>}</div>
  <div className="nav-caption">YOUR WORKSPACE</div><nav>{nav.filter(n => isProgramming || ['Overview', 'Slide studio'].includes(n.name)).map(n => <button disabled={studioBusy} key={n.name} onClick={() => go(n.name)} className={(view === n.name || (view === 'Lesson' && n.name === 'All topics')) ? 'active' : ''}><n.icon size={18}/><span>{n.name}</span>{n.name === 'All topics' && <small>{topics.length}</small>}{n.name === 'Overview' && view === 'Overview' && <span className="nav-dot"/>}</button>)}</nav>
  <div className="sidebar-note"><span className="note-icon"><Lightbulb size={19}/></span><h4>A little, every day.</h4><p>One concept at a time.<br />Understanding comes with practice.</p><div className="note-line"/></div>
  <div className="sidebar-bottom">{isProgramming && <><div className="sidebar-progress"><span>Your course progress</span><strong>{status === 'ready' ? `${pct}%` : '—'}</strong></div><div className="progress-track"><div style={{ width: `${pct}%` }}/></div><small>{status === 'ready' ? `${count} of ${topics.length} topics reviewed` : status === 'loading' ? 'Loading your study progress' : status === 'signin' ? 'Progress saved on this device' : 'Progress unavailable'}</small></>}<div className="profile"><span className="avatar">HL</span><div>Htin Aung Lynn<small>My learning space</small></div><GraduationCap size={19}/></div></div></aside>
  <div className="workspace"><header className="topbar"><div className="breadcrumbs"><button className="mobile-menu" aria-label="Open menu" onClick={() => setMobile(true)}><Menu size={21}/></button><span className="breadcrumb-root">My workspace</span><ChevronRight size={13}/><strong>{view === 'Lesson' ? selected.title : view}</strong></div><div className="header-actions"><button className={`language-toggle ${my ? 'on' : ''}`} onClick={toggleMy} aria-pressed={my}><Globe2 size={15}/><span>မြန်မာ support</span><span className="switch"><i /></span></button><span className="header-avatar">HL</span></div></header>
  <main>
  {status === 'loading' && <div className="state-banner"><RefreshCw size={16} className="spin"/> Loading your saved progress…</div>}
  {error && <div className="state-banner error" role="alert"><AlertCircle size={18}/><span>{error}</span>{status === 'error' ? <button onClick={load}>Retry</button> : <button aria-label="Dismiss message" onClick={() => setError('')}><X size={16}/></button>}</div>}
  {!isProgramming && view === 'Overview' && <SubjectHome name={activeSubject.name} onOpen={() => go('Slide studio')}/>}
  {view === 'Slide studio' && <SlideStudio key={subjectId} subjectId={subjectId} subjectName={activeSubject.name} onBusy={setStudioBusy}/>}
  {isProgramming && (view === 'Overview' || view === 'All topics') && <>
   <div className="page-heading"><div><div className="eyebrow">PROGRAMMING LANGUAGES / STUDY PATH</div><h1>{view === 'Overview' ? 'Your next chapter starts here.' : 'Your learning path.'}</h1><p>{view === 'Overview' ? 'A clearer understanding, one concept at a time.' : 'Build your understanding from the foundations up.'}</p>{my && <p className="my" lang="my">တစ်ခေါင်းစဉ်ချင်း လေ့လာပြီး နားလည်မှုကို တိုးတက်စေပါ။</p>}</div><span className="semester-label"><span className="little-dot"/> PERSONAL STUDY SPACE</span></div>
   {view === 'Overview' && <>
    <section className="hero"><div className="hero-content"><div className="hero-eyebrow"><span className="hero-dot"/>{count === topics.length ? 'LEARNING PATH COMPLETE' : count === 0 ? 'YOUR LEARNING JOURNEY' : 'PICK UP WHERE YOU LEFT OFF'}</div><h2>{count === topics.length ? <>All topics reviewed.<br />Keep your knowledge fresh.</> : <>Small steps.<br />Big understanding.</>}</h2><p>{count === topics.length ? 'Put your understanding to the test with a practice session.' : <>From your first concept to how compilers work.<br />Your next lesson is ready when you are.</>}</p><button className="button hero-button" disabled={status !== 'ready'} onClick={() => next ? open(next) : go('Practice')}>{next ? (count ? 'Continue learning' : 'Start learning') : 'Practice what you know'}<ArrowRight size={17}/></button><span className="hero-next">{next ? `NEXT UP · ${next.title}` : 'All 11 topics completed · You did it'}</span></div><div className="hero-art" aria-hidden="true"><span className="orbit orbit-one"/><span className="orbit orbit-two"/><span className="floating-bracket">{'{ }'}</span><div className="code-window"><div className="window-bar"><i /><i /><i /><span>my_learning.py</span></div><div className="window-code"><span className="code-comment"># a little progress, every day</span><br /><br /><span className="code-purple">while</span> curiosity:<br />&nbsp;&nbsp;learn(<span className="code-yellow">"something new"</span>)<br />&nbsp;&nbsp;practice()<br />&nbsp;&nbsp;understanding <span className="code-purple">+=</span> <span className="code-yellow">1</span><br /><br /><span className="code-comment"># keep going. you've got this.</span></div></div><div className="floating-check"><Check size={15}/> One concept closer</div><span className="art-star star-one">✦</span><span className="art-star star-two">✧</span></div></section>
    <div className="stats-grid"><div className="stat-card"><span className="stat-icon sage"><BookOpen size={20}/></span><div><span>Topics reviewed</span><strong>{status === 'ready' ? count : '—'} <small>/ {topics.length}</small></strong></div><span className="mini-ring" style={{ background: `conic-gradient(#718657 ${pct}%, #eceee6 0)` }}><i>{pct}%</i></span></div><button className="stat-card" onClick={() => go('Flashcards')}><span className="stat-icon sand"><Layers3 size={20}/></span><div><span>Flashcards learned</span><strong>{status === 'ready' ? cardsKnown : '—'} <small>/ {allCards.length}</small></strong></div><ArrowRight className="stat-arrow" size={17}/></button><button className="stat-card" onClick={() => go('Practice')}><span className="stat-icon lavender"><ListChecks size={20}/></span><div><span>Practice progress</span><strong>{status === 'ready' ? correct : '—'} <small>/ {allQuestions.length} correct</small></strong></div><ArrowRight className="stat-arrow" size={17}/></button></div>
   </>}
   <div className="section-heading"><div><h2>{view === 'Overview' ? 'Explore your topics' : 'All course topics'} <span className="count-pill">11</span></h2><p>{view === 'Overview' ? 'Follow the path, or explore a concept that sparks your curiosity.' : 'Reviewed topics are automatically skipped when you continue.'}</p></div>{view === 'Overview' && <button className="text-button" onClick={() => go('All topics')}>View study path <ArrowRight size={16}/></button>}</div>
   <div className="filterbar"><div className="tabs">{['All topics', 'To review', 'Reviewed'].map(f => <button className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)} key={f}>{f}{f === 'Reviewed' && <span>{count}</span>}</button>)}</div><label className="searchbox"><Search size={16}/><input placeholder="Search topics…" aria-label="Search topics" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={14}/></button>}</label>{view === 'All topics' && <select aria-label="Filter by unit" value={group} onChange={e => setGroup(e.target.value)}><option value="All">All units</option>{groups.map(g => <option key={g}>{g}</option>)}</select>}</div>
   <TopicList />
   <section className="study-banner"><div className="banner-icon"><Layers3 size={25}/></div><div><h3>Make it stick.</h3><p>A quick flashcard session turns a familiar concept into lasting knowledge.</p></div><button className="button light" onClick={() => go('Flashcards')}>Try flashcards <ArrowRight size={16}/></button></section>
   <div className="source-note"><BookOpen size={14}/><span>Built around your 27 saved lecture slides. BNF, semantics examples and compiler lessons extend the lecture notes.</span><a href={sourceUrl} target="_blank" rel="noreferrer">Open lecture deck <ExternalLink size={12}/></a></div>
  </>}
  {isProgramming && view === 'Lesson' && <div className="lesson-layout"><article className="lesson-main"><button className="back-link" onClick={() => go('All topics')}><ArrowLeft size={16}/>Back to topics</button><div className="eyebrow">{selected.group} <span> / </span> TOPIC {String(topics.indexOf(selected) + 1).padStart(2, '0')}</div><h1>{selected.title}</h1>{my && <p className="my lesson-my-title" lang="my">{selected.myTitle}</p>}<p className="lesson-intro">{selected.description}</p><div className="lesson-meta"><span><Clock3 size={14}/>{selected.minutes} min read</span><span><BookOpen size={14}/>{selected.source}</span></div>{selected.sections.map((s, i) => <section className="lesson-section" key={s.title}><h2><span>{i + 1}</span>{s.title}</h2><p>{s.text}</p>{my && <p className="my my-panel" lang="my">{s.my}</p>}</section>)}<div className="example"><div><Code2 size={15}/>{selected.codeLabel}</div><pre><code>{selected.code}</code></pre></div><div className="takeaway"><Lightbulb size={22}/><div><h3>One thing to remember</h3><p>{selected.takeaway}</p>{my && <p lang="my" className="my">{selected.myTakeaway}</p>}</div></div><div className="lesson-completion"><div><CheckCircle2 size={27}/><h3>{progress[`topic:${selected.id}`] === 1 ? 'You have reviewed this topic.' : 'Ready for the next concept?'}</h3><p>Continue skips every topic you have already reviewed.</p>{my && <p className="my" lang="my">လေ့လာပြီးတဲ့ ခေါင်းစဉ်တွေကို ကျော်ပြီး နောက်တစ်ခုကို ဆက်သွားပါမယ်။</p>}</div><button className="button primary" disabled={status !== 'ready' || saving} onClick={() => mark(selected, true)}>{saving ? 'Saving…' : progress[`topic:${selected.id}`] === 1 ? 'Continue to next topic' : 'Mark reviewed & continue'}<ArrowRight size={16}/></button><button className="text-button" disabled={status !== 'ready' || saving} onClick={() => mark(selected)}>{progress[`topic:${selected.id}`] === 1 ? 'Mark as not reviewed' : 'Mark reviewed & stay here'}</button></div></article><aside className="lesson-aside"><div className="path-card"><div className="eyebrow">YOUR STUDY PATH</div><h3>One concept at a time</h3>{topics.map((t, i) => <button className={t.id === selected.id ? 'current' : ''} key={t.id} onClick={() => open(t)}><span className={progress[`topic:${t.id}`] === 1 ? 'done' : ''}>{progress[`topic:${t.id}`] === 1 ? <Check size={13}/> : i + 1}</span><span>{t.title}</span></button>)}</div><div className="practice-nudge"><Sparkles size={22}/><h3>Put it into practice</h3><p>Check your understanding with a few questions.</p><button className="text-button" onClick={() => go('Practice')}>Open practice <ArrowRight size={15}/></button></div></aside></div>}
  {isProgramming && view === 'Flashcards' && <Flashcards my={my} progress={progress} save={save} enabled={status === 'ready' && !saving}/>}
  {isProgramming && view === 'Practice' && <Practice my={my} progress={progress} save={save} enabled={status === 'ready' && !saving}/>}
  {isProgramming && view === 'Compare topics' && <Comparisons my={my}/>}
  <footer><span><Code2 size={14}/> Study Lab <i>·</i> Made for your next “aha”.</span><span>{view !== 'Slide studio' && isProgramming && status === 'ready' ? <><CloudCheck size={14}/>{saving ? 'Saving progress…' : 'Progress saved on this device'}</> : <>English explanations · Myanmar support</>}</span></footer>
  </main></div>{toast && <div className="toast" role="status"><CheckCircle2 size={18}/>{toast}</div>}
 </div>;
}
function Flashcards({ my, progress, save, enabled }) {
    const [topic, setTopic] = useState('all');
    const [mode, setMode] = useState('All cards');
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [shuffled, setShuffled] = useState([]);
    const filtered = allCards.filter(c => (topic === 'all' || c.topic.id === topic) && (mode === 'All cards' || progress[c.key] !== 1));
    const deck = shuffled.length ? [...filtered].sort((a, b) => shuffled.indexOf(a.key) - shuffled.indexOf(b.key)) : filtered;
    const pos = Math.min(index, Math.max(deck.length - 1, 0));
    const card = deck[pos];
    const move = (n) => { setIndex((pos + n + deck.length) % deck.length); setFlipped(false); };
    function changeTopic(t) { setTopic(t); setIndex(0); setFlipped(false); }
    return <><div className="page-heading"><div><div className="eyebrow">A LITTLE ACTIVE RECALL</div><h1>Turn “I read it” into “I know it”.</h1><p>Think of an answer, flip the card, then decide what needs another look.</p>{my && <p className="my" lang="my">အဖြေကို အရင်စဉ်းစားပြီး ကတ်ကိုလှန်ကြည့်ပါ။</p>}</div><span className="page-icon"><Layers3 size={28}/></span></div><div className="tool-controls"><select value={topic} onChange={e => changeTopic(e.target.value)} aria-label="Flashcard topic"><option value="all">All topics</option>{topics.map(t => <option value={t.id} key={t.id}>{t.title}</option>)}</select><div className="tabs">{['All cards', 'Still learning'].map(m => <button key={m} className={m === mode ? 'selected' : ''} onClick={() => { setMode(m); setIndex(0); setFlipped(false); }}>{m}</button>)}</div><button className="text-button" onClick={() => { setShuffled([...allCards].map(c => ({ key: c.key, n: Math.random() })).sort((a, b) => a.n - b.n).map(c => c.key)); setIndex(0); setFlipped(false); }}><Shuffle size={15}/> Shuffle</button></div>
 {card ? <div className="flashcard-area"><div className="flashcard-meta"><span>{card.topic.group} <ChevronRight size={13}/> {card.topic.title}</span><span>{pos + 1} / {deck.length}</span></div><button className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(!flipped)} aria-label={flipped ? 'Show flashcard question' : 'Reveal flashcard answer'}><span className="flash-label">{flipped ? 'THE ANSWER' : 'THINK ABOUT IT'}</span><span className="flash-title">{flipped ? card.a : card.q}</span>{my && flipped && <span className="my" lang="my">{card.my}</span>}<span className="flip-hint"><RotateCcw size={15}/>{flipped ? 'Click to see the question' : 'Click to reveal answer'}<span className="key-cap">↵</span></span></button><div className="flash-actions"><button className="round-button" onClick={() => move(-1)} aria-label="Previous flashcard"><ArrowLeft size={20}/></button><div><button disabled={!enabled || !flipped} className="button light" onClick={async () => { if (await save(card.key, 0))
        move(1); }}><RotateCcw size={16}/>Still learning</button><button disabled={!enabled || !flipped} className="button primary" onClick={async () => { if (await save(card.key, 1)) {
        if (mode === 'All cards')
            move(1);
        else
            setFlipped(false);
    } }}><Check size={17}/>I know this</button></div><button className="round-button" onClick={() => move(1)} aria-label="Next flashcard"><ArrowRight size={20}/></button></div><p className="quiet centered">{progress[card.key] === 1 ? 'You have marked this card as learned.' : 'Reveal the answer before marking this card.'}</p></div> : <div className="empty"><CheckCircle2 size={40}/><h2>All cards in this set are learned.</h2><p>Choose another topic or revisit the full deck.</p><button className="button primary" onClick={() => setMode('All cards')}>View all cards</button></div>}<div className="learning-tip"><Lightbulb size={20}/><p><strong>Give your memory a moment.</strong> Try answering out loud before you flip. Knowing the reason matters more than remembering the words.</p></div></>;
}
function Practice({ my, progress, save, enabled }) {
    const [topic, setTopic] = useState('all');
    const [mode, setMode] = useState('All questions');
    const [index, setIndex] = useState(0);
    const [choice, setChoice] = useState(null);
    const [checked, setChecked] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const [result, setResult] = useState('');
    // Keep a session deck stable while an answer is saved.
    const [deckKeys, setDeckKeys] = useState(allQuestions.map(q => q.key));
    const deck = allQuestions.filter(q => deckKeys.includes(q.key));
    const q = deck[index];
    function reset() { setChoice(null); setChecked(false); setRevealed(false); setResult(''); }
    function buildDeck(t, m) { setTopic(t); setMode(m); setDeckKeys(allQuestions.filter(q => (t === 'all' || q.topic.id === t) && (m === 'All questions' || progress[q.key] !== 2)).map(q => q.key)); setIndex(0); reset(); }
    async function check() { if (choice === null)
        return; setChecked(true); if (enabled) {
        const ok = await save(q.key, choice === q.answer ? 2 : 1);
        setResult(ok ? 'Answer saved.' : 'Answer not saved. Use Save result to retry.');
    }
    else
        setResult('Progress unavailable; answer not saved. Use Save result when connected.'); }
    return <><div className="page-heading"><div><div className="eyebrow">CHECK YOUR UNDERSTANDING</div><h1>A little practice goes a long way.</h1><p>Apply what you know. Every answer comes with a clear explanation.</p>{my && <p className="my" lang="my">သိထားတာကို စမ်းသပ်ပါ။ အဖြေတိုင်းမှာ ရှင်းလင်းချက် ပါပါတယ်။</p>}</div><span className="page-icon"><ListChecks size={28}/></span></div><div className="tool-controls"><select aria-label="Practice topic" value={topic} onChange={e => buildDeck(e.target.value, mode)}><option value="all">All topics</option>{topics.map(t => <option value={t.id} key={t.id}>{t.title}</option>)}</select><div className="tabs">{['All questions', 'Needs practice'].map(m => <button className={mode === m ? 'selected' : ''} key={m} onClick={() => buildDeck(topic, m)}>{m}</button>)}</div><span className="quiet">{allQuestions.filter(x => progress[x.key] === 2).length} / {allQuestions.length} correct</span></div>
 {q ? <div className="quiz-layout"><section className="quiz-card"><div className="quiz-heading"><span className="pill">{q.topic.title}</span><span>Question {index + 1} of {deck.length}</span></div><div className="progress-track quiz-progress"><div style={{ width: `${(index + 1) / deck.length * 100}%` }}/></div><h2>{q.q}</h2><fieldset disabled={checked || revealed} aria-label="Answer choices">{q.options.map((o, i) => <button className={`answer ${choice === i ? 'chosen' : ''} ${(checked || revealed) && i === q.answer ? 'correct' : ''} ${checked && choice === i && i !== q.answer ? 'incorrect' : ''}`} key={o} onClick={() => setChoice(i)} aria-pressed={choice === i}><span className="answer-letter">{String.fromCharCode(65 + i)}</span><span>{o}</span>{(checked || revealed) && i === q.answer ? <CheckCircle2 size={19}/> : checked && choice === i ? <X size={19}/> : <Circle size={18}/>}</button>)}</fieldset>{(checked || revealed) && <div className={`answer-explanation ${checked && choice !== q.answer ? 'try-again' : ''}`} role="status"><h3>{revealed ? 'Answer explained' : choice === q.answer ? 'That’s right!' : 'A useful one to revisit.'}</h3><p><strong>Answer: {q.options[q.answer]}.</strong> {q.why}</p>{my && <p className="my" lang="my">{q.my}</p>}<small>{revealed ? 'Revealing an answer does not count as a correct attempt.' : result}</small></div>}<div className="quiz-actions">{!checked && !revealed ? <><button className="text-button" onClick={() => setRevealed(true)}>Reveal answer</button><button className="button primary" disabled={choice === null} onClick={check}>Check answer <ArrowRight size={16}/></button></> : <><button className="text-button" onClick={reset}><RotateCcw size={15}/>Try again</button>{checked && result.includes('not saved') && <button className="button light" disabled={!enabled} onClick={async () => { if (await save(q.key, choice === q.answer ? 2 : 1))
        setResult('Answer saved.'); }}>Save result</button>}<button className="button primary" onClick={() => { setIndex(index + 1); reset(); }}>{index === deck.length - 1 ? 'Finish session' : 'Next question'}<ArrowRight size={16}/></button></>}</div></section><aside className="quiz-aside"><div className="eyebrow">YOUR PRACTICE MAP</div><h3>Progress, not perfection.</h3><p>Choose any question to revisit it. Your most recent checked answer is saved.</p><div className="question-map">{deck.map((a, i) => <button aria-label={`Go to question ${i + 1}`} className={`${i === index ? 'current' : ''} ${progress[a.key] === 2 ? 'correct' : progress[a.key] === 1 ? 'needs-work' : ''}`} key={a.key} onClick={() => { setIndex(i); reset(); }}>{progress[a.key] === 2 ? <Check size={15}/> : i + 1}</button>)}</div><div className="map-legend"><span><i className="green"/>Correct</span><span><i className="gold"/>Revisit</span><span><i />Not answered</span></div></aside></div> : <div className="empty"><Sparkles size={42}/><h2>{deck.length ? 'Practice session complete.' : 'Nothing left in this set.'}</h2><p>{deck.length ? `${deck.filter(q => progress[q.key] === 2).length} of ${deck.length} questions in this set have a correct saved answer.` : 'All matching questions have a correct saved answer.'}</p><div className="empty-actions"><button className="button primary" onClick={() => buildDeck(topic, 'Needs practice')}>Practice missed questions</button><button className="button light" onClick={() => buildDeck(topic, 'All questions')}>Start a new session</button></div></div>}
 </>;
}
function Comparisons({ my }) {
    const [tab, setTab] = useState('Programming paradigms');
    const data = {
        'Programming paradigms': { cols: ['Paradigm', 'Main idea', 'Building blocks', 'Example'], rows: [['Imperative', 'Describe how to do it', 'Variables, assignment, control, sequencing', 'C · Python · Java'], ['Functional', 'Evaluate and compose functions', 'Pure functions, immutable values', 'Haskell · ML'], ['Logic', 'Describe facts and relationships', 'Facts, rules, queries', 'Prolog'], ['Object-oriented', 'Organize data with behavior', 'Classes, objects, methods', 'Java · C# · Python']], note: 'A language can support multiple paradigms. For example, Python supports imperative, functional and object-oriented styles. Functional and logic programming are often described as declarative.', my: 'Language တစ်ခုမှာ paradigm အမျိုးမျိုး ပါနိုင်ပါတယ်။ ဥပမာ Python ကို imperative၊ functional နဲ့ OOP style တွေဖြင့် ရေးနိုင်ပါတယ်။' },
        'Natural vs programming': { cols: ['Aspect', 'Natural language', 'Programming language'], rows: [['Purpose', 'Human communication', 'Express computations'], ['Examples', 'English · Myanmar', 'Python · Java · C'], ['Structure', 'Flexible; depends on context', 'Specified syntax rules'], ['Meaning', 'Can allow multiple interpretations', 'Defined by language semantics'], ['Understanding', 'People use context and shared knowledge', 'Implementations process code using formal rules']], note: 'Programming languages aim for predictable meaning, but grammar ambiguity can still arise and must be resolved by language rules. English-like keywords do not remove the need for a formal grammar.', my: 'Programming language က တိကျတဲ့ အဓိပ္ပာယ်ကို ရည်ရွယ်ပါတယ်။ English လို keyword တွေရှိသော်လည်း formal grammar လိုအပ်ပါတယ်။' },
        'Syntax vs semantics': { cols: ['Layer', 'Question it asks', 'Java example', 'Result'], rows: [['Syntax', 'Is the structure valid?', 'int = age 20;', 'Invalid declaration order'], ['Static semantics', 'Do the types and names fit?', 'int x = "hello";', 'Type mismatch'], ['Dynamic semantics', 'What happens when it runs?', 'x = x + 1;', 'Adds 1 and updates x'], ['Domain rules', 'Is it sensible for this application?', 'int age = -500;', 'Type-correct; reject as a human age']], note: 'These Java examples are independent snippets. “Negative age” is an application validation issue, not automatically a syntax or type error. Other languages can have different rules.', my: 'Negative age က application မှာ စစ်ရမယ့်ကိစ္စပါ။ Syntax သို့မဟုတ် type error လို့ အလိုလို မသတ်မှတ်ပါ။' },
        'Two sets of four': { cols: ['Imperative pillar', 'What it does', 'OOP concept', 'What it does'], rows: [['Variables', 'Store named values', 'Abstraction', 'Show essential features'], ['Assignment', 'Set or change values', 'Encapsulation', 'Group state and behavior; control access'], ['Control structures', 'Choose or repeat actions', 'Inheritance', 'Derive a class from another'], ['Sequencing', 'Order execution', 'Polymorphism', 'Common interface, different behaviors']], note: 'These are two separate sets of concepts, not one-to-one equivalents. OOP methods can themselves be written in an imperative style.', my: 'ဒီနှစ်စုံက သီးခြား concept တွေဖြစ်ပြီး တစ်ကြောင်းချင်း အဓိပ္ပာယ်တူတာ မဟုတ်ပါ။ OOP method ကို imperative style နဲ့ ရေးနိုင်ပါတယ်။' }
    };
    const d = data[tab];
    return <><div className="page-heading"><div><div className="eyebrow">SEE THE CONNECTIONS</div><h1>Different ideas. Clearer distinctions.</h1><p>Compare related concepts side by side, without getting them mixed up.</p></div><span className="page-icon"><BarChart3 size={28}/></span></div><div className="comparison-tabs tabs">{Object.keys(data).map(t => <button className={tab === t ? 'selected' : ''} key={t} onClick={() => setTab(t)}>{t}</button>)}</div><div className="comparison-card"><div className="comparison-heading"><h2>{tab}</h2><span>AT A GLANCE</span></div><div className="table-scroll"><table><thead><tr>{d.cols.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{d.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{j === 0 ? <strong>{v}</strong> : v}</td>)}</tr>)}</tbody></table></div><div className="comparison-note"><Lightbulb size={20}/><div><p>{d.note}</p>{my && <p lang="my" className="my">{d.my}</p>}</div></div></div><div className="concept-link"><span className="concept-box"><BookOpen />Language<small>Defines syntax & meaning</small></span><ArrowRight /><span className="concept-box"><Code2 />Compiler<small>Translates according to the rules</small></span><ArrowRight /><span className="concept-box"><Command />Target program<small>Runs on its target environment</small></span></div><p className="quiet centered">A simplified view. Target code may be machine code, bytecode or another language.</p></>;
}
