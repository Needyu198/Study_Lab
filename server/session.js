import { createHash, randomBytes } from 'node:crypto';

function parseCookies(value = '') {
    return Object.fromEntries(value.split(';').map(item => item.trim().split('=').map(decodeURIComponent)).filter(item => item.length === 2));
}

function hash(value) {
    return createHash('sha256').update(value).digest('hex');
}

export function createSessionService(repository, { secure = false } = {}) {
    return {
        async resolve(req) {
            const token = parseCookies(req.headers.cookie).study_lab_session;
            const existingUser = token ? await repository.userForSession(hash(token)) : null;
            if (existingUser) return { user: existingUser, cookie: null };

            const nextToken = randomBytes(32).toString('base64url');
            const created = await repository.createGuestSession(hash(nextToken));
            const securityFlag = secure ? '; Secure' : '';
            return {
                user: { id: created.userId, name: 'Study Lab guest' },
                cookie: `study_lab_session=${nextToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${securityFlag}`
            };
        }
    };
}
