import { readJson, sendJson, validText } from '../http.js';

export async function handleConversationRoutes(req, res, url, context) {
    const { repository, user, headers } = context;

    if (url.pathname === '/api/conversations' && req.method === 'GET') {
        const subjectId = url.searchParams.get('subjectId');
        if (!validText(subjectId, 128)) sendJson(res, 400, { error: 'A valid subjectId is required.' }, headers);
        else sendJson(res, 200, { conversations: await repository.listConversations(user.id, subjectId) }, headers);
        return true;
    }

    if (url.pathname === '/api/conversations' && req.method === 'POST') {
        const body = await readJson(req);
        if (!validText(body.id, 128) || !validText(body.subjectId, 128) || !validText(body.title, 150)) {
            sendJson(res, 400, { error: 'id, subjectId and title are required.' }, headers);
            return true;
        }
        const conversation = await repository.upsertConversation({ id: body.id, userId: user.id, subjectId: body.subjectId, title: body.title });
        if (!conversation) {
            sendJson(res, 409, { error: 'Conversation ID is already in use.' }, headers);
            return true;
        }
        await importMessages(repository, conversation.id, body.messages);
        sendJson(res, 201, { conversation: { ...conversation, messages: [] } }, headers);
        return true;
    }

    const deleteMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
        const deleted = await repository.deleteConversation(decodeURIComponent(deleteMatch[1]), user.id);
        sendJson(res, deleted ? 200 : 404, deleted ? { deleted: true } : { error: 'Conversation not found.' }, headers);
        return true;
    }

    return false;
}

async function importMessages(repository, conversationId, messages) {
    if (!Array.isArray(messages) || messages.length > 200) return;
    for (const message of messages) {
        const validRole = ['user', 'assistant'].includes(message.role);
        const validContent = typeof message.content === 'string' && message.content.length <= 20_000;
        if (!validText(message.id, 128) || !validRole || !validContent) continue;
        const status = ['streaming', 'complete', 'failed', 'stopped'].includes(message.status) ? message.status : 'complete';
        await repository.insertMessage({ ...message, conversationId, status });
    }
}
