import { DOM } from '../dom.js';
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
} from '../modules/cache.js';
import {
    createPostFormHTML,
    attachPostFormListeners,
    syncPostFormDestinationWithTimeline,
} from '../modules/posts.js';
import { setupTimelinePullToRefresh } from '../modules/theme.js';
import { loadPostsWithPagination } from '../modules/pagination.js';
import { escapeHTML, showLoading } from '../utils/helpers.js';
import { apiRequest } from '../api.js';
import {
    saveScrollPosition,
    beginScrollRouteTransition,
    restoreScrollPosition,
    getScrollRouteKey,
    clearSavedScrollPosition,
} from '../modules/scroll.js';
import { getSavedHomeTabs } from './settingsScreen.js';

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
    menu.innerHTML = ['all', 'recommended', 'announcements'].map((value) => `<button type="button" class="${value === mode ? 'active' : ''}" data-group-mode="${value}">${({ all: 'すべて', recommended: 'おすすめ', announcements: 'アナウンス' })[value]}</button>`).join('');
    document.body.appendChild(menu);
    const rect = button.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 8, rect.bottom + 6)}px`;
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
            'all'
        );
    } catch (_) {
        return 'all';
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

    if (getPostLoadObserver()) getPostLoadObserver().disconnect();
    DOM.timeline.innerHTML = '';
    const pageCache = getTimelinePageCache(tab, { forceRefresh });
    if (groupId) {
        await loadPostsWithPagination(DOM.timeline, 'group_posts', {
            groupId,
            mode: getGroupTimelineMode(groupId),
            pageCache,
        });
    } else {
        await loadPostsWithPagination(DOM.timeline, 'timeline', {
            tab,
            pageCache,
        });
    }

    if (!resetScroll) {
        restoreScrollPosition(targetRouteKey);
    }
}

export async function showMainScreen(showScreenFn) {
    DOM.pageHeader.innerHTML = `<h2 id="page-title">ホーム</h2>`;
    if (typeof showScreenFn === 'function') {
        showScreenFn('main-screen');
    } else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('main-screen')?.classList.remove('hidden');
    }

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
                const { data, error } = await apiRequest('/server/api/groups/mine?limit=200');
                if (!error) {
                    joinedGroups = Array.isArray(data?.groups) ? data.groups : [];
                    homeTabLimit = Math.max(0, Number(data?.home_tab_limit) || 0);
                }
            } catch (_) {}
            const visibleGroups = homeTabLimit > 0 ? joinedGroups.slice(0, homeTabLimit) : joinedGroups;

            const tabButtonsHTML = [];
            savedTabs.forEach((tabKey) => {
                if (tabKey === 'all') {
                    tabButtonsHTML.push('<button class="timeline-tab-button" data-tab="all">すべて</button>');
                } else if (tabKey === 'foryou') {
                    tabButtonsHTML.push('<button class="timeline-tab-button" data-tab="foryou">おすすめ</button>');
                } else if (tabKey === 'following') {
                    tabButtonsHTML.push('<button class="timeline-tab-button" data-tab="following">フォロー中</button>');
                } else if (tabKey === 'announce') {
                    tabButtonsHTML.push('<button class="timeline-tab-button" data-tab="announce">お知らせ</button>');
                } else if (tabKey === 'groups') {
                    visibleGroups.forEach((group) => {
                        tabButtonsHTML.push(`<button class="timeline-tab-button group-timeline-tab" data-tab="group:${escapeHTML(String(group.id))}" title="${escapeHTML(group.name || 'グループ')}" data-group-id="${escapeHTML(String(group.id))}"><span>${escapeHTML(group.name || '無題のグループ')}</span></button>`);
                    });
                }
            });

            tabsContainer.innerHTML = tabButtonsHTML.join('');

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
            const initialTab = renderedTabs.includes(restoredTab) ? restoredTab : (renderedTabs[0] || 'all');
            setCurrentTimelineTab(initialTab);
        } else {
            const guestButtons = [];
            savedTabs.forEach((tabKey) => {
                if (tabKey === 'all') {
                    guestButtons.push('<button class="timeline-tab-button" data-tab="all">すべて</button>');
                } else if (tabKey === 'announce') {
                    guestButtons.push('<button class="timeline-tab-button" data-tab="announce">お知らせ</button>');
                }
            });
            tabsContainer.innerHTML = guestButtons.length > 0 ? guestButtons.join('') : '<button class="timeline-tab-button" data-tab="all">すべて</button>';
            const renderedTabs = Array.from(tabsContainer.querySelectorAll('.timeline-tab-button')).map((b) => b.dataset.tab);
            const restoredTab = getLastTimelineTab();
            const initialTab = renderedTabs.includes(restoredTab) ? restoredTab : (renderedTabs[0] || 'all');
            setCurrentTimelineTab(initialTab);
        }
    }

    if (getCurrentUser()) {
        DOM.postFormContainer.innerHTML = createPostFormHTML(false);
        attachPostFormListeners(DOM.postFormContainer);
    } else {
        DOM.postFormContainer.innerHTML = '';
    }

    await switchTimelineTab(getCurrentTimelineTab());
    showLoading(false);
}
