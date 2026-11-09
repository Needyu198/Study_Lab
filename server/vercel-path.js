export function restoreApiUrl(req) {
    const incoming = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
    const queryPath = req.query?.path ?? incoming.searchParams.get('path') ?? '';
    const path = (Array.isArray(queryPath) ? queryPath.join('/') : String(queryPath)).replace(/^\/+/, '');
    incoming.searchParams.delete('path');
    const query = incoming.searchParams.toString();
    return `/api/${path}${query ? `?${query}` : ''}`;
}
