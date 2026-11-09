import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalReply, rankTopics } from '../src/lib/chat-service.js';

const topics = [{
    id: 'bnf', title: 'BNF grammar', group: 'Language mechanics', description: 'Describe valid program structure.',
    sections: [{ title: 'Production rules', text: 'BNF uses terminals and nonterminals in production rules.' }],
    takeaway: 'BNF describes syntax, not meaning.',
    questions: [{ q: 'What is a terminal?', options: ['A literal symbol', 'A category'], answer: 0 }]
}, {
    id: 'oop', title: 'Object-oriented programming', group: 'Programming paradigms', description: 'Combine data and behavior.',
    sections: [{ title: 'Encapsulation', text: 'Encapsulation controls access to state.' }],
    takeaway: 'Objects combine state and behavior.', questions: []
}];

test('ranks matching lesson topics first', () => {
    assert.equal(rankTopics('Explain BNF terminals', topics)[0].topic.id, 'bnf');
});

test('answers from matching lesson content', () => {
    const reply = createLocalReply('What are BNF production rules?', 'Programming Languages', topics);
    assert.match(reply, /terminals and nonterminals/i);
    assert.match(reply, /BNF describes syntax/i);
});

test('creates a lesson-based quiz', () => {
    const reply = createLocalReply('Quiz me about BNF', 'Programming Languages', topics);
    assert.match(reply, /What is a terminal/);
    assert.match(reply, /A\. A literal symbol/);
});

test('explains limitations for subjects without content', () => {
    assert.match(createLocalReply('Help me', 'Calculus', []), /does not have lesson material/i);
});
