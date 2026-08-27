import { showMainScreen } from './screens/timelineScreen.js';
import { showExploreScreen } from './screens/exploreScreen.js';
import { showSearchResults } from './screens/searchScreen.js';
import { showNotificationsScreen } from './screens/notificationsScreen.js';
import { showLikesScreen, showStarsScreen } from './screens/likesStarsScreen.js';
import { showPostDetail } from './screens/postDetailScreen.js';
import { showPostActivityScreen } from './screens/postActivityScreen.js';
import { showDmScreen } from './screens/dmScreen.js';
import { showProfileScreen } from './screens/profileScreen.js';
import { getSettingsGroupFromHash } from './screens/settings/config.js';
import { mountSettingsScreen } from './screens/settings/controller.js';
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
import { openLoginApprovalModal } from './modules/auth.js';

const screenHandlers = {
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
    settings: (params, showScreenFn) => mountSettingsScreen(
        showScreenFn,
        { group: getSettingsGroupFromHash(params.hash) },
    ),
    'login-approval': async (params, showScreenFn) => {
        await showNotificationsScreen(showScreenFn);
        return openLoginApprovalModal(params.approvalId);
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
