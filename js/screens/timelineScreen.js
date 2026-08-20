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
import { saveScrollPosition } from '../modules/scroll.js';

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
    const groupId = parseGroupTimelineTab(tab);
    if (resetScroll) {
        window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
        saveScrollPosition();
    }
    setIsLoadingMore(false);
    setCurrentTimelineTab(tab);
    saveLastTimelineTab(tab);
    document
        .querySelectorAll('.timeline-tab-button')
        .forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    const groupName = groupId
        ? [...document.querySelectorAll('.timeline-tab-button')]
            .find((button) => button.dataset.tab === tab)
            ?.textContent?.trim()
        : '';
    syncPostFormDestinationWithTimeline(DOM.postFormContainer, groupId, groupName);

    if (getPostLoadObserver()) getPostLoadObserver().disconnect();
    DOM.timeline.innerHTML = '';
    if (groupId) {
        await loadPostsWithPagination(DOM.timeline, 'group_posts', {
            groupId,
            mode: getGroupTimelineMode(groupId),
        });
        return;
    }
    await loadPostsWithPagination(DOM.timeline, 'timeline', {
        tab,
        pageCache: getTimelinePageCache(tab, { forceRefresh }),
    });
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
        if (getCurrentUser()) {
            try {
                const { data, error } = await apiRequest('/server/api/groups/mine?limit=200');
                if (!error) {
                    joinedGroups = Array.isArray(data?.groups) ? data.groups : [];
                    homeTabLimit = Math.max(0, Number(data?.home_tab_limit) || 0);
                }
            } catch (_) {}
            const visibleGroups = homeTabLimit > 0 ? joinedGroups.slice(0, homeTabLimit) : joinedGroups;
            tabsContainer.innerHTML = `
                <button class="timeline-tab-button" data-tab="all">すべて</button>
                <button class="timeline-tab-button" data-tab="foryou">おすすめ</button>
                <button class="timeline-tab-button" data-tab="following">フォロー中</button>
                <button class="timeline-tab-button" data-tab="announce">お知らせ</button>
                ${visibleGroups.map((group) => `<button class="timeline-tab-button group-timeline-tab" data-tab="group:${escapeHTML(String(group.id))}" title="${escapeHTML(group.name || 'グループ')}" data-group-id="${escapeHTML(String(group.id))}"><span>${escapeHTML(group.name || '無題のグループ')}</span></button>`).join('')}
            `;
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
            setCurrentTimelineTab(parseGroupTimelineTab(restoredTab) && !visibleGroups.some((group) => `group:${group.id}` === restoredTab) ? 'all' : restoredTab);
        } else {
            tabsContainer.innerHTML = `
                <button class="timeline-tab-button" data-tab="all">すべて</button>
                <button class="timeline-tab-button" data-tab="announce">お知らせ</button>
            `;
            setCurrentTimelineTab(getLastTimelineTab());
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
