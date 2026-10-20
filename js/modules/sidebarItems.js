import { getCurrentUser } from '../state.js';
import { ICONS } from '../icons.js';

// サイドメニュー項目の一元定義。この並び順がPC既定の表示順になる。
export const ALL_SIDEBAR_ITEMS = Object.freeze([
    Object.freeze({
        key: 'home',
        name: 'ホーム',
        hash: '#',
        icon: ICONS.home,
        auth: false,
        admin: false,
        mobileBarDefault: true,
    }),
    Object.freeze({
        key: 'explore',
        name: '検索',
        hash: '#explore',
        icon: ICONS.explore,
        auth: false,
        admin: false,
        mobileBarDefault: true,
    }),
    Object.freeze({
        key: 'notifications',
        name: '通知',
        hash: '#notifications',
        icon: ICONS.notifications,
        auth: true,
        admin: false,
        mobileBarDefault: true,
    }),
    Object.freeze({
        key: 'likes',
        name: 'いいね',
        hash: '#likes',
        icon: ICONS.likes,
        auth: true,
        admin: false,
        mobileBarDefault: false,
    }),
    Object.freeze({
        key: 'stars',
        name: 'お気に入り',
        hash: '#stars',
        icon: ICONS.stars,
        auth: true,
        admin: false,
        mobileBarDefault: false,
    }),
    Object.freeze({
        key: 'dm',
        name: 'メッセージ',
        hash: '#dm',
        icon: ICONS.dm,
        auth: true,
        admin: false,
        mobileBarDefault: true,
    }),
    Object.freeze({
        // 実際のhrefはログインユーザーIDが必要なので sidebar.js 側で解決する。
        key: 'profile',
        name: 'プロフィール',
        hash: '#profile/',
        dynamicHash: true,
        icon: ICONS.profile,
        auth: true,
        admin: false,
        mobileBarDefault: true,
    }),
    Object.freeze({
        key: 'settings',
        name: '設定',
        hash: '#settings',
        icon: ICONS.settings,
        auth: true,
        admin: false,
        mobileBarDefault: true,
    }),
    Object.freeze({
        key: 'spaces',
        name: 'ステージ',
        hash: '#stages',
        icon: ICONS.megaphone,
        auth: true,
        admin: false,
        mobileBarDefault: false,
    }),
    Object.freeze({
        key: 'groups',
        name: 'グループ',
        hash: '#groups',
        icon: ICONS.group,
        auth: true,
        admin: false,
        mobileBarDefault: false,
    }),
    Object.freeze({
        key: 'admin_reports',
        name: 'リクエスト',
        hash: '#admin/reports',
        icon: ICONS.mask,
        auth: true,
        admin: true,
        mobileBarDefault: false,
    }),
]);

export const SIDEBAR_ITEM_KEYS = Object.freeze(
    ALL_SIDEBAR_ITEMS.map((item) => item.key),
);

const KNOWN_KEYS = new Set(SIDEBAR_ITEM_KEYS);
const OUTLETS = Object.freeze(['pc', 'mobile']);

const MOBILE_BAR_KEYS = Object.freeze(
    ALL_SIDEBAR_ITEMS.filter((item) => item.mobileBarDefault).map((item) => item.key),
);
const MOBILE_MORE_KEYS = Object.freeze(
    ALL_SIDEBAR_ITEMS.filter((item) => !item.mobileBarDefault).map((item) => item.key),
);

export const DEFAULT_SIDEBAR = Object.freeze({
    pc: Object.freeze({
        bar: Object.freeze([...SIDEBAR_ITEM_KEYS]),
        more: Object.freeze([]),
    }),
    mobile: Object.freeze({
        bar: Object.freeze([...MOBILE_BAR_KEYS]),
        more: Object.freeze([...MOBILE_MORE_KEYS]),
    }),
});

function knownKeyList(value) {
    if (!Array.isArray(value)) return [];
    const seen = [];
    const seenSet = new Set();
    value.forEach((entry) => {
        if (typeof entry !== 'string') return;
        if (!KNOWN_KEYS.has(entry)) return;
        if (seenSet.has(entry)) return;
        seenSet.add(entry);
        seen.push(entry);
    });
    return seen;
}

function defaultZone(outlet) {
    return {
        bar: [...DEFAULT_SIDEBAR[outlet].bar],
        more: [...DEFAULT_SIDEBAR[outlet].more],
    };
}

function readZoneLists(source) {
    if (!source || typeof source !== 'object') return { bar: [], more: [] };
    return { bar: knownKeyList(source.bar), more: knownKeyList(source.more) };
}

function normalizeZone(lists, outlet) {
    const { bar, more: listedMore } = lists;
    if (bar.length === 0 && listedMore.length === 0) return defaultZone(outlet);
    const placed = new Set(bar);
    // 両ゾーンに同じキーが来た場合はbar側を優先し、重複を落とす
    const more = listedMore.filter((key) => {
        if (placed.has(key)) return false;
        placed.add(key);
        return true;
    });
    // 設定に載っていない項目はメニューから消えないようbar末尾に補完する
    const missing = SIDEBAR_ITEM_KEYS.filter((key) => !placed.has(key));
    return { bar: [...bar, ...missing], more };
}

export function normalizeSideMenu(raw) {
    const result = {};
    OUTLETS.forEach((outlet) => {
        result[outlet] = normalizeZone(readZoneLists(raw?.[outlet]), outlet);
    });
    return result;
}

function hasSideMenu(saved) {
    return OUTLETS.some((outlet) => {
        const lists = readZoneLists(saved?.[outlet]);
        return lists.bar.length > 0 || lists.more.length > 0;
    });
}

function isDefaultZone(outlet, zone) {
    const fallback = DEFAULT_SIDEBAR[outlet];
    return (
        zone.bar.length === fallback.bar.length &&
        zone.bar.every((key, index) => key === fallback.bar[index]) &&
        zone.more.length === fallback.more.length &&
        zone.more.every((key, index) => key === fallback.more[index])
    );
}

function isDefaultSideMenu(menu) {
    return OUTLETS.every((outlet) => isDefaultZone(outlet, menu[outlet]));
}

function mirrorKey(userId) {
    return `nyaitter_side_menu_${userId}`;
}

export function readSideMenuMirror(userId) {
    try {
        const stored = localStorage.getItem(mirrorKey(userId));
        if (!stored) return null;
        return JSON.parse(stored);
    } catch (_) {
        return null;
    }
}

export function writeSideMenuMirror(userId, value) {
    try {
        localStorage.setItem(mirrorKey(userId), JSON.stringify(value));
    } catch (_) {}
}

export function getSavedSideMenu() {
    const user = getCurrentUser();
    const userId = user?.id ?? 'guest';
    const saved = user?.settings?.side_menu;
    if (hasSideMenu(saved)) {
        // サーバー設定が最優先。認識できるなら既定と同一でも採用する。
        return normalizeSideMenu(saved);
    }
    const mirrored = normalizeSideMenu(readSideMenuMirror(userId));
    if (!isDefaultSideMenu(mirrored)) return mirrored;
    return normalizeSideMenu(DEFAULT_SIDEBAR);
}

export function applySideMenuZones(candidates, zones) {
    const items = Array.isArray(candidates) ? candidates : [];
    const barKeys = Array.isArray(zones?.bar) ? zones.bar : [];
    const moreKeys = Array.isArray(zones?.more) ? zones.more : [];

    const indexQueues = new Map();
    items.forEach((item, index) => {
        const key = item?.key;
        if (typeof key !== 'string') return;
        if (!indexQueues.has(key)) indexQueues.set(key, []);
        indexQueues.get(key).push(index);
    });

    const barItems = [];
    const moreItems = [];
    const used = new Set();
    const pull = (key, target) => {
        const queue = indexQueues.get(key);
        if (!Array.isArray(queue)) return;
        while (queue.length > 0) {
            const index = queue.shift();
            if (used.has(index)) continue;
            used.add(index);
            target.push(items[index]);
            return;
        }
    };

    barKeys.forEach((key) => pull(key, barItems));
    moreKeys.forEach((key) => pull(key, moreItems));
    // どちらのゾーンにも無いキーの候補はbar末尾に残し、項目を落とさない
    items.forEach((item, index) => {
        if (!used.has(index)) barItems.push(item);
    });

    return { barItems, moreItems };
}
