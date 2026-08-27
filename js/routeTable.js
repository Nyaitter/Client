/**
 * Declarative hash route definitions.
 *
 * Matching and access checks live here so the router only coordinates the
 * transition. Screen modules remain responsible for rendering and data work.
 */

const route = (name, match, options = {}) => ({
    name,
    match,
    requiresAuth: false,
    requiresAdmin: false,
    ...options,
});

export const ROUTES = [
    route('post-activity', /^#\/?post\/(\d+)\/activity(?:\/([^/]+))?$/i, {
        parse: (match) => ({ postId: match[1], tab: match[2] || 'quotes' }),
    }),
    route('post-detail', /^#\/?post\/(\d+)$/i, {
        parse: (match) => ({ postId: match[1] }),
    }),
    route('post-detail', (hash) => hash.startsWith('#post/'), {
        parse: (hash) => ({ rawId: hash.substring(6).split('/')[0] }),
    }),
    route('profile', (hash) => hash.startsWith('#profile/'), {
        requiresAuth: true,
        parse: (hash) => {
            const path = hash.substring(9);
            const userId = parseInt(path, 10);
            const subpageMatch = path.match(/\/(.+)/);
            return {
                userId: Number.isNaN(userId) ? null : userId,
                subpage: subpageMatch ? subpageMatch[1] : 'posts',
            };
        },
    }),
    route('search', (hash) => hash.startsWith('#search/'), {
        parse: (hash) => ({ query: decodeURIComponent(hash.substring(8)) }),
    }),
    route('admin-report-detail', (hash) => hash.startsWith('#admin/reports/'), {
        requiresAuth: true,
        requiresAdmin: true,
        parse: (hash) => ({ reportId: hash.substring('#admin/reports/'.length) }),
    }),
    route('admin-reports', '#admin/reports', { requiresAuth: true, requiresAdmin: true }),
    route('admin-logs', '#admin/logs', { requiresAuth: true, requiresAdmin: true }),
    route('groups', '#groups', { requiresAuth: true }),
    route('group-detail', (hash) => hash.startsWith('#group/'), {
        requiresAuth: true,
        parse: (hash) => {
            const [groupId, section = 'overview'] = hash.substring('#group/'.length).split('/');
            return { groupId, section };
        },
    }),
    route('dm', '#dm', { requiresAuth: true }),
    route('dm', (hash) => hash.startsWith('#dm/'), {
        requiresAuth: true,
        parse: (hash) => ({ dmId: hash.substring(4) }),
    }),
    route('settings', (hash) => hash === '#settings' || hash.startsWith('#settings/'), {
        requiresAuth: true,
        parse: (hash) => ({ hash }),
    }),
    route('login-approval', (hash) => hash.startsWith('#login-approval/'), {
        requiresAuth: true,
        parse: (hash) => ({ approvalId: hash.substring('#login-approval/'.length) }),
    }),
    route('explore', '#explore'),
    route('notifications', '#notifications', { requiresAuth: true }),
    route('likes', '#likes', { requiresAuth: true }),
    route('stars', '#stars', { requiresAuth: true }),
    route('rule', (hash) => hash === '#rule' || hash === '#rules'),
    route('docs-api', (hash) => hash === '#docs/api' || hash.startsWith('#docs/api/') || hash === '#api/docs'),
    route('doc-detail', (hash) => hash.startsWith('#docs/') && hash !== '#docs/' && hash !== '#docs', {
        parse: (hash) => ({ docId: hash.substring('#docs/'.length).split('/')[0] }),
    }),
    route('docs-portal', (hash) => hash === '#docs' || hash === '#docs/'),
    route('nyaitter-auth', (hash) => (
        hash.startsWith('#nyaitter-auth') ||
        hash.startsWith('#auth/authorize') ||
        hash.startsWith('#oauth/authorize')
    )),
];

function matches(routeDefinition, hash) {
    if (typeof routeDefinition.match === 'string') {
        return routeDefinition.match === hash ? {} : null;
    }
    const isRegExp = routeDefinition.match instanceof RegExp;
    const result = isRegExp ? hash.match(routeDefinition.match) : routeDefinition.match(hash);
    if (!result) return null;
    return routeDefinition.parse ? routeDefinition.parse(isRegExp ? result : hash) : {};
}

export function resolveRoute(hash, currentUser) {
    for (const routeDefinition of ROUTES) {
        const params = matches(routeDefinition, hash);
        if (!params) continue;
        if (routeDefinition.requiresAuth && !currentUser) return null;
        if (routeDefinition.requiresAdmin && !currentUser?.admin) return null;
        return { ...routeDefinition, params };
    }
    return null;
}
