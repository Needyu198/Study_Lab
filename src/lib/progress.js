import { topics } from '../content.js';
const STORAGE_KEY = 'study-lab-progress';
const validKeys = new Set(topics.flatMap(topic => [
  `topic:${topic.id}`,
  ...topic.cards.map((_, index) => `card:${topic.id}:${index}`),
  ...topic.questions.map((_, index) => `question:${topic.id}:${index}`),
]));
const validItem = (key, value) => validKeys.has(key) && [0, 1, 2].includes(value)
  && (key.startsWith('question:') || value <= 1);

// Replace these functions with API calls if you add account synchronization.
export function loadProgress(storage = globalThis.localStorage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid progress data');
  return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => validItem(key, value)));
}
export function saveProgressItem(key, value, storage = globalThis.localStorage) {
  if (!validItem(key, value)) throw new Error('Invalid progress item');
  const progress = { ...loadProgress(storage), [key]: value };
  storage.setItem(STORAGE_KEY, JSON.stringify(progress));
  return progress;
}
