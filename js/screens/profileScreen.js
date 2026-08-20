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
    clearSavedScrollPosition,
} from '../modules/scroll.js';
import { isDataSaverEnabled, getMediaPerPage } from '../modules/theme.js';
import { updateAccountData } from '../modules/auth.js';
import { createViewportObserver } from '../utils/viewport.js';
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
} from '../utils/helpers.js';

let activeProfilePullRefreshUser = null;

export async function getPublicProfile(userId) {
    const normalizedId = Number(userId);
    if (!Number.isInteger(normalizedId) || normalizedId < 0) {
        return { data: null, error: new Error('Invalid user id') };
    }
    if (getPublicProfileCache().has(normalizedId)) {
        return {
            data: getPublicProfileCache().get(normalizedId),
            error: null,
        };
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

export function resetProfileTabNavigation(userId, subpage) {
    const normalizedUserId = Number(userId);
    if (!Number.isInteger(normalizedUserId) || normalizedUserId < 0) return;

    const normalizedTab = String(subpage || 'posts');
    const hash =
        normalizedTab === 'posts'
            ? `#profile/${normalizedUserId}`
            : `#profile/${normalizedUserId}/${normalizedTab}`;
    const routeKey = getScrollRouteKey(hash);
    invalidateProfileTabPageCache(normalizedUserId, normalizedTab);
    clearSavedScrollPosition(routeKey);

    const profileScreen = document.getElementById('profile-screen');
    const activeProfile = activeProfilePullRefreshUser;
    if (
        profileScreen &&
        !profileScreen.classList.contains('hidden') &&
        Number(activeProfile?.id) === normalizedUserId
    ) {
        if (window.location.hash !== hash) {
            window.history.replaceState(window.history.state, '', hash);
        }
        window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
        void loadProfileTabContent(activeProfile, normalizedTab);
        return;
    }

    window.location.hash = hash;
}

export async function refreshActiveProfileTab({ userId, subpage } = {}) {
    const normalizedUserId = Number(userId);
    const activeProfile = activeProfilePullRefreshUser;
    if (
        !Number.isInteger(normalizedUserId) ||
        normalizedUserId < 0 ||
        Number(activeProfile?.id) !== normalizedUserId
    ) {
        return;
    }

    const normalizedTab = String(subpage || 'posts');
    invalidateProfileTabPageCache(normalizedUserId, normalizedTab);
    await loadProfileTabContent(activeProfile, normalizedTab);
}

export async function showProfileScreen(userId, subpage = 'posts', showScreenFn = null) {
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
                    openProfileMenu(user);
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
                    openProfileMenu(user);
                };
                actionsContainer.appendChild(menuButton);
            }
        }

        let sharedGroups = [];
        if (getCurrentUser()) {
            try {
                const { data, error } = await apiRequest(`/server/api/groups/shared/${encodeURIComponent(user.id)}`);
                if (!error) sharedGroups = Array.isArray(data?.groups) ? data.groups : [];
            } catch (_) {}
        }
        const mainTabs = [
            { key: 'posts', name: 'ポスト' },
            { key: 'replies', name: '返信', className: 'mobile-hidden' },
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
            button.onclick = (e) => {
                e.stopPropagation();
                resetProfileTabNavigation(user.id, button.dataset.tab);
            };
        });

        activeProfilePullRefreshUser = user;
        await loadProfileTabContent(user, subpage);
    } catch (err) {
        profileHeader.innerHTML = '<h2>プロフィールの読み込みに失敗しました</h2>';
        console.error(err);
    } finally {
        showLoading(false);
    }
}

export async function loadProfileTabContent(user, subpage) {
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
                resetProfileTabNavigation(user.id, button.dataset.subTab);
            };
        });
    } else {
        document
            .querySelectorAll('#profile-tabs .tab-button')
            .forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === subpage));
    }

    try {
        switch (subpage) {
            case 'posts': {
                const pinnedPostId = normalizePostId(user.pinned_post_id);
                await loadPostsWithPagination(contentDiv, 'profile_posts', {
                    userId: user.id,
                    subType: 'posts_only',
                    pinId: pinnedPostId,
                    pageCache: getProfilePostPageCache(
                        user.id,
                        'posts_only',
                        pinnedPostId,
                    ),
                });
                break;
            }
            case 'replies':
                await loadPostsWithPagination(contentDiv, 'profile_posts', {
                    userId: user.id,
                    subType: 'replies_only',
                    pageCache: getProfilePostPageCache(user.id, 'replies_only'),
                });
                break;
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
            case 'media':
                await loadMediaGrid(contentDiv, { userId: user.id });
                break;
            default:
                if (String(subpage).startsWith('group:')) {
                    const groupId = String(subpage).slice('group:'.length);
                    if (!groupId) throw new Error('グループIDが正しくありません。');
                    await loadPostsWithPagination(contentDiv, 'group_posts', {
                        groupId,
                        authorId: user.id,
                        pageCache: getProfilePostPageCache(user.id, `group:${groupId}`),
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

    const loadMore = async () => {
        if (!isActivePaginationLoader(container, trigger, options) || isLoading || !hasMore) {
            return;
        }
        isLoading = true;
        trigger.innerHTML = '<div class="spinner"></div>';

        const from = page * MEDIA_PER_PAGE;
        const { data: mediaResponse, error } = await apiRequest(
            `/server/api/users/${encodeURIComponent(options.userId)}/media?limit=${MEDIA_PER_PAGE}&offset=${from}`,
        );
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
                if (mediaItems.length < MEDIA_PER_PAGE) hasMore = false;
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
            }
        }
        isLoading = false;
    };

    const mediaObserver = createViewportObserver(
        (entries) => {
            if (entries[0].isIntersecting && isActivePaginationLoader(container, trigger, options)) {
                void loadMore();
            }
        },
        { rootMargin: '200px' },
    );
    mediaObserver.observe(trigger);
    await loadMore();
}

export function openProfileMenu(targetUser) {
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
    const trigger = document.querySelector('.profile-menu-button');
    if (trigger) {
        const rect = trigger.getBoundingClientRect();
        menu.style.position = 'absolute';
        menu.style.top = `${window.scrollY + rect.bottom + 6}px`;
        menu.style.left = `${window.scrollX + rect.left}px`;
    }

    setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
    }, 0);
}
