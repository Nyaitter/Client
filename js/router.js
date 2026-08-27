import { DOM } from './dom.js';
import {
    getCurrentUser,
    getCurrentTimelineTab,
    getCurrentSearchTab,
    getPostLoadObserver,
    setIsLoadingMore,
} from './state.js';
import {
    applyInterfaceTheme,
    applyColorTheme,
    setupTimelinePullToRefresh,
    updatePullToRefreshAvailability,
} from './modules/theme.js';
import { updateNavAndSidebars } from './modules/sidebar.js';
import {
    getScrollRouteKey,
    beginScrollRouteTransition,
    restoreScrollPosition,
} from './modules/scroll.js';
import { handlePendingPushNotificationOpen } from './modules/pwa.js';

import { switchTimelineTab } from './screens/timelineScreen.js';
import { showExploreScreen } from './screens/exploreScreen.js';
import { showSearchResults } from './screens/searchScreen.js';
import { showNotificationsScreen } from './screens/notificationsScreen.js';
import { showLikesScreen, showStarsScreen } from './screens/likesStarsScreen.js';
import { showPostDetail } from './screens/postDetailScreen.js';
import { showPostActivityScreen } from './screens/postActivityScreen.js';
import { showDmScreen } from './screens/dmScreen.js';
import {
    refreshActiveProfileTab,
} from './screens/profileScreen.js';
import { showGroupsScreen, showGroupDetailScreen } from './screens/groupScreen.js';
import {
    showAdminReportsScreen,
    showAdminReportDetailScreen,
    showAdminLogsScreen,
} from './screens/adminScreen.js';
import { showLoading } from './utils/helpers.js';
import { resolveRoute } from './routeTable.js';
import { activateScreen } from './screenManager.js';
import { renderRoute } from './screenRegistry.js';

let routerGeneration = 0;
let scrollRestoreVersion = 0;

async function refreshPullToRefreshContext(context) {
    if (context?.type === 'dynamic' && typeof context.handler === 'function') {
        await context.handler(context);
        return;
    }
    if (context?.type === 'timeline') {
        await switchTimelineTab(getCurrentTimelineTab(), {
            forceRefresh: true,
            resetScroll: true,
        });
        return;
    }
    if (context?.type === 'profile') {
        await refreshActiveProfileTab(context);
        return;
    }
    if (context?.type === 'notifications') {
        await showNotificationsScreen(showScreen);
        return;
    }
    if (context?.type === 'post-activity') {
        await showPostActivityScreen(context.postId, context.tab || 'quotes', { forceRefresh: true, resetScroll: true }, showScreen);
        return;
    }
    if (context?.type === 'post-detail') {
        await showPostDetail(context.postId, { forceRefresh: true }, showScreen);
        return;
    }
    if (context?.type === 'dm') {
        const activeDmIdMatch = (window.location.hash || '').match(/^#dm\/(.+)$/);
        await showDmScreen(activeDmIdMatch ? decodeURIComponent(activeDmIdMatch[1]) : null, showScreen);
        return;
    }
    if (context?.type === 'explore') {
        await showExploreScreen(showScreen);
        return;
    }
    if (context?.type === 'group') {
        const groupMatch = (window.location.hash || '').match(/^#group\/(\d+)(?:\/([^/]+))?$/);
        if (groupMatch) {
            await showGroupDetailScreen(Number(groupMatch[1]), groupMatch[2] || '', showScreen);
        } else {
            await showGroupsScreen(showScreen);
        }
        return;
    }
    if (context?.type === 'likes') {
        await showLikesScreen(showScreen);
        return;
    }
    if (context?.type === 'stars') {
        await showStarsScreen(showScreen);
        return;
    }
    if (context?.type === 'search') {
        await showSearchResults(context.query, getCurrentSearchTab() || 'posts', showScreen);
        return;
    }
    if (context?.type === 'admin-reports') {
        if (context.reportId) {
            await showAdminReportDetailScreen(context.reportId, showScreen);
        } else {
            await showAdminReportsScreen(showScreen);
        }
        return;
    }
    if (context?.type === 'admin-logs') {
        await showAdminLogsScreen(showScreen);
        return;
    }
}

export function showScreen(screenId, { restart = false } = {}) {
    activateScreen(screenId, { restart });
    setupTimelinePullToRefresh(refreshPullToRefreshContext);
    updatePullToRefreshAvailability();
    // 画面シェルを表示できた時点で、一覧データの取得完了を待たずに解除する。
    showLoading(false);
}

export async function router() {
    await handlePendingPushNotificationOpen();
    const generation = ++routerGeneration;
    beginScrollRouteTransition();
    // 進行中の古い復元処理を無効化する。
    scrollRestoreVersion += 1;
    let routeKey = getScrollRouteKey();
    showLoading(true);
    setIsLoadingMore(false);

    applyInterfaceTheme(getCurrentUser()?.settings?.theme || 'light');
    applyColorTheme(getCurrentUser()?.settings || {});

    // プロフィールのサブタブコンテナを削除する。
    const existingSubTabs = document.getElementById('profile-sub-tabs-container');
    if (existingSubTabs) existingSubTabs.remove();

    await updateNavAndSidebars();
    // hashchangeと明示的なrouter()呼び出しが重なった場合、古いルーターは
    // 新しい遷移のDOMやスクロール状態に触れない。
    if (generation !== routerGeneration) return;

    // Check pathname or query for direct post links (/posts/123 or ?post=123)
    let hash = window.location.hash || '#';
    const postPathMatch = window.location.pathname.match(/^(?:\/@[^/]+)?\/posts\/(\d+)$/i);
    if ((!hash || hash === '#') && postPathMatch) {
        window.location.hash = `#post/${postPathMatch[1]}`;
        return;
    }
    const searchParams = new URLSearchParams(window.location.search);
    if ((!hash || hash === '#') && searchParams.has('post')) {
        window.location.hash = `#post/${searchParams.get('post')}`;
        return;
    }

    routeKey = getScrollRouteKey(hash);

    if (getPostLoadObserver()) {
        getPostLoadObserver().disconnect();
    }

    document.body.classList.toggle(
        'notocoloremoji',
        getCurrentUser()?.settings?.emoji === 'notocoloremoji',
    );

    try {
        const route = resolveRoute(hash, getCurrentUser());
        const routeShowScreen = (screenId) => {
            if (generation !== routerGeneration) return;
            showScreen(screenId, { restart: true });
        };
        await renderRoute(route || { name: 'main' }, routeShowScreen);
    } catch (error) {
        if (generation !== routerGeneration) return;
        console.error('Routing error:', error);
        DOM.pageHeader.innerHTML = `<h2>エラー</h2>`;
        showScreen('main-screen');
        DOM.timeline.innerHTML = `<p class="error-message">ページの読み込み中にエラーが発生しました。</p>`;
    } finally {
        if (generation !== routerGeneration) return;
        restoreScrollPosition(routeKey);
    }
}
