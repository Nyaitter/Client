import { DOM } from '../dom.js';
import { ICONS, decorateMenuButtons } from '../icons.js';
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
    setCurrentPagination,
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
    renderPost,
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
    incrementRouterGeneration,
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
    matchesMedia,
} from '../utils/helpers.js';
import { renderHeader, renderTabs } from './profile/view.js';
import {
    getActiveScreenContext,
    onScreenCleanup,
    showScreenCompat,
} from '../screenManager.js';

let activeProfilePullRefreshUser = null;

let profileScrollCleanup = null;
let profileMorph = null;

function clampProgress(value) {
    return Math.max(0, Math.min(1, value));
}

function restoreProfileIdentity() {
    if (!profileMorph) return;
    for (const [element, anchor] of profileMorph.parts) {
        element.classList.remove('profile-morph-avatar', 'profile-morph-identity');
        element.querySelector('.profile-morph-count')?.remove();
        element.querySelectorAll('h2, .user-id').forEach(child => child.removeAttribute('style'));
        element.removeAttribute('style');
        anchor.replaceWith(element);
    }
    profileMorph = null;
    document.body.classList.remove('profile-morph-active');
}

function updateProfileScrollProgress() {
    const root = document.documentElement;
    const card = document.getElementById('profile-header');
    const header = document.getElementById('page-header');
    if (!matchesMedia('(max-width: 544px)')
        || document.body.dataset.activeScreen !== 'profile-screen'
        || !card || card.classList.contains('hidden') || !header) {
        restoreProfileIdentity();
        root.style.setProperty('--profile-header-reveal', '1');
        return;
    }
    if (!profileMorph) {
        const avatar = card.querySelector('.user-icon-large');
        const identity = card.querySelector('.profile-identity');
        if (!avatar || !identity) return;
        const parts = [avatar, identity].map((element, index) => {
            // 元の配置を残すことで、変形中も本文とスクロール位置を動かさない。
            const anchor = element.cloneNode(true);
            anchor.setAttribute('aria-hidden', 'true');
            anchor.classList.add('profile-morph-anchor');
            anchor.querySelectorAll('a').forEach(link => link.tabIndex = -1);
            element.replaceWith(anchor);
            element.classList.add(index === 0 ? 'profile-morph-avatar' : 'profile-morph-identity');
            (index === 0 ? document.body : header).appendChild(element);
            return [element, anchor];
        });
        const count = document.createElement('div');
        count.className = 'profile-morph-count';
        identity.appendChild(count);
        profileMorph = { parts, count };
        document.body.classList.add('profile-morph-active');
    }

    const headerRect = header.getBoundingClientRect();
    const scale = headerRect.width / header.offsetWidth || 1;
    const backRect = header.querySelector('.header-back-btn').getBoundingClientRect();
    const [avatarPart, identityPart] = profileMorph.parts;
    const avatarRect = avatarPart[1].getBoundingClientRect();
    const identityRect = identityPart[1].getBoundingClientRect();
    const scroll = window.scrollY || 0;
    const distance = Math.max(180 * scale, identityRect.top + scroll - headerRect.top);
    const progress = clampProgress(scroll / distance);
    const avatarScale = 1 - progress * 0.5;
    const identityScale = 1 - progress * 0.25;
    const targetX = backRect.right - headerRect.left + 12 * scale;
    const targetIdentityX = targetX;
    const targetIdentityY = (headerRect.height - identityRect.height * 0.75) / 2;

    for (const [part, rect, targetLeft, targetTop, shrink] of [
        [avatarPart, avatarRect, 0, 0, avatarScale],
        [identityPart, identityRect, targetIdentityX, targetIdentityY, identityScale],
    ]) {
        const [element] = part;
        const isAvatar = part === avatarPart;
        const left = isAvatar
            ? rect.left - headerRect.left + rect.width * (1 - shrink) / 2
            : (rect.left - headerRect.left) * (1 - progress) + targetLeft * progress;
        const top = isAvatar
            ? rect.top - headerRect.top + rect.height * (1 - shrink) / 2
            : (rect.top + scroll - headerRect.top) * (1 - progress) + targetTop * progress;
        const availableWidth = headerRect.width - targetIdentityX - 16 * scale;
        const width = part === identityPart
            ? rect.width * (1 - progress) + Math.max(0, availableWidth / shrink) * progress
            : rect.width;
        element.style.width = `${width / scale}px`;
        element.style.height = `${rect.height / scale}px`;
        element.style.transform = `translate(${left / scale}px, ${top / scale}px) scale(${shrink})`;
    }
    const identity = identityPart[0];
    const name = identity.querySelector('h2');
    const id = identity.querySelector('.user-id');
    const identityWidth = parseFloat(identity.style.width);
    name.style.maxWidth = `${identityWidth * (1 - progress * 0.45)}px`;
    const nameRect = name.getBoundingClientRect();
    const idRect = id.getBoundingClientRect();
    const nameWidth = nameRect.width / (scale * identityScale);
    const nameHeight = nameRect.height / (scale * identityScale);
    const idHeight = idRect.height / (scale * identityScale);
    const idLeft = (nameWidth + 8) * progress;
    id.style.left = `${idLeft}px`;
    id.style.top = `${nameHeight * (1 - progress) + (nameHeight - idHeight) / 2 * progress}px`;
    id.style.width = `${Math.max(0, identityWidth - idLeft)}px`;
    profileMorph.count.textContent = document.getElementById('page-title-sub')?.textContent || '';
    profileMorph.count.style.top = `${nameHeight + 4}px`;
    profileMorph.count.style.opacity = progress.toFixed(3);
    profileMorph.count.setAttribute('aria-hidden', progress === 0 ? 'true' : 'false');
    root.style.setProperty('--profile-collapse', progress.toFixed(3));
    const reveal = clampProgress((-identityRect.top + identityRect.height * 0.25) / (96 * scale));
    root.style.setProperty('--profile-header-reveal', (reveal * reveal * (3 - 2 * reveal)).toFixed(3));
}

function teardownProfileScrollTracking() {
    profileScrollCleanup?.();
    profileScrollCleanup = null;
    restoreProfileIdentity();
    document.body.classList.remove('profile-has-banner');
    document.documentElement.style.setProperty('--profile-collapse', '0');
    document.documentElement.style.setProperty('--profile-header-reveal', '0');
}

function setupProfileScrollTracking() {
    teardownProfileScrollTracking();
    let frame = null;
    const scheduleUpdate = () => {
        if (frame !== null) return;
        frame = window.requestAnimationFrame(() => {
            frame = null;
            updateProfileScrollProgress();
        });
    };
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(document.getElementById('profile-header'));
    observer.observe(document.getElementById('page-header'));
    const titleObserver = new MutationObserver(scheduleUpdate);
    titleObserver.observe(document.getElementById('page-title-sub'), { childList: true, characterData: true, subtree: true });
    profileScrollCleanup = () => {
        window.removeEventListener('scroll', scheduleUpdate);
        window.removeEventListener('resize', scheduleUpdate);
        if (frame !== null) window.cancelAnimationFrame(frame);
        observer.disconnect();
        titleObserver.disconnect();
    };
    onScreenCleanup(teardownProfileScrollTracking);
    scheduleUpdate();
}
const profileTimelineModes = new Map();
const profilePostOrders = new Map();
const profileGroupOrders = new Map();
const profileMediaModes = new Map();

function getProfileTimelineMode(userId, tab) {
    return profileTimelineModes.get(`${Number(userId)}:${String(tab)}`) || 'posts_only';
}

function setProfileTimelineMode(userId, tab, mode) {
    if (!['posts_only', 'replies_only'].includes(mode)) return;
    profileTimelineModes.set(`${Number(userId)}:${String(tab)}`, mode);
}

function getProfileGroupOrder(userId, groupId) {
    return profileGroupOrders.get(`${Number(userId)}:${String(groupId)}`) || 'latest';
}

function setProfileGroupOrder(userId, groupId, order) {
    if (!['latest', 'oldest', 'recommended'].includes(order)) return;
    profileGroupOrders.set(`${Number(userId)}:${String(groupId)}`, order);
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
    const isGroupTab = String(tab).startsWith('group:');
    const groupId = isGroupTab ? String(tab).slice('group:'.length) : null;
    const mode = tab === 'posts'
        ? (profilePostOrders.get(Number(user.id)) || 'latest')
        : isGroupTab
          ? getProfileGroupOrder(user.id, groupId)
          : getProfileTimelineMode(user.id, tab);
    const options = (tab === 'posts' || isGroupTab) ? [
        { value: 'latest', label: '最新', icon: 'post' },
        { value: 'oldest', label: '最古', icon: 'post' },
        { value: 'recommended', label: 'おすすめ', icon: 'stars' },
    ] : [
        { value: 'posts_only', label: 'ポスト', icon: 'post' },
        { value: 'replies_only', label: '返信', icon: 'reply' },
    ];
    menu.innerHTML = options.map((option) => `<button type="button" class="${option.value === mode ? 'active' : ''}" data-profile-timeline-mode="${option.value}"><span class="menu-item-icon" aria-hidden="true">${ICONS[option.icon]}</span><span class="menu-item-label">${option.label}</span></button>`).join('');
    document.body.appendChild(menu);
    positionElementRelativeToAnchor(menu, button, { placement: 'bottom-start', gap: 6 });
    menu.querySelectorAll('[data-profile-timeline-mode]').forEach((item) => item.addEventListener('click', () => {
        if (tab === 'posts') profilePostOrders.set(Number(user.id), item.dataset.profileTimelineMode);
        else if (isGroupTab) setProfileGroupOrder(user.id, groupId, item.dataset.profileTimelineMode);
        else setProfileTimelineMode(user.id, tab, item.dataset.profileTimelineMode);
        closeProfileTimelineModeMenu();
        void loadProfileTabContent(user, tab);
    }));
    setTimeout(() => document.addEventListener('click', closeProfileTimelineModeMenu, { once: true }), 0);
}

function closeProfileMediaModeMenu() {
    document.querySelector('.profile-media-mode-menu')?.remove();
}

function updateProfileMediaLabel(user) {
    const pageTitleSub = document.getElementById('page-title-sub');
    if (!pageTitleSub) return;
    pageTitleSub.textContent = `${user.mediaCount || 0} 件の画像と動画`;
}

function openProfileMediaModeMenu(button, user) {
    closeProfileMediaModeMenu();
    const menu = document.createElement('div');
    menu.className = 'group-timeline-mode-menu profile-media-mode-menu';
    const mode = getProfileMediaMode(user.id);
    const options = [
        { value: 'all', label: 'すべて', icon: 'home' },
        { value: 'image', label: '画像', icon: 'attachment' },
        { value: 'video', label: '動画', icon: 'preview' },
    ];
    menu.innerHTML = options.map((option) => `<button type="button" class="${option.value === mode ? 'active' : ''}" data-profile-media-mode="${option.value}"><span class="menu-item-icon" aria-hidden="true">${ICONS[option.icon]}</span><span class="menu-item-label">${option.label}</span></button>`).join('');
    document.body.appendChild(menu);
    positionElementRelativeToAnchor(menu, button, { placement: 'bottom-start', gap: 6 });
    menu.querySelectorAll('[data-profile-media-mode]').forEach((item) => item.addEventListener('click', () => {
        setProfileMediaMode(user.id, item.dataset.profileMediaMode);
        closeProfileMediaModeMenu();
        updateProfileMediaLabel(user);
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
    const normalizedTab = String(subpage || 'posts');
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
        const normalizedTab = String(subpage || 'posts');
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
    incrementRouterGeneration();
    renderHeader();

    showScreenCompat('profile-screen', showScreenFn);
    setupProfileScrollTracking();

    const profileHeader = document.getElementById('profile-header');
    const profileTabs = document.getElementById('profile-tabs');

    document.querySelector('.freeze-notice')?.remove();
    document.getElementById('profile-content').innerHTML = '';
    profileHeader.innerHTML = '<div class="spinner"></div>';
    profileTabs.innerHTML = '';
    // 前回表示の名残で持ち上げ（has-profile-banner）が残らないよう、描画前に必ず外す。
    profileHeader.classList.remove('has-profile-banner');

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
            profileHeader.classList.add('profile-hero');
            profileHeader.setAttribute('data-nui', 'card');
            profileHeader.innerHTML = `
                <div class="profile-hero-main">
                    <img src="${getUserIconUrl(user)}" class="user-icon-large nui-avatar profile-hero-avatar" alt="${escapeHTML(user.name)}'s icon">
                    <div class="profile-info profile-hero-copy">
                        <div class="profile-identity"><h2>${getEmoji(escapeHTML(user.name))}</h2>
                        <div class="user-id" title="Nyaitter ID">${getNyaitterId(user)}</div></div>
                    </div>
                    <div id="profile-actions" class="profile-actions profile-hero-actions"></div>
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
        document.body.classList.toggle('profile-has-banner', Boolean(headerImageUrl));
        const profileBannerHtml = headerImageUrl
            ? `<div class="profile-banner nui-cover"><img src="${escapeHTML(headerImageUrl)}" alt="${escapeHTML(user.name)}のヘッダー画像"></div>`
            : '';

        profileHeader.classList.add('profile-hero');
        profileHeader.setAttribute('data-nui', 'card');
        profileHeader.innerHTML = `
            ${profileBannerHtml}
            <div class="profile-hero-main">
                <img src="${getUserIconUrl(user)}" class="user-icon-large nui-avatar profile-hero-avatar" alt="${escapeHTML(user.name)}'s icon">
                <div class="profile-info profile-hero-copy">
                    <div class="profile-identity"><h2>
                        ${getEmoji(escapeHTML(user.name))}
                        ${user.admin ? `<img src="icons/admin.png" class="admin-badge" title="NyaitterTeam">` : user.verify ? `<img src="icons/verify.png" class="verify-badge" title="認証済み">` : ''}
                        ${user.is_imposter ? '<span class="imposter-badge" title="偽のNyaitterID">インポスター</span>' : ''}
                    </h2>
                    <div class="user-id" title="Nyaitter ID">${getNyaitterId(user)} ${user.visibility?.scid === 'public' && user.scid ? `(<a href="https://scratch.mit.edu/users/${user.scid}" class="scidlink" target="_blank" rel="noopener noreferrer">@${user.scid}</a>)` : ''}</div>
                    </div>
                    ${getGroupBadgesHtml(user, { maxCount: Infinity })}
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
                </div>
                <div id="profile-actions" class="profile-actions profile-hero-actions"></div>
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

        renderTabs(profileTabs, user, subpage);

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
        updateProfileScrollProgress();
    } catch (err) {
        profileHeader.innerHTML = '<h2>プロフィールの読み込みに失敗しました</h2>';
        console.error(err);
    } finally {
        showLoading(false);
    }
}

export async function loadProfileTabContent(user, subpage, options = {}) {
    const signal = getActiveScreenContext()?.signal;
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
        pageTitleSub.textContent = `${user.mediaCount || 0} 件の画像と動画`;
    } else {
        pageTitleSub.textContent = `${user.postCount || 0} 件のポスト`;
    }

    const existingSubTabs = document.getElementById('profile-sub-tabs-container');
    if (existingSubTabs) existingSubTabs.remove();

    const isMediaTab = subpage === 'media';

    if (isFollowListActive) {
        const subTabsContainer = document.createElement('div');
        subTabsContainer.id = 'profile-sub-tabs-container';
        subTabsContainer.innerHTML = `
            <div class="profile-sub-tabs nui-tabs" data-nui="tabs">
                <button class="tab-button nui-tab ${subpage === 'following' ? 'active is-active' : ''}" data-sub-tab="following">フォロー中</button>
                <button class="tab-button nui-tab ${subpage === 'followers' ? 'active is-active' : ''}" data-sub-tab="followers">フォロワー</button>
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
    } else {
        document
            .querySelectorAll('#profile-tabs .tab-button')
            .forEach((btn) => {
                const isActive = btn.dataset.tab === subpage;
                btn.classList.toggle('active', isActive);
                btn.classList.toggle('is-active', isActive);
            });
    }

    try {
        switch (subpage) {
            case 'posts':
            case 'replies': {
                const subType = subpage === 'replies' ? 'replies_only' : 'posts_only';
                const order = subpage === 'replies' ? 'latest' : (profilePostOrders.get(Number(user.id)) || 'latest');
                const pinnedPostId = subType === 'posts_only'
                    ? normalizePostId(user.pinned_post_id)
                    : '';
                await loadPostsWithPagination(contentDiv, 'profile_posts', {
                    userId: user.id,
                    subType,
                    order,
                    pinId: pinnedPostId,
                    pageCache: getProfilePostPageCache(user.id, `${subType}:${order}`, pinnedPostId),
                    signal,
                });
                break;
            }
            case 'likes':
                if (user.visibility?.likes !== 'public') {
                    contentDiv.innerHTML =
                        '<p class="nui-empty-text" style="padding: 2rem; text-align:center;">🔒 このユーザーのいいねは非公開です。</p>';
                    break;
                }
                await loadPostsWithPagination(contentDiv, 'likes', {
                    userId: user.id,
                    pageCache: getProfilePostPageCache(user.id, 'likes'),
                    signal,
                });
                break;
            case 'stars':
                if (user.visibility?.stars !== 'public') {
                    contentDiv.innerHTML =
                        '<p class="nui-empty-text" style="padding: 2rem; text-align:center;">🔒 このユーザーのお気に入りは非公開です。</p>';
                    break;
                }
                await loadPostsWithPagination(contentDiv, 'stars', {
                    userId: user.id,
                    pageCache: getProfilePostPageCache(user.id, 'stars'),
                    signal,
                });
                break;
            case 'following':
                if (user.visibility?.following !== 'public') {
                    contentDiv.innerHTML =
                        '<p class="nui-empty-text" style="padding: 2rem; text-align:center;">🔒 このユーザーのフォローリストは非公開です。</p>';
                    break;
                }
                await loadUsersWithPagination(contentDiv, 'follows', {
                    userId: user.id,
                    pageCache: getUserPageCache(
                        `${getCurrentUser()?.id ?? 'guest'}:profile-users:${user.id}:following`,
                    ),
                    signal,
                });
                break;
            case 'followers':
                if (user.visibility?.followers !== 'public') {
                    contentDiv.innerHTML =
                        '<p class="nui-empty-text" style="padding: 2rem; text-align:center;">🔒 このユーザーのフォロワーリストは非公開です。</p>';
                    break;
                }
                await loadUsersWithPagination(contentDiv, 'followers', {
                    userId: user.id,
                    pageCache: getUserPageCache(
                        `${getCurrentUser()?.id ?? 'guest'}:profile-users:${user.id}:followers`,
                    ),
                    signal,
                });
                break;
            case 'media': {
                const mediaSubType = getProfileMediaMode(user.id);
                await loadMediaGrid(contentDiv, { userId: user.id, type: mediaSubType === 'all' ? null : mediaSubType });
                break;
            }
            case 'scheduled': {
                if (!isCurrentUserProfile(user)) {
                    contentDiv.innerHTML =
                        '<p class="nui-empty-text" style="padding: 2rem; text-align:center;">予約済みのポストはありません。</p>';
                    break;
                }
                const { data, error } = await apiRequest(
                    `/server/api/users/${encodeURIComponent(user.id)}/scheduled?limit=50&offset=0`,
                    { signal },
                );
                if (error) throw error;
                const scheduledPosts = data?.posts || [];
                if (scheduledPosts.length === 0) {
                    contentDiv.innerHTML =
                        '<p class="nui-empty-text" style="padding: 2rem; text-align:center;">予約済みのポストはありません。</p>';
                    break;
                }
                for (const post of scheduledPosts) {
                    const postEl = await renderPost(post, post.author, { forceDetailedDate: true });
                    if (postEl) contentDiv.appendChild(postEl);
                }
                break;
            }
            default:
                if (String(subpage).startsWith('group:')) {
                    const groupId = String(subpage).slice('group:'.length);
                    if (!groupId) throw new Error('グループIDが正しくありません。');
                    const order = getProfileGroupOrder(user.id, groupId);
                    await loadPostsWithPagination(contentDiv, 'group_posts', {
                        groupId,
                        authorId: user.id,
                        subType: 'posts_only',
                        order,
                        hideGroupIndicator: true,
                        pageCache: getProfilePostPageCache(user.id, `group:${groupId}:posts_only:${order}`),
                        signal,
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
    setCurrentPagination({ page: 0, hasMore: true, type: 'media', options });
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
                            ? '<p class="nui-empty-text" style="padding:2rem;text-align:center;">まだメディアはありません。</p>'
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
        blockBtn.className = 'block-menu-btn';
        blockBtn.textContent = isBlocked ? 'ブロック解除' : 'ブロック';
        blockBtn.onclick = async () => {
            const actionLabel = isBlocked ? 'ブロックを解除' : 'ブロック';
            if (!(await showAppConfirm(`このユーザーを${actionLabel}しますか？`))) return;

            blockBtn.disabled = true;
            const currentUser = getCurrentUser();
            try {
                const client = globalThis.NyaitterClientInstance;
                const res = await client.users.toggleBlock(targetUser.id);
                const nowBlocked = Boolean(res?.blocked);
                const updatedBlock = Array.isArray(res?.block)
                    ? res.block
                    : (nowBlocked
                        ? [...(currentUser?.block || []).filter((id) => Number(id) !== Number(targetUser.id)), Number(targetUser.id)]
                        : (currentUser?.block || []).filter((id) => Number(id) !== Number(targetUser.id)));
                setCurrentUser({
                    ...currentUser,
                    block: updatedBlock,
                });
                updateAccountData(getCurrentUser());
                invalidateTimelinePageCache();
                invalidateDmCaches();
                getPublicProfileCache().clear();
                menu.remove();
                const { router } = await import('../router.js');
                await router();
            } catch (e) {
                console.error('ブロック操作失敗:', e);
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
        verifyBtn.className = 'verify-btn';
        verifyBtn.textContent = targetUser.verify ? '認証を取り消す' : 'このユーザーを認証';
        verifyBtn.onclick = () => void adminToggleVerify(targetUser);

        const sendNoticeBtn = document.createElement('button');
        sendNoticeBtn.className = 'notice-btn';
        sendNoticeBtn.textContent = '通知を送信';
        sendNoticeBtn.onclick = () => void adminSendNotice(targetUser.id);

        const shadowBtn = document.createElement('button');
        shadowBtn.className = 'delete-btn shadow-btn';
        shadowBtn.textContent = targetUser.shadow ? '検索除外を解除' : '検索除外';
        shadowBtn.onclick = () => void adminToggleShadow(targetUser);

        const isFrozen = targetUser.account_state === 'frozen' || Boolean(targetUser.freeze);
        const freezeBtn = document.createElement('button');
        freezeBtn.className = isFrozen ? 'freeze-btn' : 'delete-btn freeze-btn';
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

    decorateMenuButtons(menu);

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
        { mode: 'none', title: '通知しない', desc: '', icon: 'notifications' },
        { mode: 'important', title: '重要なポストを通知', desc: '見出しの含まれるポストを通知', icon: 'megaphone' },
        { mode: 'media', title: 'メディアを通知', desc: '添付ファイルのあるポストを通知', icon: 'attachment' },
        { mode: 'all', title: '全てのポストを通知', desc: '返信は対象外', icon: 'reply' },
    ];

    options.forEach((opt) => {
        const itemBtn = document.createElement('button');
        itemBtn.type = 'button';
        itemBtn.className = `profile-notify-menu-item${currentMode === opt.mode ? ' is-active' : ''}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'profile-notify-item-content';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'menu-item-icon';
        iconSpan.setAttribute('aria-hidden', 'true');
        iconSpan.innerHTML = ICONS[opt.icon];
        itemBtn.appendChild(iconSpan);

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
