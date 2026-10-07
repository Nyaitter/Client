const STORAGE_KEY = 'nyaitter-network-usage-v1';
const FIELDS = ['httpReceived', 'httpSent', 'realtimeReceived', 'realtimeSent', 'unmeasured', 'cached'];
const listeners = new Set();
let pending = {};
let flushTimer = null;
let started = false;
const empty = () => Object.fromEntries(FIELDS.map(key => [key, 0]));
const dateKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
function read() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const valid = {};
        for (const [day, values] of Object.entries(stored)) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !values) continue;
            valid[day] = Object.fromEntries(FIELDS.map(key => [key, Math.max(0, Number(values[key]) || 0)]));
        }
        return valid;
    } catch (_) { return {}; }
}
function combine(stored, extra) {
    for (const [day, values] of Object.entries(extra)) {
        stored[day] ||= empty();
        for (const key of FIELDS) stored[day][key] += values[key] || 0;
    }
    return stored;
}
function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    const values = combine(read(), pending);
    const retained = Object.fromEntries(Object.entries(values).sort(([a], [b]) => b.localeCompare(a)).slice(0, 62));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(retained)); pending = {}; }
    catch (_) { /* Keep this tab's counters when storage is unavailable. */ }
}
function record(field, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const day = dateKey();
    pending[day] ||= empty();
    pending[day][field] += amount;
    if (!flushTimer) flushTimer = setTimeout(flush, 500);
    for (const listener of listeners) listener();
}
function bodySize(body) {
    if (body == null) return 0;
    if (typeof body === 'string') return new TextEncoder().encode(body).byteLength;
    if (body instanceof Blob) return body.size;
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body.byteLength;
    if (body instanceof URLSearchParams) return bodySize(body.toString());
    if (body instanceof FormData) {
        let size = 0;
        for (const [key, value] of body) size += bodySize(key) + bodySize(value);
        return size;
    }
    return null;
}
export function getNetworkUsage() {
    const values = combine(read(), pending);
    const day = dateKey();
    const month = empty();
    for (const [key, value] of Object.entries(values)) {
        if (key.startsWith(day.slice(0, 7))) for (const field of FIELDS) month[field] += value[field];
    }
    return { today: values[day] || empty(), month };
}
export function subscribeNetworkUsage(listener) {
    listeners.add(listener);
    listener();
    return () => listeners.delete(listener);
}
export function resetNetworkUsage() {
    clearTimeout(flushTimer);
    flushTimer = null;
    pending = {};
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    for (const listener of listeners) listener();
}
export function trackRealtimeUsage(socket) {
    const send = socket.send.bind(socket);
    socket.send = data => {
        const result = send(data);
        const size = bodySize(data);
        if (size !== null) record('realtimeSent', size);
        return result;
    };
    socket.addEventListener('message', event => {
        const size = bodySize(event.data);
        if (size !== null) record('realtimeReceived', size);
    });
}
export function startNetworkUsageMeter() {
    if (started) return;
    started = true;
    if (typeof PerformanceObserver === 'function') {
        for (const type of ['resource', 'navigation']) {
            try {
                const observer = new PerformanceObserver(list => {
                    for (const entry of list.getEntries()) {
                        if (entry.transferSize > 0) record('httpReceived', entry.transferSize);
                        else if (entry.encodedBodySize > 0) record('cached', 1);
                        else record('unmeasured', 1);
                    }
                });
                observer.observe({ type, buffered: true });
            } catch (_) {}
        }
    }
    const originalFetch = globalThis.fetch;
    globalThis.fetch = function(input, init) {
        const result = originalFetch.call(this, input, init);
        const size = bodySize(init?.body);
        if (size === null || (!init?.body && input instanceof Request && input.body)) record('unmeasured', 1);
        else if (size > 0) record('httpSent', size);
        return result;
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    window.addEventListener('storage', event => {
        if (event.key === STORAGE_KEY) for (const listener of listeners) listener();
    });
}
