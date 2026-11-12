import { t } from '../../modules/i18n.js';
import { getCurrentUser } from '../../state.js';

export const ALL_HOME_TABS = Object.freeze([
    Object.freeze({ key: 'all', name: t('timeline.tab.all'), description: t('hometabs.desc_all') }),
    Object.freeze({ key: 'foryou', name: t('timeline.tab.foryou'), description: t('hometabs.desc_foryou') }),
    Object.freeze({ key: 'following', name: t('timeline.tab.following'), description: t('hometabs.desc_following') }),
    Object.freeze({ key: 'announce', name: t('timeline.tab.announce_info'), description: t('hometabs.desc_announce') }),
    Object.freeze({ key: 'groups', name: t('nav.groups'), description: t('hometabs.desc_groups') }),
]);

export const DEFAULT_HOME_TABS = Object.freeze(['foryou', 'all', 'following', 'announce', 'groups']);

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
