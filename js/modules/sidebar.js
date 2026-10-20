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
import { getSavedSideMenu, applySideMenuZones } from './sidebarItems.js';
import { updateFollowButtonState, openPostModal } from './posts.js';
import { openAccountSwitcherModal } from './auth.js';
import {
    escapeHTML,
    getSafeHttpUrl,
    getUserIconUrl,
    getNyaitterId,
    formatNyaitterId,
    matchesMedia,
    scheduleNextFrame,
} from '../utils/helpers.js';

function getSafeWidgetUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || /[\u0000-\u001F\u007F"'<>]/.test(raw)) return '#';
    if (/^https?:\/\//i.test(raw)) return getSafeHttpUrl(raw) || '#';
    if (raw.startsWith('/') || raw.startsWith('#')) return raw.includes('..') ? '#' : raw;
    return '#';
}

let recommendedUsersRequest = null;
let sidebarOverflowResizeHandler = null;
let sidebarOverflowResizeTimer = null;
let sidebarOverflowAbortController = null;
let mobileSidebarOpen = false;
let mobileSidebarHistoryEntry = false;
let mobileSidebarAbortController = null;
let isMobileSidebarClosing = false;

function isMobileSidebarViewport() {
    return matchesMedia('(max-width: 544px)');
}

export function closeMobileSidebar({ fromHistory = false } = {}) {
    const overlay = document.getElementById('mobile-sidebar-overlay');
    if (!mobileSidebarOpen && !overlay) return;
    if (isMobileSidebarClosing) return;

    isMobileSidebarClosing = true;
    mobileSidebarOpen = false;
    document.body.classList.remove('mobile-sidebar-open');
    mobileSidebarAbortController?.abort();
    mobileSidebarAbortController = null;

    if (overlay) {
        overlay.classList.add('is-closing');
        const finishClose = () => {
            overlay.remove();
            isMobileSidebarClosing = false;
        };
        const timer = setTimeout(finishClose, 210);
        overlay.addEventListener('animationend', () => {
            clearTimeout(timer);
            finishClose();
        }, { once: true });
    } else {
        isMobileSidebarClosing = false;
    }

    if (mobileSidebarHistoryEntry && !fromHistory) {
        mobileSidebarHistoryEntry = false;
        window.history.back();
    } else {
        mobileSidebarHistoryEntry = false;
    }
}

function setupMobileSidebarOverflow(overlay, signal) {
    const menu = overlay.querySelector('.mobile-sidebar-menu');
    const postButton = menu?.querySelector('.nav-item-post');
    const menuLinks = menu
        ? [...menu.querySelectorAll(':scope > a.nav-item')]
        : [];
    if (!menu || menuLinks.length === 0) return () => false;

    // 高さあふれの自動移動が手動設定を上書きしないよう、手動固定項目は計算から外す
    const pinnedLinks = menuLinks.filter((item) =>
        item.hasAttribute('data-menu-overflow'),
    );
    const flexLinks = menuLinks.filter((item) =>
        !item.hasAttribute('data-menu-overflow'),
    );

    const overflow = document.createElement('div');
    overflow.className = 'nav-overflow-menu mobile-nav-overflow-menu nui-nav';
    overflow.innerHTML = `
        <button type="button" class="nav-item nav-overflow-toggle nui-nav-item" aria-expanded="false" aria-controls="mobile-nav-overflow-panel">
            <span class="nav-item-icon-container">${ICONS.more}</span>
            <span class="nav-item-text">その他</span>
        </button>
        <div id="mobile-nav-overflow-panel" class="nav-overflow-panel hidden" role="menu"></div>`;
    const toggle = overflow.querySelector('.nav-overflow-toggle');
    const panel = overflow.querySelector('.nav-overflow-panel');
    let scheduled = false;

    const closeOverflow = () => {
        const wasOpen = overflow.classList.contains('is-open');
        overflow.classList.remove('is-open');
        panel.classList.add('hidden');
        toggle?.setAttribute('aria-expanded', 'false');
        return wasOpen;
    };
    const positionOverflowPanel = () => {
        if (!toggle || panel.classList.contains('hidden')) return;
        const edgeMargin = 8;
        const gap = 6;
        const toggleRect = toggle.getBoundingClientRect();
        const panelWidth = Math.min(240, Math.max(0, window.innerWidth - edgeMargin * 2));
        panel.style.width = `${panelWidth}px`;
        panel.style.maxHeight = `${Math.max(0, window.innerHeight - edgeMargin * 2)}px`;

        const panelHeight = panel.offsetHeight;
        const panelWidthAfterLayout = panel.offsetWidth;
        let top = toggleRect.bottom + gap;
        if (top + panelHeight > window.innerHeight - edgeMargin) {
            top = toggleRect.top - panelHeight - gap;
        }
        top = Math.max(edgeMargin, Math.min(top, window.innerHeight - panelHeight - edgeMargin));
        const left = Math.max(
            edgeMargin,
            Math.min(toggleRect.left, window.innerWidth - panelWidthAfterLayout - edgeMargin),
        );
        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
    };
    const toggleOverflow = () => {
        const isOpen = overflow.classList.toggle('is-open');
        panel.classList.toggle('hidden', !isOpen);
        toggle?.setAttribute('aria-expanded', String(isOpen));
        if (isOpen) positionOverflowPanel();
    };
    const applyOverflow = () => {
        scheduled = false;
        if (!menu.isConnected) return;
        menu.insertBefore(overflow, postButton || null);
        menuLinks.forEach((item) => menu.insertBefore(item, overflow));
        panel.replaceChildren();
        closeOverflow();
        // replaceChildren() で panel から外れるため、手動固定した項目を必ず戻す
        pinnedLinks.forEach((item) => panel.append(item));

        let visibleCount = flexLinks.length;
        while (menu.scrollHeight > menu.clientHeight && visibleCount > 0) {
            visibleCount -= 1;
            panel.prepend(flexLinks[visibleCount]);
        }
        if (!pinnedLinks.length && visibleCount === flexLinks.length) overflow.remove();
    };
    const scheduleOverflow = () => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(applyOverflow);
    };

    scheduleOverflow();
    window.addEventListener('resize', scheduleOverflow, { passive: true, signal });
    toggle?.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleOverflow();
    }, { signal });
    document.addEventListener('click', (event) => {
        if (!overflow.contains(event.target)) closeOverflow();
    }, { signal });
    return closeOverflow;
}

export function openMobileSidebar() {
    if (!isMobileSidebarViewport()) return;
    if (mobileSidebarOpen || isMobileSidebarClosing) return;

    const overlay = document.createElement('div');
    overlay.id = 'mobile-sidebar-overlay';
    overlay.className = 'mobile-sidebar-overlay';
    const mobileAccountMarkup = (DOM.navMenuBottom.innerHTML || '')
        .replace(
            'id="account-button" class="nav-item account-button nui-nav-item"',
            'class="nav-item account-button nui-nav-item mobile-sidebar-account-button"',
        );
    overlay.innerHTML = `
        <aside class="mobile-sidebar-panel" aria-label="サイドメニュー" role="dialog" aria-modal="true">
            <div class="mobile-sidebar-content">
                <div class="mobile-sidebar-logo">${DOM.navLogo.innerHTML}</div>
                <nav class="mobile-sidebar-menu">${DOM.navMenuTop.dataset.mobileMenuMarkup || DOM.navMenuTop.innerHTML}</nav>
                <div class="mobile-sidebar-bottom">${mobileAccountMarkup}</div>
            </div>
        </aside>`;
    document.body.appendChild(overlay);
    mobileSidebarOpen = true;
    document.body.classList.add('mobile-sidebar-open');
    mobileSidebarAbortController = new AbortController();
    const { signal } = mobileSidebarAbortController;

    mobileSidebarHistoryEntry = true;
    window.history.pushState(
        { ...(window.history.state || {}), nyaitterMobileSidebar: true },
        '',
        window.location.href,
    );

    overlay.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target === overlay) {
            closeMobileSidebar();
            return;
        }

        if (target.closest('.nav-item-post')) {
            event.preventDefault();
            closeMobileSidebar();
            openPostModal();
            return;
        }
        if (target.closest('.mobile-sidebar-account-button')) {
            event.preventDefault();
            closeMobileSidebar();
            void openAccountSwitcherModal();
            return;
        }
        const navigationItem = target.closest('a.nav-item');
        if (navigationItem) {
            event.preventDefault();
            event.stopPropagation();
            const destinationHash = navigationItem.getAttribute('href') || '#';
            closeMobileSidebar({ fromHistory: true });
            window.history.replaceState(
                { ...(window.history.state || {}), nyaitterMobileSidebar: false },
                '',
                window.location.href,
            );
            if (destinationHash !== (window.location.hash || '#')) {
                window.location.hash = destinationHash;
            }
        }
    }, { signal });
    const closeMobileSidebarOverflow = setupMobileSidebarOverflow(overlay, signal);
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (!closeMobileSidebarOverflow()) closeMobileSidebar();
    }, { signal });

    let startX = null;
    let startY = null;
    let startTime = 0;
    const beginSwipe = (x, y) => {
        startX = x;
        startY = y;
        startTime = Date.now();
    };
    const finishSwipe = (x, y) => {
        if (startX === null || startY === null) return;
        const horizontalDistance = x - startX;
        const verticalDistance = y - startY;
        const elapsed = Date.now() - startTime;
        startX = null;
        startY = null;
        // 左スワイプ時にサイドバーを閉じる
        if (horizontalDistance <= -40 && (Math.abs(horizontalDistance) > Math.abs(verticalDistance) * 1.1 || elapsed < 500)) {
            closeMobileSidebar();
        }
    };

    // オーバーレイおよびサイドバーパネル内のどこからでも左スワイプで閉じられるようdocument全体で監視
    document.addEventListener('pointerdown', (event) => {
        if (!mobileSidebarOpen) return;
        beginSwipe(event.clientX, event.clientY);
    }, { signal });
    document.addEventListener('pointerup', (event) => {
        if (!mobileSidebarOpen) return;
        finishSwipe(event.clientX, event.clientY);
    }, { signal });
    document.addEventListener('pointercancel', () => {
        startX = null;
        startY = null;
    }, { signal });

    document.addEventListener('touchstart', (event) => {
        if (!mobileSidebarOpen) return;
        const touch = event.touches[0];
        if (touch) beginSwipe(touch.clientX, touch.clientY);
    }, { passive: true, signal });
    document.addEventListener('touchend', (event) => {
        if (!mobileSidebarOpen) return;
        const touch = event.changedTouches[0];
        if (touch) finishSwipe(touch.clientX, touch.clientY);
    }, { passive: true, signal });
    document.addEventListener('touchcancel', () => {
        startX = null;
        startY = null;
    }, { passive: true, signal });
}

window.addEventListener('popstate', () => {
    if (mobileSidebarOpen) closeMobileSidebar({ fromHistory: true });
});

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
    const widgetLinks = globalThis.NyaitterClientConfig?.widgetLinks;
    const linkItems = Array.isArray(widgetLinks) ? widgetLinks : [];
    if (DOM.rightSidebar.links) {
        DOM.rightSidebar.links.innerHTML = linkItems
            .map((item) => {
                const name = escapeHTML(String(item?.name || 'リンク'));
                const rawUrl = String(item?.url || item?.link || '#');
                const url = escapeHTML(getSafeWidgetUrl(rawUrl));
                const external = /^https:\/\//i.test(rawUrl);
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
                    <img src="${getUserIconUrl(user)}" class="user-icon" style="width:40px;height:40px;" alt="${escapeHTML(user.name)}'s icon">
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
    if (sidebarOverflowAbortController) {
        sidebarOverflowAbortController.abort();
        sidebarOverflowAbortController = null;
    }

    if (!sidebarOverflowResizeHandler) {
        sidebarOverflowResizeHandler = () => {
            window.clearTimeout(sidebarOverflowResizeTimer);
            sidebarOverflowResizeTimer = window.setTimeout(
                setupSidebarOverflowMenu,
                100,
            );
        };
        window.addEventListener('resize', sidebarOverflowResizeHandler, { passive: true });

        const mql = window.matchMedia?.('(max-width: 544px)');
        if (mql?.addEventListener) {
            mql.addEventListener('change', () => {
                window.clearTimeout(sidebarOverflowResizeTimer);
                sidebarOverflowResizeTimer = window.setTimeout(setupSidebarOverflowMenu, 50);
            });
        }
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

    if (matchesMedia('(max-width: 544px)')) return;

    const logo = DOM.navLogo;
    const menuBottom = DOM.navMenuBottom;
    const postButton = menu?.querySelector('.nav-item-post');
    const menuLinks = menu
        ? [...menu.querySelectorAll(':scope > a.nav-item')]
        : [];
    if (!sidebar || !menu || menuLinks.length === 0) return;

    // 高さあふれの自動移動が手動設定を上書きしないよう、手動固定項目は計算から外す
    const pinnedLinks = menuLinks.filter((item) =>
        item.hasAttribute('data-menu-overflow'),
    );
    const flexLinks = menuLinks.filter((item) =>
        !item.hasAttribute('data-menu-overflow'),
    );

    const availableMenuHeight = () =>
        Math.max(
            0,
            sidebar.clientHeight -
                (logo?.offsetHeight || 0) -
                (menuBottom?.offsetHeight || 0) -
                24,
        );

    if (!pinnedLinks.length && menu.scrollHeight <= availableMenuHeight()) return;

    const overflow = document.createElement('div');
    overflow.className = 'nav-overflow-menu nui-nav';
    overflow.innerHTML = `
        <button type="button" class="nav-item nav-overflow-toggle nui-nav-item" aria-expanded="false" aria-controls="nav-overflow-panel">
            <span class="nav-item-icon-container">${ICONS.more}</span>
            <span class="nav-item-text">その他</span>
        </button>
        <div id="nav-overflow-panel" class="nav-overflow-panel hidden" role="menu"></div>`;
    const toggle = overflow.querySelector('.nav-overflow-toggle');
    const panel = overflow.querySelector('.nav-overflow-panel');
    menu.insertBefore(overflow, postButton || null);

    const fitsInSidebar = () => menu.scrollHeight <= availableMenuHeight();

    pinnedLinks.forEach((item) => panel.append(item));

    let visibleCount = flexLinks.length;
    while (!fitsInSidebar() && visibleCount > 0) {
        visibleCount -= 1;
        panel.prepend(flexLinks[visibleCount]);
    }

    if (!pinnedLinks.length && visibleCount === flexLinks.length) {
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
        { key: 'home', name: 'ホーム', hash: '#', icon: ICONS.home },
        { key: 'explore', name: '検索', hash: '#explore', icon: ICONS.explore },
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
                key: 'notifications',
                name: '通知',
                hash: '#notifications',
                icon: ICONS.notifications,
                badge: getCurrentUser().notification_unread_count,
            },
            {
                key: 'likes',
                name: 'いいね',
                hash: '#likes',
                icon: ICONS.likes,
            },
            {
                key: 'stars',
                name: 'お気に入り',
                hash: '#stars',
                icon: ICONS.stars,
            },
            {
                key: 'dm',
                name: 'メッセージ',
                hash: '#dm',
                icon: ICONS.dm,
                badge: totalUnreadDmCount,
            },
            {
                key: 'profile',
                name: 'プロフィール',
                hash: '#profile/',
                dynamicHash: true,
                icon: ICONS.profile,
            },
            {
                key: 'settings',
                name: '設定',
                hash: '#settings',
                icon: ICONS.settings,
            },
            {
                key: 'spaces',
                name: 'ステージ',
                hash: '#stages',
                icon: ICONS.megaphone,
            },
            {
                key: 'groups',
                name: 'グループ',
                hash: '#groups',
                icon: ICONS.group,
            },
        );
        if (getCurrentUser().admin) {
            menuItems.push({
                key: 'admin_reports',
                name: 'リクエスト',
                hash: '#admin/reports',
                icon: ICONS.mask,
            });
        }
    }

    const sideMenu = getSavedSideMenu();
    const pcZones = applySideMenuZones(menuItems, sideMenu.pc);
    const mobileZones = applySideMenuZones(menuItems, sideMenu.mobile);
    const mobileHiddenKeys = new Set(mobileZones.moreItems.map((item) => item.key));
    // モバイルでは下段バーがPCのDOMをCSSのorderで並べ替えるため、並び順を項目に焼き付ける。
    const mobileOrderOf = new Map(
        [...mobileZones.barItems, ...mobileZones.moreItems].map((item, index) => [
            item.key,
            index,
        ]),
    );
    const toPcEntries = (items, overflow) =>
        items.map((item) => ({
            item,
            overflow,
            mobileOrder: mobileOrderOf.get(item.key) ?? 0,
            mobileHidden: mobileHiddenKeys.has(item.key),
        }));
    const toMobileEntries = (items, overflow) =>
        items.map((item) => ({ item, overflow }));

    const renderMenuMarkup = (entries) => `${entries
        .map((entry) => {
            const item = entry.item;
            // プロフィールのみIDを要するため解決してから既存のactive判定を行う
            const href = item.dynamicHash
                ? `#profile/${getCurrentUser()?.id}`
                : item.hash;
            let isActive = false;
            if (href === '#') {
                isActive = hash === '#' || hash === '';
            } else if (href === '#settings') {
                isActive = hash === '#settings' || hash.startsWith('#settings/');
            } else {
                isActive = hash.startsWith(href);
            }
            const mobileOrderStyle = Number.isInteger(entry.mobileOrder)
                ? ` style="--mord:${entry.mobileOrder}"`
                : '';
            return `
                <a href="${href}" class="nav-item nui-nav-item ${href === '#admin/reports' ? 'nav-item-request' : ''} ${isActive ? 'active' : ''}"${
                    entry.overflow ? ' data-menu-overflow="1"' : ''
                }${mobileOrderStyle}${entry.mobileHidden ? ' data-mobile-hidden="1"' : ''}>
                    <div class="nav-item-icon-container">
                        ${item.icon}
                        ${item.badge && item.badge > 0 ? `<span class="notification-badge">${item.badge > 99 ? '99+' : item.badge}</span>` : ''}
                    </div>
                    <span class="nav-item-text">${item.name}</span>
                </a>`;
        })
        .join('')}${
            getCurrentUser()
                ? `<button class="nav-item nav-item-post"><span class="nav-item-text">ポスト</span><span class="nav-item-icon">${ICONS.send}</span></button>`
                : ''
        }`;

    DOM.navLogo.innerHTML = `<a href="#" class="nav-logo-img">${ICONS.nyaitter_logo}</a>`;

    const fullMenuMarkup = renderMenuMarkup([
        ...toPcEntries(pcZones.barItems, false),
        ...toPcEntries(pcZones.moreItems, true),
    ]);
    // PC側の高さ調整でlive DOMが組み替わっても、ドロワーはモバイル設定順を維持する
    const mobileMenuMarkup = renderMenuMarkup([
        ...toMobileEntries(mobileZones.barItems, false),
        ...toMobileEntries(mobileZones.moreItems, true),
    ]);
    DOM.navMenuTop.innerHTML = fullMenuMarkup;
    DOM.navMenuTop.dataset.mobileMenuMarkup = mobileMenuMarkup;

    DOM.navMenuBottom.innerHTML = getCurrentUser()
        ? `<button id="account-button" class="nav-item account-button nui-nav-item">
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
        ?.addEventListener('click', () => {
            if (isMobileSidebarViewport()) openMobileSidebar();
            else void openAccountSwitcherModal();
        });
    DOM.navMenuTop
        .querySelector('.nav-item-post')
        ?.addEventListener('click', () => openPostModal());

    const postButton = document.getElementsByClassName('nav-item-post')[0];
    const accountButton = document.getElementById('account-button');
    if (postButton) {
        if (matchesMedia('(max-width: 544px)') && location.hash.startsWith('#dm')) {
            postButton.classList.add('hidden');
        } else {
            postButton.classList.remove('hidden');
        }
    }
    if (accountButton) {
        // メッセージ画面では操作領域を確保するため、入口アイコンを非表示にする。
        accountButton.classList.toggle(
            'hidden',
            matchesMedia('(max-width: 544px)') && location.hash.startsWith('#dm'),
        );
    }

    scheduleNextFrame(setupSidebarOverflowMenu);
    await loadRightSidebar();
}
