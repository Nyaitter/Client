import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { api } from '../api.js';
import {
    getCurrentUser,
    getRecommendedUsersCache,
    setRecommendedUsersCache,
} from '../state.js';
import {
    userIdListIncludes,
    isCurrentUserProfile,
} from './cache.js';
import { getEmoji } from './format.js';
import { updateFollowButtonState, openPostModal } from './posts.js';
import { openAccountSwitcherModal } from './auth.js';
import {
    escapeHTML,
    getUserIconUrl,
    getNyaitterId,
    formatNyaitterId,
    matchesMedia,
    scheduleNextFrame,
} from '../utils/helpers.js';

const { widgetLinks: WIDGET_LINKS } = globalThis.NyaitterClientConfig || {};

let recommendedUsersRequest = null;
let sidebarOverflowResizeHandler = null;
let sidebarOverflowResizeTimer = null;
let sidebarOverflowAbortController = null;

export async function loadRightSidebar() {
    if (DOM.rightSidebar.searchWidget) {
        DOM.rightSidebar.searchWidget.innerHTML = `<div class="sidebar-search-widget">${ICONS.explore}<input type="search" id="sidebar-search-input" placeholder="検索"></div>`;
        document
            .getElementById('sidebar-search-input')
            ?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const query = e.target.value.trim();
                    if (query) {
                        window.location.hash = `#search/${encodeURIComponent(query)}`;
                    }
                }
            });
    }

    let error = null;
    if (getRecommendedUsersCache() === null) {
        if (!recommendedUsersRequest) {
            let query = api
                .from('user')
                .select('id, name, scid, icon_data');
            if (getCurrentUser()) {
                query = query.neq('id', getCurrentUser().id);
            }
            recommendedUsersRequest = query
                .order('created_at', { ascending: false })
                .limit(3)
                .then((result) => {
                    if (!result.error) {
                        setRecommendedUsersCache(
                            Array.isArray(result.data) ? result.data : [],
                        );
                    }
                    return result;
                })
                .finally(() => {
                    recommendedUsersRequest = null;
                });
        }
        const result = await recommendedUsersRequest;
        error = result.error;
    }

    const data = getRecommendedUsersCache() || [];
    const linkItems = Array.isArray(WIDGET_LINKS) ? WIDGET_LINKS : [];
    if (DOM.rightSidebar.links) {
        DOM.rightSidebar.links.innerHTML = linkItems
            .map((item) => {
                const name = escapeHTML(String(item?.name || 'リンク'));
                const url = escapeHTML(String(item?.url || item?.link || '#'));
                const external = /^https:\/\//i.test(String(item?.url || item?.link || ''));
                return `<a href="${url}" class="link"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${name}</a>`;
            })
            .join('');
    }

    const recommendedUsers = Array.isArray(data) ? data : [];
    if (error || recommendedUsers.length === 0) {
        if (DOM.rightSidebar.recommendations) {
            DOM.rightSidebar.recommendations.innerHTML = '';
        }
        return;
    }

    let recHTML = '<div class="widget-title">おすすめユーザー</div>';
    recHTML += recommendedUsers
        .map((user) => {
            const isFollowing = userIdListIncludes(getCurrentUser()?.follow, user.id);
            const btnClass = isFollowing
                ? 'follow-button-following'
                : 'follow-button-not-following';
            const btnText = isFollowing ? 'フォロー中' : 'フォロー';
            return `<div class="widget-item recommend-user">
                <a href="#profile/${user.id}" class="profile-link" style="text-decoration:none; color:inherit; display:flex; align-items:center; gap:0.5rem;">
                    <img src="${getUserIconUrl(user)}" style="width:40px;height:40px;border-radius:50%;" alt="${escapeHTML(user.name)}'s icon">
                    <div>
                        <span>${getEmoji(escapeHTML(user.name))}</span>
                        <small style="color:var(--secondary-text-color); display:block;">${getNyaitterId(user)}</small>
                    </div>
                </a>
                ${getCurrentUser() && !isCurrentUserProfile(user) ? `<button class="${btnClass}" data-user-id="${user.id}">${btnText}</button>` : ''}
            </div>`;
        })
        .join('');

    if (DOM.rightSidebar.recommendations) {
        DOM.rightSidebar.recommendations.innerHTML = `<div class="sidebar-widget">${recHTML}</div>`;
    }

    DOM.rightSidebar.recommendations
        ?.querySelectorAll('.recommend-user button')
        .forEach((button) => {
            const userId = parseInt(button.dataset.userId, 10);
            if (!isNaN(userId)) {
                const isFollowing = getCurrentUser()?.follow?.includes(userId);
                updateFollowButtonState(button, isFollowing);
                button.onclick = () => window.handleFollowToggle(userId, button);
            }
        });
}

export function setupSidebarOverflowMenu() {
    if (sidebarOverflowResizeHandler) {
        window.removeEventListener('resize', sidebarOverflowResizeHandler);
        sidebarOverflowResizeHandler = null;
    }
    if (sidebarOverflowAbortController) {
        sidebarOverflowAbortController.abort();
        sidebarOverflowAbortController = null;
    }

    const sidebar = document.getElementById('left-nav');
    sidebar?.classList.remove('sidebar-overflow-open');
    const menu = DOM.navMenuTop;
    const existingOverflow = menu?.querySelector('.nav-overflow-menu');
    if (existingOverflow && menu) {
        existingOverflow
            .querySelectorAll(':scope > .nav-overflow-panel > a.nav-item')
            .forEach((item) => menu.insertBefore(item, existingOverflow));
        existingOverflow.remove();
    }

    if (matchesMedia('(max-width: 680px)')) return;

    const logo = DOM.navLogo;
    const menuBottom = DOM.navMenuBottom;
    const postButton = menu?.querySelector('.nav-item-post');
    const menuLinks = menu
        ? [...menu.querySelectorAll(':scope > a.nav-item')]
        : [];
    if (!sidebar || !menu || menuLinks.length === 0) return;

    sidebarOverflowResizeHandler = () => {
        window.clearTimeout(sidebarOverflowResizeTimer);
        sidebarOverflowResizeTimer = window.setTimeout(
            setupSidebarOverflowMenu,
            120,
        );
    };
    window.addEventListener('resize', sidebarOverflowResizeHandler, { passive: true });

    const availableMenuHeight = () =>
        Math.max(
            0,
            sidebar.clientHeight -
                (logo?.offsetHeight || 0) -
                (menuBottom?.offsetHeight || 0) -
                24,
        );

    if (menu.scrollHeight <= availableMenuHeight()) return;

    const overflow = document.createElement('div');
    overflow.className = 'nav-overflow-menu';
    overflow.innerHTML = `
        <button type="button" class="nav-item nav-overflow-toggle" aria-expanded="false" aria-controls="nav-overflow-panel">
            <span class="nav-item-icon-container">${ICONS.more}</span>
            <span class="nav-item-text">その他</span>
        </button>
        <div id="nav-overflow-panel" class="nav-overflow-panel hidden" role="menu"></div>`;
    const toggle = overflow.querySelector('.nav-overflow-toggle');
    const panel = overflow.querySelector('.nav-overflow-panel');
    menu.insertBefore(overflow, postButton || null);

    const fitsInSidebar = () => menu.scrollHeight <= availableMenuHeight();

    let visibleCount = menuLinks.length;
    while (!fitsInSidebar() && visibleCount > 0) {
        visibleCount -= 1;
        panel.prepend(menuLinks[visibleCount]);
    }

    if (visibleCount === menuLinks.length) {
        overflow.remove();
        return;
    }

    sidebarOverflowAbortController = new AbortController();
    const { signal } = sidebarOverflowAbortController;

    const closeOverflow = () => {
        overflow.classList.remove('is-open');
        sidebar?.classList.remove('sidebar-overflow-open');
        panel.classList.add('hidden');
        toggle?.setAttribute('aria-expanded', 'false');
    };

    const positionOverflowPanel = () => {
        if (!toggle || panel.classList.contains('hidden')) return;
        const edgeMargin = 8;
        const gap = 6;
        const toggleRect = toggle.getBoundingClientRect();
        const panelWidth = Math.min(
            240,
            Math.max(0, window.innerWidth - edgeMargin * 2),
        );
        panel.style.width = `${panelWidth}px`;
        panel.style.maxHeight = `${Math.max(0, window.innerHeight - edgeMargin * 2)}px`;

        const panelHeight = panel.offsetHeight;
        const panelWidthAfterLayout = panel.offsetWidth;
        let top = toggleRect.bottom + gap;
        if (top + panelHeight > window.innerHeight - edgeMargin) {
            top = toggleRect.top - panelHeight - gap;
        }
        top = Math.max(
            edgeMargin,
            Math.min(top, window.innerHeight - panelHeight - edgeMargin),
        );
        const left = Math.max(
            edgeMargin,
            Math.min(
                toggleRect.left,
                window.innerWidth - panelWidthAfterLayout - edgeMargin,
            ),
        );
        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
    };

    const toggleOverflow = () => {
        const isOpen = overflow.classList.toggle('is-open');
        sidebar?.classList.toggle('sidebar-overflow-open', isOpen);
        panel.classList.toggle('hidden', !isOpen);
        toggle?.setAttribute('aria-expanded', String(isOpen));
        if (isOpen) positionOverflowPanel();
    };

    toggle?.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleOverflow();
    }, { signal });

    document.addEventListener('click', (event) => {
        if (!overflow.contains(event.target)) closeOverflow();
    }, { signal });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeOverflow();
    }, { signal });
}

export async function updateNavAndSidebars() {
    const hash = window.location.hash || '#';
    const menuItems = [
        { name: 'ホーム', hash: '#', icon: ICONS.home },
        { name: '検索', hash: '#explore', icon: ICONS.explore },
    ];
    let totalUnreadDmCount = 0;
    if (getCurrentUser()) {
        totalUnreadDmCount = Number(
            getCurrentUser().unreadDmTotal ??
                getCurrentUser().dm_unread_count ??
                0,
        );

        menuItems.push(
            {
                name: '通知',
                hash: '#notifications',
                icon: ICONS.notifications,
                badge: getCurrentUser().notification_unread_count,
            },
            { name: 'いいね', hash: '#likes', icon: ICONS.likes },
            { name: 'お気に入り', hash: '#stars', icon: ICONS.stars },
            {
                name: 'メッセージ',
                hash: '#dm',
                icon: ICONS.dm,
                badge: totalUnreadDmCount,
            },
            {
                name: 'プロフィール',
                hash: `#profile/${getCurrentUser().id}`,
                icon: ICONS.profile,
            },
            {
                name: '設定',
                hash: '#settings/profile',
                icon: ICONS.settings,
            },
        );
        if (getCurrentUser().admin) {
            menuItems.push({
                name: 'リクエスト',
                hash: '#admin/reports',
                icon: ICONS.mask,
            });
        }
    }

    DOM.navLogo.innerHTML = `<a href="#" class="nav-logo-img">${ICONS.nyaitter_logo}</a>`;

    DOM.navMenuTop.innerHTML = menuItems
        .map((item) => {
            let isActive = false;
            if (item.hash === '#') {
                isActive = hash === '#' || hash === '';
            } else if (item.hash === '#settings/profile') {
                isActive = hash === '#settings' || hash.startsWith('#settings/');
            } else {
                isActive = hash.startsWith(item.hash);
            }
            return `
                <a href="${item.hash}" class="nav-item ${item.hash === '#admin/reports' ? 'nav-item-request' : ''} ${isActive ? 'active' : ''}">
                    <div class="nav-item-icon-container">
                        ${item.icon}
                        ${item.badge && item.badge > 0 ? `<span class="notification-badge">${item.badge > 99 ? '99+' : item.badge}</span>` : ''}
                    </div>
                    <span class="nav-item-text">${item.name}</span>
                </a>`;
        })
        .join('');

    if (getCurrentUser()) {
        DOM.navMenuTop.innerHTML += `<button class="nav-item nav-item-post"><span class="nav-item-text">ポスト</span><span class="nav-item-icon">${ICONS.send}</span></button>`;
    }

    DOM.navMenuBottom.innerHTML = getCurrentUser()
        ? `<button id="account-button" class="nav-item account-button">
            <img src="${getUserIconUrl(getCurrentUser())}" class="user-icon" alt="${escapeHTML(getCurrentUser().name)}'s icon">
            <div class="account-info">
                <span class="name">${getEmoji(escapeHTML(getCurrentUser().name))}</span>
                <span class="id">${formatNyaitterId(getCurrentUser())}</span>
            </div>
        </button>`
        : '';

    DOM.loginBanner?.classList.toggle('hidden', !!getCurrentUser());

    DOM.navMenuBottom
        .querySelector('#account-button')
        ?.addEventListener('click', openAccountSwitcherModal);
    DOM.navMenuTop
        .querySelector('.nav-item-post')
        ?.addEventListener('click', () => openPostModal());

    const postButton = document.getElementsByClassName('nav-item-post')[0];
    const accountButton = document.getElementById('account-button');
    if (postButton) {
        if (matchesMedia('(max-width:680px)') && location.hash.startsWith('#dm')) {
            postButton.classList.add('hidden');
        } else {
            postButton.classList.remove('hidden');
        }
    }
    if (accountButton) {
        if (matchesMedia('(max-width:680px)') && location.hash.startsWith('#dm')) {
            accountButton.classList.add('hidden');
        } else {
            accountButton.classList.remove('hidden');
        }
    }

    scheduleNextFrame(setupSidebarOverflowMenu);
    await loadRightSidebar();
}
