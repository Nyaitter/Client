import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { api, apiRequest } from '../api.js';
import {
    getCurrentUser,
    setCurrentUser,
    getAllUsersCache,
    getPublicProfileCache,
    setIsLoadingMore,
    getPostLoadObserver,
} from '../state.js';
import {
    cacheUser,
    getProfilePostPageCache,
    getUserPageCache,
    invalidateProfileTabPageCache,
    invalidateTimelinePageCache,
    invalidateDmCaches,
    userIdListIncludes,
    isCurrentUserProfile,
    normalizePostId,
} from '../modules/cache.js';
import {
    ensureMentionedUsersCached,
    updateFollowButtonState,
} from '../modules/posts.js';
import { handleDmButtonClick } from '../modules/dm.js';
import {
    adminToggleVerify,
    adminSendNotice,
    adminToggleShadow,
    adminFreezeAccount,
    adminUnfreezeAccount,
    openReportModal,
} from './adminScreen.js';
import { getEmoji } from '../modules/format.js';
import { renderNyarkDown } from '../modules/nyarkdown.js';
import {
    loadPostsWithPagination,
    loadUsersWithPagination,
    bindPaginationOptionsToRoute,
    isActivePaginationLoader,
} from '../modules/pagination.js';
import {
    getScrollRouteKey,
    saveScrollPosition,
    restoreScrollPosition,
    beginScrollRouteTransition,
    clearSavedScrollPosition,
} from '../modules/scroll.js';
import { isDataSaverEnabled, getMediaPerPage } from '../modules/theme.js';
import { updateAccountData } from '../modules/auth.js';
import { createViewportObserver, positionElementRelativeToAnchor } from '../utils/viewport.js';
import {
    escapeHTML,
    getUserIconUrl,
    getUserHeaderImageUrl,
    getNyaitterId,
    getSafeHttpUrl,
    configureAttachmentImage,
    showLoading,
    showAppAlert,
    showAppConfirm,
    getGroupBadgesHtml,
} from '../utils/helpers.js';

let activeProfilePullRefreshUser = null;
const profileTimelineModes = new Map();
const profileMediaModes = new Map();

function getProfileTimelineMode(userId, tab) {
    return profileTimelineModes.get(`${Number(userId)}:${String(tab)}`) || 'posts_only';
}

function setProfileTimelineMode(userId, tab, mode) {
    if (!['posts_only', 'replies_only'].includes(mode)) return;
    profileTimelineModes.set(`${Number(userId)}:${String(tab)}`, mode);
}

function getProfileMediaMode(userId) {
    return profileMediaModes.get(Number(userId)) || 'all';
}

function setProfileMediaMode(userId, mode) {
    if (!['all', 'image', 'video'].includes(mode)) return;
    profileMediaModes.set(Number(userId), mode);
}

function closeProfileTimelineModeMenu() {
    document.querySelector('.profile-timeline-mode-menu')?.remove();
}

function openProfileTimelineModeMenu(button, user, tab) {
    closeProfileTimelineModeMenu();
    const menu = document.createElement('div');
    menu.className = 'group-timeline-mode-menu profile-timeline-mode-menu';
    const mode = getProfileTimelineMode(user.id, tab);
    menu.innerHTML = ['posts_only', 'replies_only'].map((value) => `<button type="button" class="${value === mode ? 'active' : ''}" data-profile-timeline-mode="${value}">${value === 'posts_only' ? 'ポスト' : '返信'}</button>`).join('');
    document.body.appendChild(menu);
    positionElementRelativeToAnchor(menu, button, { placement: 'bottom-start', gap: 6 });
    menu.querySelectorAll('[data-profile-timeline-mode]').forEach((item) => item.addEventListener('click', () => {
        setProfileTimelineMode(user.id, tab, item.dataset.profileTimelineMode);
        closeProfileTimelineModeMenu();
        void loadProfileTabContent(user, tab);
    }));
    setTimeout(() => document.addEventListener('click', closeProfileTimelineModeMenu, { once: true }), 0);
}

function closeProfileMediaModeMenu() {
    document.querySelector('.profile-media-mode-menu')?.remove();
}

function openProfileMediaModeMenu(button, user) {
    closeProfileMediaModeMenu();
    const menu = document.createElement('div');
    menu.className = 'group-timeline-mode-menu profile-media-mode-menu';
    const mode = getProfileMediaMode(user.id);
    menu.innerHTML = ['all', 'image', 'video'].map((value) => `<button type="button" class="${value === mode ? 'active' : ''}" data-profile-media-mode="${value}">${value === 'all' ? 'すべて' : value === 'image' ? '画像' : '動画'}</button>`).join('');
    document.body.appendChild(menu);
    positionElementRelativeToAnchor(menu, button, { placement: 'bottom-start', gap: 6 });
    menu.querySelectorAll('[data-profile-media-mode]').forEach((item) => item.addEventListener('click', () => {
        setProfileMediaMode(user.id, item.dataset.profileMediaMode);
        closeProfileMediaModeMenu();
        void loadProfileTabContent(user, 'media');
    }));
    setTimeout(() => document.addEventListener('click', closeProfileMediaModeMenu, { once: true }), 0);
}

function isFullUserProfile(user) {
    if (!user || typeof user !== 'object') return false;
    return (
        Number.isInteger(Number(user.id)) &&
        (user.name || user.handle) &&
        typeof user.follower_count !== 'undefined' &&
        typeof user.following_count !== 'undefined' &&
        typeof user.post_count !== 'undefined'
    );
}

export async function getPublicProfile(userId, { forceRefresh = false } = {}) {
    const normalizedId = Number(userId);
    if (!Number.isInteger(normalizedId) || normalizedId < 0) {
        return { data: null, error: new Error('Invalid user id') };
    }
    if (!forceRefresh && getPublicProfileCache().has(normalizedId)) {
        const cached = getPublicProfileCache().get(normalizedId);
        if (isFullUserProfile(cached)) {
            return {
                data: cached,
                error: null,
            };
        }
    }
    const result = await apiRequest(
        `/server/api/users/${encodeURIComponent(normalizedId)}`,
    );
    if (!result.error && result.data?.user) {
        getPublicProfileCache().set(normalizedId, result.data.user);
        cacheUser(result.data.user);
    }
    return { data: result.data?.user || null, error: result.error };
}

let currentProfileTab = 'posts';

export async function switchProfileTab(
    user,
    subpage,
    { forceRefresh = false, resetScroll = false } = {},
) {
    if (!user?.id) return;
    const normalizedUserId = Number(user.id);
    const normalizedTab = String(subpage || 'posts') === 'replies' ? 'posts' : String(subpage || 'posts');
    const previousTab = currentProfileTab;
    const previousHash =
        previousTab === 'posts'
            ? `#profile/${normalizedUserId}`
            : `#profile/${normalizedUserId}/${previousTab}`;
    const targetHash =
        normalizedTab === 'posts'
            ? `#profile/${normalizedUserId}`
            : `#profile/${normalizedUserId}/${normalizedTab}`;

    const previousRouteKey = getScrollRouteKey(previousHash);
    const targetRouteKey = getScrollRouteKey(targetHash);

    // 異なるタブへ切り替える場合のみ、直前のタブのスクロール位置を保存する
    if (previousTab && previousTab !== normalizedTab) {
        saveScrollPosition(previousRouteKey);
        beginScrollRouteTransition();
    }

    if (forceRefresh) {
        invalidateProfileTabPageCache(normalizedUserId, normalizedTab);
    }

    if (resetScroll) {
        clearSavedScrollPosition(targetRouteKey);
        window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
    }

    currentProfileTab = normalizedTab;

    if (window.location.hash !== targetHash) {
        window.history.replaceState(window.history.state, '', targetHash);
    }

    await loadProfileTabContent(user, normalizedTab);

    if (!resetScroll) {
        restoreScrollPosition(targetRouteKey);
    }
}

export function resetProfileTabNavigation(userId, subpage) {
    const activeProfile = activeProfilePullRefreshUser;
    if (activeProfile && Number(activeProfile.id) === Number(userId)) {
        void switchProfileTab(activeProfile, subpage, { forceRefresh: true, resetScroll: true });
    } else {
        const normalizedTab = String(subpage || 'posts') === 'replies' ? 'posts' : String(subpage || 'posts');
        const hash =
            normalizedTab === 'posts'
                ? `#profile/${Number(userId)}`
                : `#profile/${Number(userId)}/${normalizedTab}`;
        window.location.hash = hash;
    }
}

export async function refreshActiveProfileTab({ userId, subpage } = {}) {
    const activeProfile = activeProfilePullRefreshUser;
    if (activeProfile && Number(activeProfile.id) === Number(userId)) {
        await switchProfileTab(activeProfile, subpage, { forceRefresh: true, resetScroll: true });
    }
}

export async function showProfileScreen(userId, subpage = 'posts', showScreenFn = null) {
    subpage = subpage === 'replies' ? 'posts' : subpage;
    DOM.pageHeader.innerHTML = `
        <div class="header-with-back-button">
            <button class="header-back-btn" data-action="history-back">${ICONS.back}</button>
            <h2 id="page-title">
                <div id="page-title-main">プロフィール</div>
                <small id="page-title-sub"></small>
            </h2>
        </div>`;

    if (typeof showScreenFn === 'function') {
        showScreenFn('profile-screen');
    } else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('profile-screen')?.classList.remove('hidden');
    }

    const profileHeader = document.getElementById('profile-header');
    const profileTabs = document.getElementById('profile-tabs');

    document.querySelector('.freeze-notice')?.remove();
    document.getElementById('profile-content').innerHTML = '';
    profileHeader.innerHTML = '<div class="spinner"></div>';
    profileTabs.innerHTML = '';

    try {
        const userResult = await getPublicProfile(userId);
        const { data: user, error } = userResult;
        if (error || !user) {
            profileHeader.innerHTML = '<h2>ユーザーが見つかりません</h2>';
            showLoading(false);
            return;
        }
        user.lock = user.visibility?.posts === 'followers_only';
        user.postCount = Number(user.post_count || 0);
        user.mediaCount = Number(user.media_count || 0);
        const followerCount = Number(user.follower_count || 0);
        await ensureMentionedUsersCached([user.me]);

        if (user.account_state === 'frozen') {
            document.getElementById('page-title-main').innerHTML = getEmoji(
                escapeHTML(user.name),
            );
            document.getElementById('page-title-sub').textContent = `${getNyaitterId(user)}`;
            profileHeader.innerHTML = `
                <div class="header-top">
                    <img src="${getUserIconUrl(user)}" class="user-icon-large" alt="${escapeHTML(user.name)}'s icon">
                    <div id="profile-actions" class="profile-actions"></div>
                </div>
                <div class="profile-info">
                    <h2>${getEmoji(escapeHTML(user.name))}</h2>
                    <div class="user-id" title="Nyaitter ID">${getNyaitterId(user)}</div>
                </div>`;
            const actionsContainer = profileHeader.querySelector('#profile-actions');
            if (actionsContainer && getCurrentUser()?.admin && !isCurrentUserProfile(user)) {
                const menuButton = document.createElement('button');
                menuButton.type = 'button';
                menuButton.className = 'profile-menu-button dm-button';
                menuButton.innerHTML = ICONS.more;
                menuButton.title = '管理者メニュー';
                menuButton.setAttribute('aria-label', '管理者メニュー');
                menuButton.onclick = (event) => {
                    event.stopPropagation();
                    openProfileMenu(user, menuButton);
                };
                actionsContainer.appendChild(menuButton);
            }
            const freezeNotice = document.createElement('div');
            freezeNotice.className = 'freeze-notice';
            freezeNotice.innerHTML = `このユーザーは<a href="rule" target="_blank" rel="noopener noreferrer">Nyaitterルール</a>に違反したため凍結されています。`;
            profileTabs.innerHTML = '';
            profileTabs.insertAdjacentElement('afterend', freezeNotice);

            showLoading(false);
            return;
        }

        let blockNoticeHtml = '';
        if (getCurrentUser() && !isCurrentUserProfile(user)) {
            if (userIdListIncludes(getCurrentUser().block, user.id)) {
                blockNoticeHtml += `<div class="freeze-notice">あなたはこのユーザーをブロックしています。ポスト/メッセージは表示されません。</div>`;
            }
            if (user.relationship?.profile_blocks_viewer) {
                blockNoticeHtml += `<div class="freeze-notice">このユーザーはあなたをブロックしています。ポスト/メッセージは表示されません。</div>`;
            }
            if (user.lock) {
                blockNoticeHtml += `<div class="freeze-notice">このユーザーはポストを非公開に設定しています。表示するには相互フォロー状態になってください。</div>`;
            }
        } else if (!getCurrentUser()) {
            if (user.lock) {
                blockNoticeHtml += `<div class="freeze-notice">このユーザーはポストを非公開に設定しています。</div>`;
            }
        }
        if (blockNoticeHtml) {
            document.querySelectorAll('.freeze-notice').forEach((el) => el.remove());
            profileTabs.insertAdjacentHTML('afterend', blockNoticeHtml);
        }

        const headerImageUrl = getUserHeaderImageUrl(user);
        const userMeHtml = renderNyarkDown(user.me || '', getAllUsersCache());
        profileHeader.classList.toggle('has-profile-banner', Boolean(headerImageUrl));
        const profileBannerHtml = headerImageUrl
            ? `<div class="profile-banner"><img src="${escapeHTML(headerImageUrl)}" alt="${escapeHTML(user.name)}のヘッダー画像"></div>`
            : '';

        profileHeader.innerHTML = `
            ${profileBannerHtml}
            <div class="header-top">
                <img src="${getUserIconUrl(user)}" class="user-icon-large" alt="${escapeHTML(user.name)}'s icon">
                <div id="profile-actions" class="profile-actions"></div>
            </div>
            <div class="profile-info">
                <h2>
                    ${getEmoji(escapeHTML(user.name))}
                    ${user.admin ? `<img src="icons/admin.png" class="admin-badge" title="NyaitterTeam">` : user.verify ? `<img src="icons/verify.png" class="verify-badge" title="認証済み">` : ''}
                    ${getGroupBadgesHtml(user)}
                    ${user.is_imposter ? '<span class="imposter-badge" title="偽のNyaitterID">インポスター</span>' : ''}
                </h2>
                <div class="user-id" title="Nyaitter ID">${getNyaitterId(user)} ${user.visibility?.scid === 'public' && user.scid ? `(<a href="https://scratch.mit.edu/users/${user.scid}" class="scidlink" target="_blank" rel="noopener noreferrer">@${user.scid}</a>)` : ''}</div>
                <p class="user-me">${userMeHtml}</p>
                <div class="profile-joined" aria-label="アカウント作成日">
                    <svg class="calendar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span class="profile-joined-text">${(() => {
                        const value = user.created_at;
                        const d = value ? new Date(value) : null;
                        if (!d || Number.isNaN(d.getTime())) {
                            return 'Nyaitterを利用しています';
                        }
                        const parts = new Intl.DateTimeFormat('ja-JP', {
                            timeZone: 'Asia/Tokyo',
                            year: 'numeric',
                            month: 'numeric',
                            day: 'numeric',
                        }).formatToParts(d);
                        const get = (type) => parts.find((part) => part.type === type)?.value;
                        return `${get('year')}年${get('month')}月${get('day')}日よりNyaitterを利用しています`;
                    })()}</span>
                </div>
                <div class="user-stats">
                    <a href="#profile/${user.id}/following"><strong>${user.following_count || 0}</strong> フォロー中</a>
                    <a href="#profile/${user.id}/followers" id="follower-count"><strong>${followerCount}</strong> フォロワー</a>
                </div>
            </div>`;

        if (getCurrentUser() && !isCurrentUserProfile(user)) {
            const actionsContainer = profileHeader.querySelector('#profile-actions');
            if (actionsContainer) {
                const notifyButton = document.createElement('button');
                notifyButton.type = 'button';
                notifyButton.className = 'profile-notify-button dm-button';
                const currentMode = getCurrentUser()?.settings?.user_notifications?.[user.id] || 'none';
                updateNotifyButtonState(notifyButton, currentMode);
                notifyButton.onclick = (e) => {
                    e.stopPropagation();
                    openNotificationMenu(user, notifyButton);
                };
                actionsContainer.appendChild(notifyButton);

                const dmButton = document.createElement('button');
                dmButton.className = 'dm-button';
                dmButton.title = 'メッセージを送信';
                dmButton.innerHTML = ICONS.dm;
                dmButton.onclick = () => handleDmButtonClick(userId);
                actionsContainer.appendChild(dmButton);

                const followButton = document.createElement('button');
                const isFollowing = userIdListIncludes(getCurrentUser().follow, userId);
                updateFollowButtonState(followButton, isFollowing, user.lock);
                followButton.classList.add('profile-follow-button');
                followButton.onclick = () =>
                    window.handleFollowToggle(userId, followButton, user.lock);
                actionsContainer.appendChild(followButton);

                const menuButton = document.createElement('button');
                menuButton.type = 'button';
                menuButton.className = 'profile-menu-button dm-button';
                menuButton.innerHTML = ICONS.more;
                menuButton.title = 'プロフィールメニュー';
                menuButton.setAttribute('aria-label', 'プロフィールメニュー');
                menuButton.onclick = (e) => {
                    e.stopPropagation();
                    openProfileMenu(user, menuButton);
                };
                actionsContainer.appendChild(menuButton);
            }
        }

        const sharedGroups = Array.isArray(user.groups) ? user.groups : [];
        const requestedGroupId = String(subpage || '').startsWith('group:')
            ? String(subpage).slice('group:'.length)
            : '';
        if (
            requestedGroupId &&
            !sharedGroups.some((group) => String(group.id) === requestedGroupId)
        ) {
            resetProfileTabNavigation(user.id, 'posts');
            return;
        }

        const mainTabs = [
            { key: 'posts', name: 'ポスト' },
            { key: 'media', name: 'メディア' },
            { key: 'likes', name: 'いいね' },
            { key: 'stars', name: 'お気に入り' },
            ...sharedGroups.map((group) => ({
                key: `group:${group.id}`,
                name: group.name || 'グループ',
                className: 'profile-group-tab',
                title: group.name || 'グループ',
            })),
        ];

        profileTabs.innerHTML = mainTabs
            .map(
                (tab) =>
                    `<button class="tab-button ${tab.className || ''} ${tab.key === subpage ? 'active' : ''}" data-tab="${escapeHTML(tab.key)}" title="${escapeHTML(tab.title || tab.name)}">${escapeHTML(tab.name)}</button>`,
            )
            .join('');

        profileTabs.querySelectorAll('.tab-button').forEach((button) => {
            const tab = button.dataset.tab;
            const canSwitchTimelineMode = tab === 'posts' || String(tab).startsWith('group:');
            const canSwitchMediaMode = tab === 'media';
            let longPressTimer = null;
            let suppressNextClick = false;
            const openModeMenu = (event) => {
                event?.preventDefault();
                suppressNextClick = !event || event.type !== 'contextmenu';
                if (canSwitchTimelineMode) openProfileTimelineModeMenu(button, user, tab);
                else if (canSwitchMediaMode) openProfileMediaModeMenu(button, user);
            };
            if (canSwitchTimelineMode || canSwitchMediaMode) {
                button.addEventListener('contextmenu', openModeMenu);
                button.addEventListener('touchstart', () => {
                    longPressTimer = window.setTimeout(() => openModeMenu(), 600);
                }, { passive: true });
                ['touchend', 'touchcancel', 'touchmove'].forEach((eventName) => button.addEventListener(eventName, () => {
                    if (longPressTimer) window.clearTimeout(longPressTimer);
                    longPressTimer = null;
                }, { passive: true }));
            }
            button.onclick = (e) => {
                e.stopPropagation();
                if (suppressNextClick) {
                    suppressNextClick = false;
                    return;
                }
                const isSameTab = currentProfileTab === tab;
                if (isSameTab) {
                    void switchProfileTab(user, tab, { forceRefresh: true, resetScroll: true });
                } else {
                    void switchProfileTab(user, tab);
                }
            };
        });

        activeProfilePullRefreshUser = user;
        currentProfileTab = subpage;
        await loadProfileTabContent(user, subpage);
        const currentHash = window.location.hash || `#profile/${user.id}`;
        restoreScrollPosition(getScrollRouteKey(currentHash));
    } catch (err) {
        profileHeader.innerHTML = '<h2>プロフィールの読み込みに失敗しました</h2>';
        console.error(err);
    } finally {
        showLoading(false);
    }
}

export async function loadProfileTabContent(user, subpage, options = {}) {
    subpage = subpage === 'replies' ? 'posts' : subpage;
    const mediaSubType = getProfileMediaMode(user.id);
    const profileHeader = document.getElementById('profile-header');
    const profileTabs = document.getElementById('profile-tabs');
    const contentDiv = document.getElementById('profile-content');

    setIsLoadingMore(false);
    if (getPostLoadObserver()) getPostLoadObserver().disconnect();
    contentDiv.innerHTML = '';

    const isFollowListActive =
        subpage === 'following' || subpage === 'followers';

    profileHeader.classList.toggle('hidden', isFollowListActive);
    profileTabs.classList.toggle('hidden', isFollowListActive);

    const pageTitleMain = document.getElementById('page-title-main');
    const pageTitleSub = document.getElementById('page-title-sub');
    pageTitleMain.innerHTML = getEmoji(escapeHTML(user.name));
    if (isFollowListActive) {
        pageTitleSub.textContent = `${getNyaitterId(user)}`;
    } else if (subpage === 'media') {
        const mediaMode = getProfileMediaMode(user.id);
        const modeLabel = mediaMode === 'all' ? '画像と動画' : mediaMode === 'image' ? '画像' : '動画';
        pageTitleSub.textContent = `${user.mediaCount || 0} 件の${modeLabel}`;
    } else {
        pageTitleSub.textContent = `${user.postCount || 0} 件のポスト`;
    }

    const existingSubTabs = document.getElementById('profile-sub-tabs-container');
    if (existingSubTabs) existingSubTabs.remove();

    if (isFollowListActive) {
        const subTabsContainer = document.createElement('div');
        subTabsContainer.id = 'profile-sub-tabs-container';
        subTabsContainer.innerHTML = `
            <div class="profile-sub-tabs">
                <button class="tab-button ${subpage === 'following' ? 'active' : ''}" data-sub-tab="following">フォロー中</button>
                <button class="tab-button ${subpage === 'followers' ? 'active' : ''}" data-sub-tab="followers">フォロワー</button>
            </div>`;

        DOM.pageHeader.parentNode.insertBefore(
            subTabsContainer,
            DOM.pageHeader.nextSibling,
        );
        const headerHeight = DOM.pageHeader.offsetHeight;
        subTabsContainer.style.top = `${headerHeight}px`;

        subTabsContainer.querySelectorAll('.tab-button').forEach((button) => {
            button.onclick = (e) => {
                e.stopPropagation();
                const subTab = button.dataset.subTab;
                const isSameTab = currentProfileTab === subTab;
                if (isSameTab) {
                    void switchProfileTab(user, subTab, { forceRefresh: true, resetScroll: true });
                } else {
                    void switchProfileTab(user, subTab);
                }
            };
        });
    } else if (isMediaTab) {
        // メディアタブのフィルタは右クリックメニューで行う
    } else {
        document
            .querySelectorAll('#profile-tabs .tab-button')
            .forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === subpage));
    }

    try {
        switch (subpage) {
            case 'posts': {
                const subType = getProfileTimelineMode(user.id, 'posts');
                const pinnedPostId = subType === 'posts_only'
                    ? normalizePostId(user.pinned_post_id)
                    : '';
                await loadPostsWithPagination(contentDiv, 'profile_posts', {
                    userId: user.id,
                    subType,
                    pinId: pinnedPostId,
                    pageCache: getProfilePostPageCache(user.id, subType, pinnedPostId),
                });
                break;
            }
            case 'likes':
                if (user.visibility?.likes !== 'public') {
                    contentDiv.innerHTML =
                        '<p style="padding: 2rem; text-align:center;">🔒 このユーザーのいいねは非公開です。</p>';
                    break;
                }
                await loadPostsWithPagination(contentDiv, 'likes', {
                    userId: user.id,
                    pageCache: getProfilePostPageCache(user.id, 'likes'),
                });
                break;
            case 'stars':
                if (user.visibility?.stars !== 'public') {
                    contentDiv.innerHTML =
                        '<p style="padding: 2rem; text-align:center;">🔒 このユーザーのお気に入りは非公開です。</p>';
                    break;
                }
                await loadPostsWithPagination(contentDiv, 'stars', {
                    userId: user.id,
                    pageCache: getProfilePostPageCache(user.id, 'stars'),
                });
                break;
            case 'following':
                if (user.visibility?.following !== 'public') {
                    contentDiv.innerHTML =
                        '<p style="padding: 2rem; text-align:center;">🔒 このユーザーのフォローリストは非公開です。</p>';
                    break;
                }
                await loadUsersWithPagination(contentDiv, 'follows', {
                    userId: user.id,
                    pageCache: getUserPageCache(
                        `${getCurrentUser()?.id ?? 'guest'}:profile-users:${user.id}:following`,
                    ),
                });
                break;
            case 'followers':
                if (user.visibility?.followers !== 'public') {
                    contentDiv.innerHTML =
                        '<p style="padding: 2rem; text-align:center;">🔒 このユーザーのフォロワーリストは非公開です。</p>';
                    break;
                }
                await loadUsersWithPagination(contentDiv, 'followers', {
                    userId: user.id,
                    pageCache: getUserPageCache(
                        `${getCurrentUser()?.id ?? 'guest'}:profile-users:${user.id}:followers`,
                    ),
                });
                break;
            case 'media': {
                const mediaSubType = options?.mediaSubType || 'all';
                await loadMediaGrid(contentDiv, { userId: user.id, type: mediaSubType === 'all' ? null : mediaSubType });
                break;
            }
            default:
                if (String(subpage).startsWith('group:')) {
                    const groupId = String(subpage).slice('group:'.length);
                    if (!groupId) throw new Error('グループIDが正しくありません。');
                    const subType = getProfileTimelineMode(user.id, `group:${groupId}`);
                    await loadPostsWithPagination(contentDiv, 'group_posts', {
                        groupId,
                        authorId: user.id,
                        subType,
                        pageCache: getProfilePostPageCache(user.id, `group:${groupId}:${subType}`),
                    });
                }
                break;
        }
    } catch (err) {
        contentDiv.innerHTML = `<p class="error-message">コンテンツの読み込みに失敗しました。</p>`;
        console.error('loadProfileTabContent error:', err);
    }
}

export async function loadMediaGrid(container, options = {}) {
    options = bindPaginationOptionsToRoute(options);
    const gridContainer = document.createElement('div');
    gridContainer.className = 'media-grid-container';
    container.appendChild(gridContainer);

    let trigger = container.querySelector('.load-more-trigger');
    if (trigger) trigger.remove();

    trigger = document.createElement('div');
    trigger.className = 'load-more-trigger';
    container.appendChild(trigger);

    const MEDIA_PER_PAGE = getMediaPerPage();
    let page = 0;
    let hasMore = true;
    let isLoading = false;
    let preloadMediaPromise = null;

    const buildMediaUrl = (from) => {
        let url = `/server/api/users/${encodeURIComponent(options.userId)}/media?limit=${MEDIA_PER_PAGE}&offset=${from}`;
        if (options.type) {
            url += `&type=${encodeURIComponent(options.type)}`;
        }
        return url;
    };

    const triggerPreloadNextMedia = (nextPage) => {
        if (!hasMore || !isActivePaginationLoader(container, trigger, options)) return;
        const nextFrom = nextPage * MEDIA_PER_PAGE;
        preloadMediaPromise = apiRequest(buildMediaUrl(nextFrom)).catch(() => null);
    };

    const loadMore = async () => {
        if (!isActivePaginationLoader(container, trigger, options) || isLoading || !hasMore) {
            return;
        }
        isLoading = true;
        trigger.innerHTML = '<div class="spinner"></div>';

        try {
            const from = page * MEDIA_PER_PAGE;
            let mediaResponse;
            let error;
            if (preloadMediaPromise) {
                const res = await preloadMediaPromise;
                preloadMediaPromise = null;
                mediaResponse = res?.data;
                error = res?.error;
            } else {
                const res = await apiRequest(buildMediaUrl(from));
                mediaResponse = res?.data;
                error = res?.error;
            }
            const mediaItems = Array.isArray(mediaResponse?.media_items)
                ? mediaResponse.media_items
                : [];

            if (!isActivePaginationLoader(container, trigger, options)) return;

            if (error) {
                console.error('メディアの読み込みに失敗:', error);
                trigger.innerHTML = '読み込みに失敗しました。';
            } else {
                if (mediaItems && mediaItems.length > 0) {
                    for (const item of mediaItems) {
                        const { data: publicUrlData } = api.storage
                            .from('nyaitter')
                            .getPublicUrl(item.file_id);

                        const itemLink = document.createElement('a');
                        itemLink.href = `#post/${item.post_id}`;
                        itemLink.className = 'media-grid-item';

                        const publicUrl = getSafeHttpUrl(publicUrlData?.publicUrl);
                        if (!publicUrl) continue;
                        if (item.file_type === 'image') {
                            const image = document.createElement('img');
                            configureAttachmentImage(
                                image,
                                { id: item.file_id },
                                publicUrl,
                            );
                            image.alt = '投稿メディア';
                            itemLink.appendChild(image);
                        } else if (item.file_type === 'video') {
                            const video = document.createElement('video');
                            video.src = publicUrl;
                            video.muted = true;
                            video.playsInline = true;
                            video.preload = isDataSaverEnabled() ? 'metadata' : 'auto';
                            itemLink.appendChild(video);
                        }
                        gridContainer.appendChild(itemLink);
                    }
                    page++;
                    if (mediaItems.length < MEDIA_PER_PAGE) {
                        hasMore = false;
                    } else if (isActivePaginationLoader(container, trigger, options)) {
                        triggerPreloadNextMedia(page);
                    }
                } else {
                    hasMore = false;
                }

                if (!hasMore) {
                    trigger.innerHTML =
                        gridContainer.querySelectorAll('.media-grid-item').length === 0
                            ? '<p style="padding:2rem;text-align:center;">まだメディアはありません。</p>'
                            : 'すべてのメディアを読み込みました';
                    mediaObserver?.disconnect();
                } else {
                    trigger.innerHTML = '';
                    requestAnimationFrame(() => {
                        if (!hasMore || isLoading) return;
                        if (!isActivePaginationLoader(container, trigger, options)) return;
                        const rect = trigger.getBoundingClientRect();
                        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
                        if (rect.top <= vh + 300 && rect.bottom >= -300) {
                            void loadMore();
                        }
                    });
                }
            }
        } finally {
            isLoading = false;
        }
    };

    const mediaObserver = createViewportObserver(
        (entries) => {
            if (entries[0].isIntersecting && isActivePaginationLoader(container, trigger, options)) {
                void loadMore();
            }
        },
        { rootMargin: '300px' },
    );
    mediaObserver.observe(trigger);
    await loadMore();
}

export function openProfileMenu(targetUser, triggerElement) {
    document.getElementById('profile-menu')?.remove();

    const menu = document.createElement('div');
    menu.id = 'profile-menu';
    menu.className = 'post-menu is-visible';

    if (!isCurrentUserProfile(targetUser)) {
        const isBlocked =
            Array.isArray(getCurrentUser()?.block) &&
            userIdListIncludes(getCurrentUser().block, targetUser.id);
        const blockBtn = document.createElement('button');
        blockBtn.textContent = isBlocked ? 'ブロック解除' : 'ブロック';
        blockBtn.onclick = async () => {
            const actionLabel = isBlocked ? 'ブロックを解除' : 'ブロック';
            if (!(await showAppConfirm(`このユーザーを${actionLabel}しますか？`))) return;

            blockBtn.disabled = true;
            const currentUser = getCurrentUser();
            const updatedBlock = isBlocked
                ? (currentUser?.block || []).filter((id) => Number(id) !== Number(targetUser.id))
                : [...(currentUser?.block || []), targetUser.id];
            const { data: updatePayload, error } = await apiRequest('/server/api/users/me', {
                method: 'PUT',
                body: { block: updatedBlock },
            });
            if (!error) {
                setCurrentUser(
                    updatePayload?.user || {
                        ...currentUser,
                        block: updatedBlock,
                    },
                );
                updateAccountData(getCurrentUser());
                invalidateTimelinePageCache();
                invalidateDmCaches();
                getPublicProfileCache().clear();
                menu.remove();
                const { router } = await import('../router.js');
                await router();
            } else {
                showAppAlert('ブロック操作に失敗しました');
                blockBtn.disabled = false;
            }
        };
        menu.appendChild(blockBtn);

        const reportBtn = document.createElement('button');
        reportBtn.className = 'report-btn';
        reportBtn.textContent = '報告する';
        reportBtn.onclick = () => {
            openReportModal({
                targetKind: 'user',
                targetId: targetUser.id,
                targetLabel: `ユーザー @${targetUser.scid || targetUser.id}`,
            });
            menu.remove();
        };
        menu.appendChild(reportBtn);
    }

    if (getCurrentUser()?.admin) {
        const verifyBtn = document.createElement('button');
        verifyBtn.textContent = targetUser.verify ? '認証を取り消す' : 'このユーザーを認証';
        verifyBtn.onclick = () => void adminToggleVerify(targetUser);

        const sendNoticeBtn = document.createElement('button');
        sendNoticeBtn.textContent = '通知を送信';
        sendNoticeBtn.onclick = () => void adminSendNotice(targetUser.id);

        const shadowBtn = document.createElement('button');
        shadowBtn.className = 'delete-btn';
        shadowBtn.textContent = targetUser.shadow ? '検索除外を解除' : '検索除外';
        shadowBtn.onclick = () => void adminToggleShadow(targetUser);

        const isFrozen = targetUser.account_state === 'frozen' || Boolean(targetUser.freeze);
        const freezeBtn = document.createElement('button');
        freezeBtn.className = isFrozen ? '' : 'delete-btn';
        freezeBtn.textContent = isFrozen ? '凍結を解除' : 'アカウントを凍結';
        freezeBtn.onclick = () => {
            if (isFrozen) {
                void adminUnfreezeAccount(targetUser.id);
            } else {
                void adminFreezeAccount(targetUser.id);
            }
        };

        menu.appendChild(verifyBtn);
        menu.appendChild(sendNoticeBtn);
        menu.appendChild(shadowBtn);
        menu.appendChild(freezeBtn);
    }

    document.body.appendChild(menu);
    const trigger = triggerElement || document.querySelector('.profile-menu-button');
    if (trigger) {
        positionElementRelativeToAnchor(menu, trigger, { placement: 'bottom-end', gap: 6 });
    }

    setTimeout(() => {
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
            }
        }, { once: true });
    }, 0);
}

export function updateNotifyButtonState(button, mode = 'none') {
    if (!button) return;
    const isActive = mode && mode !== 'none';
    button.classList.toggle('is-active', isActive);

    let title = '通知設定: 通知しない';
    if (mode === 'important') title = '通知設定: 重要なポストを通知';
    else if (mode === 'media') title = '通知設定: メディアを通知';
    else if (mode === 'all') title = '通知設定: 全てのポストを通知';

    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = ICONS.notifications;
}

export function openNotificationMenu(targetUser, trigger) {
    document.getElementById('profile-notification-menu')?.remove();
    document.getElementById('profile-menu')?.remove();

    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const currentMode = currentUser.settings?.user_notifications?.[targetUser.id] || 'none';
    const menu = document.createElement('div');
    menu.id = 'profile-notification-menu';
    menu.className = 'post-menu profile-notify-menu is-visible';

    const options = [
        { mode: 'none', title: '通知しない', desc: '' },
        { mode: 'important', title: '重要なポストを通知', desc: '見出しの含まれるポストを通知' },
        { mode: 'media', title: 'メディアを通知', desc: '添付ファイルのあるポストを通知' },
        { mode: 'all', title: '全てのポストを通知', desc: '返信は対象外' },
    ];

    options.forEach((opt) => {
        const itemBtn = document.createElement('button');
        itemBtn.type = 'button';
        itemBtn.className = `profile-notify-menu-item${currentMode === opt.mode ? ' is-active' : ''}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'profile-notify-item-content';

        const labelDiv = document.createElement('div');
        labelDiv.className = 'profile-notify-item-label';
        labelDiv.textContent = opt.title;
        contentDiv.appendChild(labelDiv);

        if (opt.desc) {
            const descDiv = document.createElement('div');
            descDiv.className = 'profile-notify-item-desc';
            descDiv.textContent = opt.desc;
            contentDiv.appendChild(descDiv);
        }

        itemBtn.appendChild(contentDiv);

        if (currentMode === opt.mode) {
            const checkSpan = document.createElement('span');
            checkSpan.className = 'profile-notify-check';
            checkSpan.textContent = '✓';
            itemBtn.appendChild(checkSpan);
        }

        itemBtn.onclick = async (e) => {
            e.stopPropagation();
            menu.remove();
            await setUserNotificationMode(targetUser, opt.mode, trigger);
        };

        menu.appendChild(itemBtn);
    });

    document.body.appendChild(menu);
    if (trigger) {
        positionElementRelativeToAnchor(menu, trigger, { placement: 'bottom-end', gap: 6 });
    }

    setTimeout(() => {
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
            }
        }, { once: true });
    }, 0);
}

async function setUserNotificationMode(targetUser, mode, trigger) {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const currentNotifications = { ...(currentUser.settings?.user_notifications || {}) };
    if (mode === 'none') {
        delete currentNotifications[targetUser.id];
    } else {
        currentNotifications[targetUser.id] = mode;
    }

    const updatedSettings = {
        ...(currentUser.settings || {}),
        user_notifications: currentNotifications,
    };

    const { data: updatePayload, error } = await apiRequest('/server/api/users/me', {
        method: 'PUT',
        body: { settings: updatedSettings },
    });

    if (!error) {
        setCurrentUser(
            updatePayload?.user || {
                ...currentUser,
                settings: updatedSettings,
            },
        );
        updateAccountData(getCurrentUser());
        updateNotifyButtonState(trigger, mode);
    } else {
        showAppAlert('通知設定の保存に失敗しました');
    }
}
