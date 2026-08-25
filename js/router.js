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
import { openLoginApprovalModal } from './modules/auth.js';
import { handlePendingPushNotificationOpen } from './modules/pwa.js';

import { showMainScreen, switchTimelineTab } from './screens/timelineScreen.js';
import { showExploreScreen } from './screens/exploreScreen.js';
import { showSearchResults } from './screens/searchScreen.js';
import { showNotificationsScreen } from './screens/notificationsScreen.js';
import { showLikesScreen, showStarsScreen } from './screens/likesStarsScreen.js';
import { showPostDetail } from './screens/postDetailScreen.js';
import { showPostActivityScreen } from './screens/postActivityScreen.js';
import { showDmScreen } from './screens/dmScreen.js';
import {
    showProfileScreen,
    refreshActiveProfileTab,
} from './screens/profileScreen.js';
import { showSettingsScreen, getSettingsGroupFromHash } from './screens/settingsScreen.js';
import { showGroupsScreen, showGroupDetailScreen } from './screens/groupScreen.js';
import {
    showAdminReportsScreen,
    showAdminReportDetailScreen,
    showAdminLogsScreen,
} from './screens/adminScreen.js';
import { showRuleScreen } from './screens/ruleScreen.js';
import { showNyaitterAuthScreen } from './screens/nyaitterAuthScreen.js';
import { showDocsPortalScreen } from './screens/docsPortalScreen.js';
import { showDocsApiScreen } from './screens/docsApiScreen.js';
import { showDocDetailScreen } from './screens/docDetailScreen.js';
import { showLoading } from './utils/helpers.js';

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

export function showScreen(screenId) {
    DOM.screens.forEach((screen) => {
        if (!screen.classList.contains('hidden')) {
            screen.classList.add('hidden');
        }
    });
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.remove('hidden');
    }
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
        const postActivityMatch = hash.match(/^#\/?post\/(\d+)\/activity(?:\/([^/]+))?$/i);
        const postDetailMatch = hash.match(/^#\/?post\/(\d+)$/i);
        if (postActivityMatch) {
            await showPostActivityScreen(postActivityMatch[1], postActivityMatch[2] || 'quotes', showScreen);
        } else if (postDetailMatch) {
            await showPostDetail(postDetailMatch[1], showScreen);
        } else if (hash.startsWith('#post/')) {
            const rawId = hash.substring(6).split('/')[0];
            if (rawId && /^\d+$/.test(rawId)) {
                await showPostDetail(rawId, showScreen);
            } else {
                window.location.hash = '#';
                return;
            }
        } else if (hash.startsWith('#profile/')) {
            const path = hash.substring(9);
            const userId = parseInt(path, 10);
            if (isNaN(userId)) {
                window.location.hash = '#';
                return;
            }
            const subpageMatch = path.match(/\/(.+)/);
            const subpage = subpageMatch ? subpageMatch[1] : 'posts';
            await showProfileScreen(userId, subpage, showScreen);
        } else if (hash.startsWith('#search/')) {
            await showSearchResults(decodeURIComponent(hash.substring(8)), 'posts', showScreen);
        } else if (hash.startsWith('#admin/reports/') && getCurrentUser()?.admin) {
            await showAdminReportDetailScreen(
                hash.substring('#admin/reports/'.length),
                showScreen,
            );
        } else if (hash === '#admin/reports' && getCurrentUser()?.admin) {
            await showAdminReportsScreen(showScreen);
        } else if (hash === '#admin/logs' && getCurrentUser()?.admin) {
            await showAdminLogsScreen(showScreen);
        } else if (hash === '#groups' && getCurrentUser()) {
            await showGroupsScreen(showScreen);
        } else if (hash.startsWith('#group/') && getCurrentUser()) {
            const groupPath = hash.substring('#group/'.length);
            const [groupId, section = 'overview'] = groupPath.split('/');
            if (!groupId) {
                window.location.hash = '#groups';
                return;
            }
            await showGroupDetailScreen(groupId, section, showScreen);
        } else if (hash.startsWith('#dm/') && getCurrentUser()) {
            await showDmScreen(hash.substring(4), showScreen);
        } else if (hash === '#dm' && getCurrentUser()) {
            await showDmScreen(undefined, showScreen);
        } else if ((hash === '#settings' || hash.startsWith('#settings/')) && getCurrentUser()) {
            await showSettingsScreen(getSettingsGroupFromHash(hash), showScreen);
        } else if (hash.startsWith('#login-approval/') && getCurrentUser()) {
            await showNotificationsScreen(showScreen);
            await openLoginApprovalModal(hash.substring('#login-approval/'.length));
        } else if (hash === '#explore') {
            await showExploreScreen(showScreen);
        } else if (hash === '#notifications' && getCurrentUser()) {
            await showNotificationsScreen(showScreen);
        } else if (hash === '#likes' && getCurrentUser()) {
            await showLikesScreen(showScreen);
        } else if (hash === '#stars' && getCurrentUser()) {
            await showStarsScreen(showScreen);
        } else if (hash === '#rule' || hash === '#rules') {
            await showRuleScreen(showScreen);
        } else if (hash === '#docs/api' || hash.startsWith('#docs/api/') || hash === '#api/docs') {
            await showDocsApiScreen(showScreen);
        } else if (hash.startsWith('#docs/') && hash !== '#docs/' && hash !== '#docs') {
            const docId = hash.substring('#docs/'.length).split('/')[0];
            await showDocDetailScreen(docId, showScreen);
        } else if (hash === '#docs' || hash === '#docs/') {
            await showDocsPortalScreen(showScreen);
        } else if (hash.startsWith('#nyaitter-auth') || hash.startsWith('#auth/authorize') || hash.startsWith('#oauth/authorize')) {
            await showNyaitterAuthScreen(showScreen);
        } else {
            await showMainScreen(showScreen);
        }
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
