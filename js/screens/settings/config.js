import { t } from '../../modules/i18n.js';

function groupDetails(key) {
    return Object.freeze({
        get title() {
            return t(`settings.group.${key}.title`);
        },
        get description() {
            return t(`settings.group.${key}.description`);
        },
    });
}

export const SETTINGS_GROUP_DETAILS = Object.freeze({
    overview: groupDetails('overview'),
    account: groupDetails('account'),
    status: groupDetails('status'),
    editor: groupDetails('editor'),
    filters: groupDetails('filters'),
    connection: groupDetails('connection'),
    profile: groupDetails('profile'),
    home: groupDetails('home'),
    menu: groupDetails('menu'),
    privacy: groupDetails('privacy'),
    ui: groupDetails('ui'),
    notifications: groupDetails('notifications'),
    storage: groupDetails('storage'),
    apps: groupDetails('apps'),
    api: groupDetails('api'),
    imposter: groupDetails('imposter'),
    resources: groupDetails('resources'),
    client: groupDetails('client'),
});

export function getSettingsGroupFromHash(hash = window.location.hash) {
    const match = /^#settings\/([a-z0-9_-]+)/i.exec(hash || '');
    return match ? match[1].toLowerCase() : 'overview';
}

export function normalizeDmInvitation(value) {
    if (value === 'always' || value === 'allow') return 'always';
    if (value === 'deny' || value === 'reject') return 'deny';
    return 'require_approval';
}

export function normalizeLargePostDisplay(value) {
    if (value === 'shrink') return 'shrink';
    return 'clamp';
}
