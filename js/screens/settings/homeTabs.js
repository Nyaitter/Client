import { getCurrentUser } from '../../state.js';

export const ALL_HOME_TABS = Object.freeze([
    Object.freeze({ key: 'all', name: 'すべて', description: 'すべての投稿を表示' }),
    Object.freeze({ key: 'foryou', name: 'おすすめ', description: 'おすすめの投稿を表示' }),
    Object.freeze({ key: 'following', name: 'フォロー中', description: 'フォロー中のユーザーの投稿を表示' }),
    Object.freeze({ key: 'announce', name: 'お知らせ', description: '運営によるアナウンスを表示' }),
    Object.freeze({ key: 'groups', name: 'グループ', description: '参加中のグループタブを表示' }),
]);

export const DEFAULT_HOME_TABS = Object.freeze(['all', 'foryou', 'following', 'announce', 'groups']);

export function getSavedHomeTabs() {
    const user = getCurrentUser();
    const userId = user?.id ?? 'guest';
    let tabs = null;
    if (Array.isArray(user?.settings?.home_tabs) && user.settings.home_tabs.length > 0) {
        tabs = user.settings.home_tabs;
    } else {
        try {
            const stored = localStorage.getItem(`nyaitter_home_tabs_${userId}`);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) tabs = parsed;
            }
        } catch (_) {}
    }
    if (!tabs) return [...DEFAULT_HOME_TABS];
    const validKeys = ALL_HOME_TABS.map((tab) => tab.key);
    const filtered = tabs.filter((key) => validKeys.includes(key));
    return filtered.length > 0 ? filtered : [...DEFAULT_HOME_TABS];
}
