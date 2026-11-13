import { t } from './i18n.js';
import { getCurrentUser, getAllUsersCache } from '../state.js';
import { attachRankAvatar } from './rankAvatar.js';
import { getRankAppearance, RANK_TYPES } from './rankAvatar.js';

const SELECTOR = 'img[data-rank-avatar]';
const PORTAL = '.rank-avatar-layer, .rank-avatar-tooltip, .rank-avatar-panel';
const records = new Map();
const users = new Map();
let started = false;
let observer;
let intersections;
let resize;
let frame = 0;
let viewerId = null;
let preference;

const userId = value => {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
};

function publicRankSource(user) {
    if (user && Object.hasOwn(user, 'display_ranks')) return user;
    const cached = getAllUsersCache().get(userId(user?.id ?? user?.user_id));
    return cached && Object.hasOwn(cached, 'display_ranks') ? cached : null;
}

function publicRanks(user) {
    const value = publicRankSource(user)?.display_ranks;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(RANK_TYPES.filter(type => getRankAppearance(type, value[type])).map(type => [type, value[type]]));
}

function ranksFromImage(image) {
    return Object.fromEntries(RANK_TYPES.flatMap(type => {
        const value = image.getAttribute(`data-rank-${type}`);
        const id = type === 'trust' ? value : (/^[0-5]$/.test(value ?? '') ? Number(value) : null);
        return getRankAppearance(type, id) ? [[type, id]] : [];
    }));
}

function removeRecord(image, record) {
    record.handle?.destroy();
    intersections?.unobserve(image);
    records.delete(image);
    const group = users.get(record.userId);
    group?.delete(image);
    if (!group?.size) users.delete(record.userId);
}

function syncImage(image, record) {
    if (!image.isConnected || !image.matches(SELECTOR)) {
        removeRecord(image, record);
        return;
    }
    const id = userId(image.dataset.rankUserId);
    if (id !== record.userId) {
        const old = users.get(record.userId);
        old?.delete(image);
        if (!old?.size) users.delete(record.userId);
        record.userId = id;
        if (!users.has(id)) users.set(id, new Set());
        users.get(id).add(image);
    }
    const current = getCurrentUser();
    const enabled = userId(current?.id) !== null && (preference ?? current?.settings?.show_ranks) === true;
    const eligible = enabled && id !== null && id !== userId(current?.id) &&
        !image.closest('.profile-morph-anchor');
    // 画面外に出ても既存のリングは DOM 内に残す（スクロールで自然に隠れる）。
    // 可視判定は生成の遅延だけに使い、破棄には使わない（IO の一時的な外れで付け外しが暴れるのを防ぐ）。
    if (eligible && !record.visible) {
        record.handle?.refresh();
        return;
    }
    const ranks = eligible ? ranksFromImage(image) : {};
    if (!eligible || !Object.keys(ranks).length) {
        record.handle?.destroy();
        record.handle = null;
        record.signature = null;
        return;
    }
    const signature = JSON.stringify([id, ranks]);
    if (!record.handle || record.signature !== signature) {
        const container = image.closest('.dm-message-container, .call-person, .call-message');
        const candidate = image.closest('a[href], button');
        const focusTarget = candidate && !candidate.closest('[aria-hidden="true"]')
            ? candidate : container?.querySelector('.dm-user-name[href]') || container;
        const options = {
            enabled: true, isSelf: false, ranks, focusTarget,
            label: t('rankavatarintegration.user_rank_label', { id }),
        };
        if (record.handle) record.handle.update(options);
        else record.handle = attachRankAvatar(image, options);
        record.signature = signature;
    } else record.handle.refresh();
}

function flush() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    for (const [image, record] of records) {
        // 画面外で未描画のものは表示領域に入るまで同期を省く（入った時点で再同期される）。
        if (record.visible === false && !record.handle) {
            if (!image.isConnected) removeRecord(image, record);
            continue;
        }
        syncImage(image, record);
    }
}

export function refreshRankAvatars() {
    if (!started || frame) return;
    frame = window.requestAnimationFrame(flush);
}

function discover(root) {
    if (root.nodeType !== 1 || root.closest(PORTAL)) return;
    const add = image => {
        if (records.has(image) || image.closest('.profile-morph-anchor')) return;
        const id = userId(image.dataset.rankUserId);
        const cached = getAllUsersCache().get(id);
        if (image.getAttribute('data-rank-avatar') === 'pending' && publicRankSource(cached)) {
            writeRanks(image, publicRanks(cached));
        }
        const record = { handle: null, signature: null, visible: !intersections, userId: id };
        records.set(image, record);
        if (!users.has(record.userId)) users.set(record.userId, new Set());
        users.get(record.userId).add(image);
        intersections?.observe(image);
    };
    if (root.matches(SELECTOR)) add(root);
    root.querySelectorAll(SELECTOR).forEach(add);
}

function start() {
    if (started || typeof document === 'undefined') return;
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', start, { once: true });
        return;
    }
    started = true;
    if (typeof IntersectionObserver === 'function') {
        intersections = new IntersectionObserver(entries => {
            for (const entry of entries) {
                const record = records.get(entry.target);
                if (record) record.visible = entry.isIntersecting;
            }
            refreshRankAvatars();
        });
    }
    observer = new MutationObserver(mutations => {
        let dirty = false;
        for (const mutation of mutations) {
            const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
            if (target?.closest(PORTAL)) continue;
            if (mutation.type === 'characterData') {
                dirty = true;
                continue;
            }
            if (mutation.type === 'attributes') {
                if (mutation.target.matches(SELECTOR) && !records.has(mutation.target)) discover(mutation.target);
                dirty = true;
            } else {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1 || node.matches(PORTAL)) continue;
                    discover(node);
                    dirty = true;
                }
                if ([...mutation.removedNodes].some(node => node.nodeType === 1 && !node.matches(PORTAL))) dirty = true;
                if ([...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === 3)) dirty = true;
            }
        }
        if (dirty) refreshRankAvatars();
    });
    observer.observe(document.body, {
        childList: true, subtree: true, attributes: true, characterData: true,
        attributeFilter: ['data-rank-avatar', 'data-rank-user-id', 'data-rank-trust', 'class', 'style', 'hidden', 'aria-hidden', 'src'],
    });
    resize = new ResizeObserver(refreshRankAvatars);
    resize.observe(document.body);
    document.addEventListener('rank-display-preference-change', event => {
        if (typeof event.detail?.enabled !== 'boolean') return;
        preference = event.detail.enabled;
        refreshRankAvatars();
    });
    document.addEventListener('current-user-change', () => syncRankAvatarSession({ resetPreference: true }));
    document.addEventListener('load', refreshRankAvatars, true);
    discover(document.body);
    syncRankAvatarSession();
}

export function syncRankAvatarSession({ resetPreference = false } = {}) {
    start();
    const nextId = userId(getCurrentUser()?.id);
    if (nextId !== viewerId || resetPreference) {
        viewerId = nextId;
        preference = undefined;
    }
    if (started) flush();
}

export function updateRankAvatarUser(user) {
    const id = userId(user?.id);
    if (!id || !Object.hasOwn(user, 'display_ranks')) return;
    const ranks = publicRanks(user);
    for (const image of users.get(id) || []) writeRanks(image, ranks);
    refreshRankAvatars();
}

function writeRanks(image, ranks, resolved = true) {
    const status = resolved ? '' : 'pending';
    if (image.getAttribute('data-rank-avatar') !== status) image.setAttribute('data-rank-avatar', status);
    for (const type of RANK_TYPES) {
        const value = ranks[type];
        const attribute = `data-rank-${type}`;
        if (value === undefined) {
            if (image.hasAttribute(attribute)) image.removeAttribute(attribute);
        } else if (image.getAttribute(attribute) !== String(value)) image.setAttribute(attribute, String(value));
    }
}

export function registerRankAvatar(image, user) {
    start();
    const id = userId(user?.id ?? user?.user_id);
    if (!id) {
        image.removeAttribute('data-rank-avatar');
        return;
    }
    image.dataset.rankUserId = String(id);
    writeRanks(image, publicRanks(user), Boolean(publicRankSource(user)));
    if (image.isConnected) {
        discover(image);
        refreshRankAvatars();
    }
}

export function rankAvatarAttributes(user) {
    start();
    const id = userId(user?.id ?? user?.user_id);
    if (!id) return '';
    const ranks = publicRanks(user);
    return `data-rank-avatar="${publicRankSource(user) ? '' : 'pending'}" data-rank-user-id="${id}" ${Object.entries(ranks).map(([type, rank]) => `data-rank-${type}="${rank}"`).join(' ')}`;
}
