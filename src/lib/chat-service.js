const STOP_WORDS = new Set(['about', 'after', 'also', 'and', 'are', 'can', 'could', 'does', 'explain', 'for', 'from', 'give', 'how', 'into', 'its', 'me', 'of', 'please', 'the', 'this', 'to', 'what', 'when', 'why', 'with', 'would']);

function words(value) {
    return new Set(value.toLowerCase().match(/[a-z0-9+#]+/g)?.filter(word => word.length > 2 && !STOP_WORDS.has(word)) || []);
}

function topicText(topic) {
    return [topic.title, topic.description, topic.group, topic.takeaway, ...topic.sections.flatMap(section => [section.title, section.text])].join(' ');
}

export function rankTopics(question, topics) {
    const terms = words(question);
    return topics.map(topic => {
        const haystack = topicText(topic).toLowerCase();
        let score = 0;
        for (const term of terms) {
            if (topic.title.toLowerCase().includes(term)) score += 5;
            else if (topic.group.toLowerCase().includes(term)) score += 3;
            else if (haystack.includes(term)) score += 1;
        }
        return { topic, score };
    }).sort((a, b) => b.score - a.score);
}

export function createLocalReply(question, subjectName, topics = []) {
    const normalized = question.trim().toLowerCase();
    if (/^(hi|hello|hey|မင်္ဂလာပါ)\b/.test(normalized))
        return `Hello! I’m ready to help you study ${subjectName}. Ask me to explain a concept, compare two ideas, or quiz you.`;

    if (!topics.length)
        return `I can save our conversation for ${subjectName}, but this subject does not have lesson material yet. Add lesson content or connect the chat API to get subject-aware answers.`;

    const ranked = rankTopics(question, topics);
    const best = ranked[0];
    if (!best || best.score === 0) {
        const names = topics.slice(0, 6).map(topic => topic.title).join(', ');
        return `I couldn’t connect that question to the saved ${subjectName} lessons. Try mentioning a course topic, such as ${names}.`;
    }

    if (/\b(quiz|question|test me|practice)\b/.test(normalized)) {
        const questionItem = best.topic.questions?.[0];
        if (questionItem)
            return `Quick check — ${best.topic.title}\n\n${questionItem.q}\n\n${questionItem.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join('\n')}\n\nReply with the letter and explain your reasoning.`;
    }

    if (/\b(compare|difference|versus| vs)\b/.test(normalized) && ranked[1]?.score > 0) {
        const second = ranked[1].topic;
        return `${best.topic.title}: ${best.topic.description}\n\n${second.title}: ${second.description}\n\nKey distinction: ${best.topic.takeaway} ${second.takeaway}`;
    }

    const section = best.topic.sections.find(item => {
        const sectionWords = words(item.title);
        return [...sectionWords].some(word => normalized.includes(word));
    }) || best.topic.sections[0];
    return `${best.topic.title}\n\n${section.text}\n\nRemember: ${best.topic.takeaway}`;
}

async function* streamLocalReply(reply, signal) {
    const chunks = reply.match(/.{1,18}(?:\s|$)|\n/g) || [reply];
    for (const chunk of chunks) {
        if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
        await new Promise(resolve => setTimeout(resolve, 24));
        yield chunk;
    }
}

async function* streamRemoteReply(endpoint, payload, signal) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
        signal
    });
    if (!response.ok) throw new Error(`Chat service returned ${response.status}.`);
    if (!response.body) {
        const data = await response.json();
        yield data.content || data.message || '';
        return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        yield decoder.decode(value, { stream: true });
    }
}

export function streamStudyReply({ question, subjectId, subjectName, conversationId, title, userMessageId, assistantMessageId, messages, topics, signal, useServer }) {
    if (useServer) {
        const root = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
        return streamRemoteReply(`${root}/chat`, { content: question, subjectId, subjectName, conversationId, title, userMessageId, assistantMessageId, messages }, signal);
    }
    return streamLocalReply(createLocalReply(question, subjectName, topics), signal);
}
