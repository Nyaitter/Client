import { showMainScreen } from './screens/timelineScreen.js';
import {
    openLoginApprovalModal,
    openAccountRecoveryModal,
} from './modules/auth.js';

// Screens other than the main timeline are loaded on first navigation so the
// initial page load only pays for the first screen. The router already awaits
// handler results, so lazy handlers keep the exact same behavior apart from
// a one-time module fetch when a screen is first opened.
const lazyScreen = (importer, exportName) => async (...args) => (await importer())[exportName](...args);

const showStagesScreen = lazyScreen(() => import('./screens/stagesScreen.js'), 'showStagesScreen');
const showCallScreen = lazyScreen(() => import('./screens/callScreen.js'), 'showCallScreen');
const showExploreScreen = lazyScreen(() => import('./screens/exploreScreen.js'), 'showExploreScreen');
const showSearchResults = lazyScreen(() => import('./screens/searchScreen.js'), 'showSearchResults');
const showNotificationsScreen = lazyScreen(() => import('./screens/notificationsScreen.js'), 'showNotificationsScreen');
const showLikesScreen = lazyScreen(() => import('./screens/likesStarsScreen.js'), 'showLikesScreen');
const showStarsScreen = lazyScreen(() => import('./screens/likesStarsScreen.js'), 'showStarsScreen');
const showPostDetail = lazyScreen(() => import('./screens/postDetailScreen.js'), 'showPostDetail');
const showPostActivityScreen = lazyScreen(() => import('./screens/postActivityScreen.js'), 'showPostActivityScreen');
const showDmScreen = lazyScreen(() => import('./screens/dmScreen.js'), 'showDmScreen');
const showProfileScreen = lazyScreen(() => import('./screens/profileScreen.js'), 'showProfileScreen');
const showGroupsScreen = lazyScreen(() => import('./screens/groupScreen.js'), 'showGroupsScreen');
const showGroupDetailScreen = lazyScreen(() => import('./screens/groupScreen.js'), 'showGroupDetailScreen');
const showAdminReportsScreen = lazyScreen(() => import('./screens/adminScreen.js'), 'showAdminReportsScreen');
const showAdminReportDetailScreen = lazyScreen(() => import('./screens/adminScreen.js'), 'showAdminReportDetailScreen');
const showAdminLogsScreen = lazyScreen(() => import('./screens/adminScreen.js'), 'showAdminLogsScreen');
const showRuleScreen = lazyScreen(() => import('./screens/ruleScreen.js'), 'showRuleScreen');
const showNyaitterAuthScreen = lazyScreen(() => import('./screens/nyaitterAuthScreen.js'), 'showNyaitterAuthScreen');
const showDocsPortalScreen = lazyScreen(() => import('./screens/docsPortalScreen.js'), 'showDocsPortalScreen');
const showDocsApiScreen = lazyScreen(() => import('./screens/docsApiScreen.js'), 'showDocsApiScreen');
const showDocDetailScreen = lazyScreen(() => import('./screens/docDetailScreen.js'), 'showDocDetailScreen');

const screenHandlers = {
    stages: (_, showScreenFn) => showStagesScreen(null, showScreenFn),
    stage: (params, showScreenFn) => showStagesScreen(params.stageId, showScreenFn),
    'call-dm': (params, showScreenFn) => showCallScreen('dm', params.dmId, showScreenFn),
    'call-stage': (params, showScreenFn) => showCallScreen('stage', params.stageId, showScreenFn),
    main: (_, showScreenFn) => showMainScreen(showScreenFn),
    'post-activity': (params, showScreenFn) => showPostActivityScreen(params.postId, params.tab, showScreenFn),
    'post-detail': (params, showScreenFn) => {
        if (params.postId) return showPostDetail(params.postId, showScreenFn);
        if (params.rawId && /^\d+$/.test(params.rawId)) return showPostDetail(params.rawId, showScreenFn);
        window.location.hash = '#';
        return undefined;
    },
    profile: (params, showScreenFn) => {
        if (params.userId === null) {
            window.location.hash = '#';
            return undefined;
        }
        return showProfileScreen(params.userId, params.subpage, showScreenFn);
    },
    search: (params, showScreenFn) => showSearchResults(params.query, 'posts', showScreenFn),
    'admin-report-detail': (params, showScreenFn) => showAdminReportDetailScreen(params.reportId, showScreenFn),
    'admin-reports': (_, showScreenFn) => showAdminReportsScreen(showScreenFn),
    'admin-logs': (_, showScreenFn) => showAdminLogsScreen(showScreenFn),
    groups: (_, showScreenFn) => showGroupsScreen(showScreenFn),
    'group-detail': (params, showScreenFn) => {
        if (!params.groupId) {
            window.location.hash = '#groups';
            return undefined;
        }
        return showGroupDetailScreen(params.groupId, params.section, showScreenFn);
    },
    dm: (params, showScreenFn) => showDmScreen(params.dmId, showScreenFn),
    settings: async (params, showScreenFn) => {
        const [{ mountSettingsScreen }, { getSettingsGroupFromHash }] = await Promise.all([
            import('./screens/settings/controller.js'),
            import('./screens/settings/config.js'),
        ]);
        return mountSettingsScreen(
            showScreenFn,
            { group: getSettingsGroupFromHash(params.hash) },
        );
    },
    'login-approval': async (params, showScreenFn) => {
        await showNotificationsScreen(showScreenFn);
        return openLoginApprovalModal(params.approvalId);
    },
    'account-recovery': async (params, showScreenFn) => {
        await showNotificationsScreen(showScreenFn);
        return openAccountRecoveryModal(params.recoveryId);
    },
    explore: (_, showScreenFn) => showExploreScreen(showScreenFn),
    notifications: (_, showScreenFn) => showNotificationsScreen(showScreenFn),
    likes: (_, showScreenFn) => showLikesScreen(showScreenFn),
    stars: (_, showScreenFn) => showStarsScreen(showScreenFn),
    rule: (_, showScreenFn) => showRuleScreen(showScreenFn),
    'docs-api': (_, showScreenFn) => showDocsApiScreen(showScreenFn),
    'doc-detail': (params, showScreenFn) => showDocDetailScreen(params.docId, showScreenFn),
    'docs-portal': (_, showScreenFn) => showDocsPortalScreen(showScreenFn),
    'nyaitter-auth': (_, showScreenFn) => showNyaitterAuthScreen(showScreenFn),
};

export function getScreenHandler(screenName) {
    return screenHandlers[screenName] || screenHandlers.main;
}

export function renderRoute(route, showScreenFn) {
    return getScreenHandler(route?.name || 'main')(route?.params || {}, showScreenFn);
}
