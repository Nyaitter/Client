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
} from '../modules/posts.js';
import { setupTimelinePullToRefresh } from '../modules/theme.js';
import { loadPostsWithPagination } from '../modules/pagination.js';
import { showLoading } from '../utils/helpers.js';
import { saveScrollPosition } from '../modules/scroll.js';

export const LAST_TIMELINE_TAB_KEY = 'nyaitter_last_timeline_tab';

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

    if (getPostLoadObserver()) getPostLoadObserver().disconnect();
    DOM.timeline.innerHTML = '';
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
        if (getCurrentUser()) {
            tabsContainer.innerHTML = `
                <button class="timeline-tab-button" data-tab="all">すべて</button>
                <button class="timeline-tab-button" data-tab="foryou">おすすめ</button>
                <button class="timeline-tab-button" data-tab="following">フォロー中</button>
                <button class="timeline-tab-button" data-tab="announce">お知らせ</button>
            `;
        } else {
            tabsContainer.innerHTML = `
                <button class="timeline-tab-button" data-tab="all">すべて</button>
                <button class="timeline-tab-button" data-tab="announce">お知らせ</button>
            `;
        }
        setCurrentTimelineTab(getLastTimelineTab());
    }

    if (getCurrentUser()) {
        DOM.postFormContainer.innerHTML = createPostFormHTML(false);
        attachPostFormListeners(DOM.postFormContainer, async () => {
            await switchTimelineTab(getCurrentTimelineTab(), { forceRefresh: true, resetScroll: true });
        });
    } else {
        DOM.postFormContainer.innerHTML = '';
    }

    await switchTimelineTab(getCurrentTimelineTab());
    showLoading(false);
}
