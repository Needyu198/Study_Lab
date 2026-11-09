export function createRateLimiter({ maximum = 20, windowMs = 60_000 } = {}) {
    const buckets = new Map();
    return function isLimited(key) {
        const now = Date.now();
        const recent = (buckets.get(key) || []).filter(time => now - time < windowMs);
        recent.push(now);
        buckets.set(key, recent);
        return recent.length > maximum;
    };
}
