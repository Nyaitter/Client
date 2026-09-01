import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import {
    getCurrentUser,
    getCurrentTimelineTab,
    setCurrentTimelineTab,
    setIsLoadingMore,
    getPostLoadObserver,
} from '../state.js';
import {
    getTimelinePageCache,
    updateRealtimeTimelineIndicator,
    clearRealtimeTimelineUpdate,
} from '../modules/cache.js';
import {
    createPostFormHTML,
    attachPostFormListeners,
    syncPostFormDestinationWithTimeline,
} from '../modules/posts.js';
import { setupTimelinePullToRefresh } from '../modules/theme.js';
import { loadPostsWithPagination } from '../modules/pagination.js';
import { showLoading } from '../utils/helpers.js';
import { positionElementRelativeToAnchor } from '../utils/viewport.js';
import { apiRequest } from '../api.js';
import {
    saveScrollPosition,
    beginScrollRouteTransition,
    restoreScrollPosition,
    getScrollRouteKey,
    clearSavedScrollPosition,
} from '../modules/scroll.js';
import { getSavedHomeTabs } from './settings/homeTabs.js';
import { renderHeader, renderTabs } from './timeline/view.js';
import { getActiveScreenContext, showScreenCompat } from '../screenManager.js';

export const LAST_TIMELINE_TAB_KEY = 'nyaitter_last_timeline_tab';

function parseGroupTimelineTab(tab) {
    if (!String(tab || '').startsWith('group:')) return null;
    const groupId = String(tab).slice('group:'.length);
    return groupId || null;
}

function getGroupTimelineMode(groupId) {
    try {
        const value = localStorage.getItem(`nyaitter_group_timeline_mode_${groupId}`);
        return ['all', 'recommended', 'announcements'].includes(value) ? value : 'all';
    } catch (_) {
        return 'all';
    }
}

function setGroupTimelineMode(groupId, mode) {
    if (!['all', 'recommended', 'announcements'].includes(mode)) return;
    try {
        localStorage.setItem(`nyaitter_group_timeline_mode_${groupId}`, mode);
    } catch (_) {}
}

function closeGroupTimelineMenu() {
    document.querySelector('.group-timeline-mode-menu')?.remove();
}

function openGroupTimelineMenu(button, groupId) {
    closeGroupTimelineMenu();
    const menu = document.createElement('div');
    menu.className = 'group-timeline-mode-menu';
    const mode = getGroupTimelineMode(groupId);
    const options = [
        { value: 'all', label: 'すべて', icon: 'home' },
        { value: 'recommended', label: 'おすすめ', icon: 'explore' },
        { value: 'announcements', label: 'アナウンス', icon: 'megaphone' },
    ];
    menu.innerHTML = options.map((option) => `<button type="button" class="${option.value === mode ? 'active' : ''}" data-group-mode="${option.value}"><span class="menu-item-icon" aria-hidden="true">${ICONS[option.icon]}</span><span class="menu-item-label">${option.label}</span></button>`).join('');
    document.body.appendChild(menu);
    positionElementRelativeToAnchor(menu, button, { placement: 'bottom-start', gap: 6 });
    menu.querySelectorAll('[data-group-mode]').forEach((item) => item.addEventListener('click', () => {
        setGroupTimelineMode(groupId, item.dataset.groupMode);
        closeGroupTimelineMenu();
        void switchTimelineTab(`group:${groupId}`, { forceRefresh: true });
    }));
    setTimeout(() => document.addEventListener('click', closeGroupTimelineMenu, { once: true }), 0);
}

export function getLastTimelineTab() {
    const userId = getCurrentUser()?.id ?? 'guest';
    try {
        return (
            localStorage.getItem(`${LAST_TIMELINE_TAB_KEY}_${userId}`) ||
            'foryou'
        );
    } catch (_) {
        return 'foryou';
    }
}

export function saveLastTimelineTab(tab) {
    const userId = getCurrentUser()?.id ?? 'guest';
    try {
        localStorage.setItem(`${LAST_TIMELINE_TAB_KEY}_${userId}`, tab);
    } catch (_) {}
}

export async function switchTimelineTab(
    tab,
    { forceRefresh = false, resetScroll = false } = {},
) {
    if (tab === 'following' && !getCurrentUser()) return;
    const previousTab = getCurrentTimelineTab();
    const previousRouteKey = getScrollRouteKey('#', previousTab);
    const targetRouteKey = getScrollRouteKey('#', tab);

    // 異なるタブへ切り替える場合のみ、直前のタブのスクロール位置を保存する
    if (previousTab && previousTab !== tab) {
        saveScrollPosition(previousRouteKey);
        beginScrollRouteTransition();
    }

    if (resetScroll) {
        clearSavedScrollPosition(targetRouteKey);
        window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
    }

    setIsLoadingMore(false);
    setCurrentTimelineTab(tab);
    saveLastTimelineTab(tab);
    document
        .querySelectorAll('.timeline-tab-button')
        .forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    const groupId = parseGroupTimelineTab(tab);
    const groupName = groupId
        ? [...document.querySelectorAll('.timeline-tab-button')]
            .find((button) => button.dataset.tab === tab)
            ?.textContent?.trim()
        : '';
    syncPostFormDestinationWithTimeline(DOM.postFormContainer, groupId, groupName);
    clearRealtimeTimelineUpdate(tab);

    if (getPostLoadObserver()) getPostLoadObserver().disconnect();
    DOM.timeline.innerHTML = '';
    const pageCache = getTimelinePageCache(tab, { forceRefresh });
    if (groupId) {
        await loadPostsWithPagination(DOM.timeline, 'group_posts', {
            groupId,
            mode: getGroupTimelineMode(groupId),
            pageCache,
            signal: getActiveScreenContext()?.signal,
        });
    } else {
        await loadPostsWithPagination(DOM.timeline, 'timeline', {
            tab,
            pageCache,
            signal: getActiveScreenContext()?.signal,
        });
    }

    if (!resetScroll) {
        restoreScrollPosition(targetRouteKey);
    }
}

export async function showMainScreen(showScreenFn) {
    renderHeader();
    showScreenCompat('main-screen', showScreenFn);

    const screenSignal = getActiveScreenContext()?.signal;

    setupTimelinePullToRefresh(async () => {
        await switchTimelineTab(getCurrentTimelineTab(), { forceRefresh: true });
    });
    updateRealtimeTimelineIndicator();

    const tabsContainer = document.querySelector('.timeline-tabs');
    if (tabsContainer) {
        let joinedGroups = [];
        let homeTabLimit = 0;
        const savedTabs = getSavedHomeTabs();

        if (getCurrentUser()) {
            try {
                const { data, error } = await apiRequest('/server/api/groups/mine?limit=200', {
                    signal: screenSignal,
                });
            if (!error) {
                    joinedGroups = Array.isArray(data?.groups) ? data.groups : [];
                    homeTabLimit = Math.max(0, Number(data?.home_tab_limit) || 0);
                }
            } catch (_) {}
            renderTabs(tabsContainer, savedTabs, { joinedGroups, homeTabLimit });

            tabsContainer.querySelectorAll('.group-timeline-tab').forEach((button) => {
                const groupId = button.dataset.groupId;
                let longPressTimer = null;
                const openMenu = (event) => {
                    event.preventDefault();
                    if (groupId) openGroupTimelineMenu(button, groupId);
                };
                button.addEventListener('contextmenu', openMenu);
                button.addEventListener('touchstart', () => {
                    longPressTimer = window.setTimeout(() => openGroupTimelineMenu(button, groupId), 600);
                }, { passive: true });
                ['touchend', 'touchcancel', 'touchmove'].forEach((eventName) => button.addEventListener(eventName, () => {
                    if (longPressTimer) window.clearTimeout(longPressTimer);
                    longPressTimer = null;
                }, { passive: true }));
            });

            const restoredTab = getLastTimelineTab();
            const renderedTabs = Array.from(tabsContainer.querySelectorAll('.timeline-tab-button')).map((b) => b.dataset.tab);
            const isTabValid = (tab) => renderedTabs.includes(tab) && (tab !== 'following' || Boolean(getCurrentUser()));
            const initialTab = isTabValid(restoredTab) ? restoredTab : (renderedTabs.find(isTabValid) || 'foryou');
            setCurrentTimelineTab(initialTab);
        } else {
            renderTabs(tabsContainer, savedTabs, { guest: true });
            const renderedTabs = Array.from(tabsContainer.querySelectorAll('.timeline-tab-button')).map((b) => b.dataset.tab);
            const restoredTab = getLastTimelineTab();
            const isTabValid = (tab) => renderedTabs.includes(tab) && tab !== 'following';
            const initialTab = isTabValid(restoredTab) ? restoredTab : (renderedTabs.find(isTabValid) || 'foryou');
            setCurrentTimelineTab(initialTab);
        }
    }

    if (getCurrentUser()) {
        DOM.postFormContainer.innerHTML = createPostFormHTML(false);
        attachPostFormListeners(DOM.postFormContainer);
    } else {
        DOM.postFormContainer.innerHTML = '';
    }

    if (!screenSignal?.aborted) {
        await switchTimelineTab(getCurrentTimelineTab());
        showLoading(false);
    }
}
