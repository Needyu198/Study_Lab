export function sendJson(res, status, body, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(JSON.stringify(body));
}

export async function readJson(req, maximum = 20_000) {
    let body = '';
    for await (const chunk of req) {
        body += chunk;
        if (body.length > maximum) throw httpError(413, 'Request is too large.');
    }
    try {
        return JSON.parse(body || '{}');
    } catch {
        throw httpError(400, 'Request body must be valid JSON.');
    }
}

export function validText(value, maximum) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

export function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}
