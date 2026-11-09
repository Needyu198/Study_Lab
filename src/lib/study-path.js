export function nextUnreviewed(topics, progress, justReviewed) {
    return topics.find(t => t.id !== justReviewed && progress[`topic:${t.id}`] !== 1);
}
