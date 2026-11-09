import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Copy, FileText, Menu, MessageCircle, Plus, RefreshCw, Send, Square, Trash2, Upload, X } from 'lucide-react';
import { createConversation, loadConversations, makeId, saveConversations, titleFromMessage } from '../lib/chat-storage.js';
import { streamStudyReply } from '../lib/chat-service.js';
import { deleteServerConversation, loadServerConversations, loadServerLessons, saveServerConversation, uploadLessonFile } from '../lib/chat-api.js';

const suggestions = ['Explain syntax vs semantics', 'Quiz me about BNF', 'How does a compiler work?', 'Compare functional and imperative programming'];

export default function ChatPage({ subjectId, subjectName, topics = [] }) {
    const [conversations, setConversations] = useState([]);
    const [activeId, setActiveId] = useState('');
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [drawer, setDrawer] = useState(false);
    const [copied, setCopied] = useState('');
    const [backendMode, setBackendMode] = useState('connecting');
    const [uploadedLessons, setUploadedLessons] = useState([]);
    const [uploadBusy, setUploadBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const abortRef = useRef(null);
    const endRef = useRef(null);
    const fileRef = useRef(null);

    const subjectChats = conversations.filter(chat => chat.subjectId === subjectId);
    const active = conversations.find(chat => chat.id === activeId && chat.subjectId === subjectId) || subjectChats[0];

    useEffect(() => {
        const controller = new AbortController();
        let local = [];
        try { local = loadConversations(); setConversations(local); }
        catch { setError('Saved conversations could not be loaded. Check browser storage settings.'); }
        loadServerConversations(subjectId, controller.signal).then(async remote => {
            const localSubjectChats = local.filter(chat => chat.subjectId === subjectId);
            if (!remote.length && localSubjectChats.length) {
                for (const chat of localSubjectChats) await saveServerConversation(chat);
                setConversations(local);
            } else {
                const otherSubjects = local.filter(chat => chat.subjectId !== subjectId);
                setConversations([...remote, ...otherSubjects]);
                try { saveConversations([...remote, ...otherSubjects]); } catch { /* The server remains the source of truth. */ }
            }
            setUploadedLessons(await loadServerLessons(subjectId, controller.signal));
            setBackendMode('server');
        }).catch(reason => {
            if (reason?.name !== 'AbortError') setBackendMode('local');
        });
        return () => controller.abort();
    }, [subjectId]);

    useEffect(() => {
        if (subjectChats.length && !subjectChats.some(chat => chat.id === activeId)) setActiveId(subjectChats[0].id);
        if (!subjectChats.length) setActiveId('');
    }, [subjectId, conversations.length]);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [active?.messages.length, busy]);
    useEffect(() => () => abortRef.current?.abort(), []);

    function persist(next) {
        setConversations(next);
        try { saveConversations(next); setError(''); }
        catch { setError('This conversation could not be saved. Check browser storage settings.'); }
    }

    function newChat() {
        if (busy) return;
        const chat = createConversation(subjectId);
        persist([chat, ...conversations]);
        setActiveId(chat.id);
        setDraft('');
        setDrawer(false);
        if (backendMode === 'server') saveServerConversation(chat).catch(() => setError('The new chat is saved locally, but the server could not be reached.'));
    }

    function deleteChat(id) {
        if (busy) return;
        const next = conversations.filter(chat => chat.id !== id);
        persist(next);
        setActiveId(next.find(chat => chat.subjectId === subjectId)?.id || '');
        if (backendMode === 'server') deleteServerConversation(id).catch(() => setError('The conversation was removed locally, but could not be deleted from the server.'));
    }

    function updateChat(chatId, transform) {
        setConversations(current => {
            const next = current.map(chat => chat.id === chatId ? transform(chat) : chat);
            try { saveConversations(next); }
            catch { setError('This conversation could not be saved. Check browser storage settings.'); }
            return next;
        });
    }

    async function sendMessage(text = draft, retryChat = null) {
        const content = text.trim();
        if (!content || busy || content.length > 4000) return;
        let chat = retryChat || active;
        if (!chat) {
            chat = createConversation(subjectId, titleFromMessage(content));
            setActiveId(chat.id);
            persist([chat, ...conversations]);
        }
        const chatId = chat.id;
        const now = new Date().toISOString();
        const userMessage = retryChat ? retryChat.messages.at(-1) : { id: makeId('message'), role: 'user', content, createdAt: now, status: 'complete' };
        const assistantId = makeId('message');
        const assistantMessage = { id: assistantId, role: 'assistant', content: '', createdAt: now, status: 'streaming' };
        const previousMessages = retryChat ? chat.messages : [...chat.messages, userMessage];
        updateChat(chatId, current => ({ ...current, title: current.messages.length ? current.title : titleFromMessage(content), updatedAt: now, messages: retryChat ? [...retryChat.messages, assistantMessage] : [...current.messages, userMessage, assistantMessage] }));
        setDraft('');
        setBusy(true);
        setError('');
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            for await (const chunk of streamStudyReply({ question: content, subjectId, subjectName, conversationId: chatId, title: chat.messages.length ? chat.title : titleFromMessage(content), userMessageId: userMessage.id, assistantMessageId: assistantId, messages: previousMessages, topics, signal: controller.signal, useServer: backendMode === 'server' })) {
                updateChat(chatId, current => ({ ...current, messages: current.messages.map(message => message.id === assistantId ? { ...message, content: message.content + chunk } : message) }));
            }
            updateChat(chatId, current => ({ ...current, updatedAt: new Date().toISOString(), messages: current.messages.map(message => message.id === assistantId ? { ...message, status: 'complete' } : message) }));
        } catch (reason) {
            const stopped = reason?.name === 'AbortError';
            updateChat(chatId, current => ({ ...current, messages: current.messages.map(message => message.id === assistantId ? { ...message, status: stopped ? 'stopped' : 'failed', content: message.content || (stopped ? 'Response stopped.' : 'I couldn’t finish that response.') } : message) }));
            if (!stopped) setError(reason instanceof Error ? reason.message : 'The study assistant could not respond.');
        } finally {
            abortRef.current = null;
            setBusy(false);
        }
    }

    function retry() {
        if (!active) return;
        const lastUser = [...active.messages].reverse().find(message => message.role === 'user');
        if (!lastUser) return;
        const trailingAssistant = active.messages.at(-1)?.role === 'assistant';
        const retryChat = trailingAssistant ? { ...active, messages: active.messages.slice(0, -1) } : active;
        sendMessage(lastUser.content, retryChat);
    }

    async function copyMessage(message) {
        await navigator.clipboard.writeText(message.content);
        setCopied(message.id);
        setTimeout(() => setCopied(''), 1500);
    }

    async function importLesson(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (backendMode !== 'server') {
            setError('Start the Study Lab server before importing lesson files.');
            return;
        }
        setUploadBusy(true);
        setError('');
        setNotice('');
        try {
            const lesson = await uploadLessonFile(subjectId, file);
            setUploadedLessons(current => [lesson, ...current]);
            setNotice(`Created “${lesson.title}” with ${lesson.sections.length} lesson section${lesson.sections.length === 1 ? '' : 's'}. You can ask the Study Guide about it now.`);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'The lesson could not be imported.');
        } finally {
            setUploadBusy(false);
        }
    }

    return <section className="chat-page">
        <div className="chat-heading"><div><div className="eyebrow">YOUR STUDY GUIDE</div><h1>Ask. Understand. Keep going.</h1><p>Upload notes to create lessons, then ask questions using your Study Lab material.</p></div><div className="chat-heading-actions"><input ref={fileRef} type="file" hidden accept=".txt,.md,.markdown,.json,.csv,.docx,.pptx" onChange={importLesson}/><button className="button light" onClick={() => fileRef.current?.click()} disabled={uploadBusy || backendMode !== 'server'}><Upload size={16}/>{uploadBusy ? 'Creating lesson…' : 'Import lesson'}</button><button className="button primary" onClick={newChat} disabled={busy}><Plus size={16}/> New chat</button></div></div>
        {error && <div className="state-banner error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
        {notice && <div className="state-banner lesson-created" role="status"><Check size={16}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15}/></button></div>}
        <div className="chat-shell">
            {drawer && <button className="chat-drawer-backdrop" onClick={() => setDrawer(false)} aria-label="Close conversations"/>}
            <aside className={`chat-list ${drawer ? 'open' : ''}`}><div className="chat-list-title"><span>Conversations</span><button onClick={newChat} disabled={busy} aria-label="New chat"><Plus size={16}/></button></div>{subjectChats.length ? subjectChats.map(chat => <div className={`chat-list-row ${chat.id === active?.id ? 'active' : ''}`} key={chat.id}><button onClick={() => { setActiveId(chat.id); setDrawer(false); }}><MessageCircle size={14}/><span>{chat.title}<small>{chat.messages.length} messages</small></span></button><button className="chat-delete" onClick={() => deleteChat(chat.id)} aria-label={`Delete ${chat.title}`}><Trash2 size={14}/></button></div>) : <div className="chat-list-empty">No conversations for this subject yet.</div>}</aside>
            <div className="chat-main"><header className="chat-toolbar"><button className="chat-menu" onClick={() => setDrawer(true)} aria-label="Open conversations"><Menu size={18}/></button><span className="chat-bot"><Bot size={18}/></span><div><strong>{active?.title || 'New study chat'}</strong><small className={backendMode === 'local' ? 'offline' : ''}><i/> {subjectName} · {backendMode === 'connecting' ? 'connecting to server' : backendMode === 'server' ? 'database connected' : 'offline browser mode'}</small></div>{uploadedLessons.length > 0 && <span className="lesson-count"><FileText size={13}/>{uploadedLessons.length} uploaded</span>}{active && <button className="chat-toolbar-delete" disabled={busy} onClick={() => deleteChat(active.id)} aria-label="Delete conversation"><Trash2 size={16}/></button>}</header>
                <div className="chat-messages" aria-live="polite">{active?.messages.length ? active.messages.map((message, index) => <article className={`chat-message ${message.role}`} key={message.id}><span className="chat-message-avatar">{message.role === 'assistant' ? <Bot size={16}/> : 'HL'}</span><div><span className="chat-message-name">{message.role === 'assistant' ? 'Study guide' : 'You'}</span><p>{message.content}{message.status === 'streaming' && <span className="typing-caret"/>}</p>{message.role === 'assistant' && message.status !== 'streaming' && <div className="message-actions"><button onClick={() => copyMessage(message)}>{copied === message.id ? <Check size={13}/> : <Copy size={13}/>} {copied === message.id ? 'Copied' : 'Copy'}</button>{index === active.messages.length - 1 && <button onClick={retry} disabled={busy}><RefreshCw size={13}/> Retry</button>}{message.status === 'failed' && <span>Response failed</span>}</div>}</div></article>) : <div className="chat-welcome"><span><Bot size={28}/></span><h2>What would you like to understand?</h2><p>Ask about {subjectName}, request a comparison, or start a quick quiz.</p>{topics.length > 0 && <div className="chat-suggestions">{suggestions.map(item => <button key={item} onClick={() => sendMessage(item)}>{item}<Send size={13}/></button>)}</div>}</div>}<div ref={endRef}/></div>
                <div className="chat-composer"><div className="chat-input-wrap"><textarea rows="1" maxLength="4000" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder={`Ask about ${subjectName}…`} aria-label="Message Study Guide" disabled={busy}/>{busy ? <button className="send-button stop" onClick={() => abortRef.current?.abort()} aria-label="Stop generating"><Square size={15}/></button> : <button className="send-button" onClick={() => sendMessage()} disabled={!draft.trim()} aria-label="Send message"><Send size={16}/></button>}</div><small>Enter to send · Shift + Enter for a new line · Verify important information</small></div>
            </div>
        </div>
    </section>;
}
