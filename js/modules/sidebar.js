import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { apiRequest } from '../api.js';
import { trackSearchComposition } from '../utils/searchIme.js';
import { rankAvatarAttributes } from './rankAvatarIntegration.js';
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

import { t } from './i18n.js';
import { openPostModal } from './posts.js';
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

// html には zoom: var(--app-scale) が掛かっている。
// getBoundingClientRect() は zoom 後の視覚座標を返す一方、position: fixed の
// top/left は layout 座標として扱われ、描画時に再度 zoom される。
// 視覚座標をそのまま入れないよう、座標を scale で割り戻す。
function getAppScale() {
    if (typeof document === 'undefined') return 1;
    const scale = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--app-scale'),
    );
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

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
            <span class="nav-item-text">${t('nav.more')}</span>
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
        const scale = getAppScale();
        const toggleRect = toggle.getBoundingClientRect();
        const panelWidth = Math.min(240, Math.max(0, window.innerWidth - edgeMargin * 2));
        panel.style.width = `${panelWidth}px`;
        panel.style.maxHeight = `${Math.max(0, window.innerHeight - edgeMargin * 2)}px`;

        // rect / innerWidth は視覚座標、offsetHeight / offsetWidth は layout 座標。
        // 判定は視覚座標に揃え、style.top/left へ入れるときに scale で割り戻す。
        const panelHeight = panel.offsetHeight * scale;
        const panelWidthAfterLayout = panel.offsetWidth * scale;
        let top = toggleRect.bottom + gap;
        if (top + panelHeight > window.innerHeight - edgeMargin) {
            top = toggleRect.top - panelHeight - gap;
        }
        top = Math.max(edgeMargin, Math.min(top, window.innerHeight - panelHeight - edgeMargin));
        const left = Math.max(
            edgeMargin,
            Math.min(toggleRect.left, window.innerWidth - panelWidthAfterLayout - edgeMargin),
        );
        panel.style.top = `${top / scale}px`;
        panel.style.left = `${left / scale}px`;
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
        <aside class="mobile-sidebar-panel" aria-label="${t('nav.menu')}" role="dialog" aria-modal="true">
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
        DOM.rightSidebar.searchWidget.innerHTML = `<div class="sidebar-search-widget">${ICONS.explore}<input type="search" id="sidebar-search-input" placeholder="${t('nav.search_placeholder')}"></div>`;
        const searchInput = document.getElementById('sidebar-search-input');
        const isComposing = searchInput && trackSearchComposition(searchInput);
        searchInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !isComposing(e)) {
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
            recommendedUsersRequest = apiRequest('/server/users/recommended')
                .then((result) => {
                    if (!result.error) {
                        setRecommendedUsersCache(
                            Array.isArray(result.data?.users) ? result.data.users : [],
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
                const name = escapeHTML(String(item?.name || t('nav.link')));
                const rawUrl = String(item?.url || item?.link || '#');
                const url = escapeHTML(getSafeWidgetUrl(rawUrl));
                const external = /^https:\/\//i.test(rawUrl);
                return `<a href="${url}" class="link"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${name}</a>`;
            })
            .join('');
    }

    const currentUser = getCurrentUser();
    const recommendedUsers = (Array.isArray(data) ? data : []).filter((user) => (
        !currentUser
        || (!userIdListIncludes(currentUser.follow, user.id) && !isCurrentUserProfile(user))
    ));
    if (error || recommendedUsers.length === 0) {
        if (DOM.rightSidebar.recommendations) {
            DOM.rightSidebar.recommendations.innerHTML = '';
        }
        return;
    }

    let recHTML = `<div class="widget-title">${t('nav.recommended_users')}</div>`;
    recHTML += recommendedUsers
        .map((user) => `<div class="widget-item recommend-user">
                <a href="#profile/${user.id}" class="profile-link" style="text-decoration:none; color:inherit; display:flex; align-items:center; gap:0.5rem;">
                    <img ${rankAvatarAttributes(user)} src="${getUserIconUrl(user)}" class="user-icon" style="width:40px;height:40px;" alt="${escapeHTML(user.name)}'s icon">
                    <div>
                        <span>${getEmoji(escapeHTML(user.name))}</span>
                        <small style="color:var(--secondary-text-color); display:block;">${getNyaitterId(user)}</small>
                    </div>
                </a>
                ${currentUser ? `<button class="follow-button-not-following" data-user-id="${user.id}">${t('nav.follow')}</button>` : ''}
            </div>`)
        .join('');

    if (DOM.rightSidebar.recommendations) {
        DOM.rightSidebar.recommendations.innerHTML = `<div class="sidebar-widget">${recHTML}</div>`;
    }

    DOM.rightSidebar.recommendations
        ?.querySelectorAll('.recommend-user button')
        .forEach((button) => {
            const userId = parseInt(button.dataset.userId, 10);
            if (isNaN(userId)) return;
            button.onclick = async () => {
                await window.handleFollowToggle(userId, button);
                if (userIdListIncludes(getCurrentUser()?.follow, userId)) {
                    setRecommendedUsersCache(null);
                    void loadRightSidebar();
                }
            };
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
            <span class="nav-item-text">${t('nav.more')}</span>
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
        const scale = getAppScale();
        const toggleRect = toggle.getBoundingClientRect();
        const panelWidth = Math.min(
            240,
            Math.max(0, window.innerWidth - edgeMargin * 2),
        );
        panel.style.width = `${panelWidth}px`;
        panel.style.maxHeight = `${Math.max(0, window.innerHeight - edgeMargin * 2)}px`;

        // rect / innerWidth は視覚座標、offsetHeight / offsetWidth は layout 座標。
        // 判定は視覚座標に揃え、style.top/left へ入れるときに scale で割り戻す。
        const panelHeight = panel.offsetHeight * scale;
        const panelWidthAfterLayout = panel.offsetWidth * scale;
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
        panel.style.top = `${top / scale}px`;
        panel.style.left = `${left / scale}px`;
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
        { key: 'home', name: t('nav.home'), hash: '#', icon: ICONS.home },
        { key: 'explore', name: t('nav.explore'), hash: '#explore', icon: ICONS.explore },
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
                name: t('nav.notifications'),
                hash: '#notifications',
                icon: ICONS.notifications,
                badge: getCurrentUser().notification_unread_count,
            },
            {
                key: 'likes',
                name: t('nav.likes'),
                hash: '#likes',
                icon: ICONS.likes,
            },
            {
                key: 'stars',
                name: t('nav.stars'),
                hash: '#stars',
                icon: ICONS.stars,
            },
            {
                key: 'dm',
                name: t('nav.dm'),
                hash: '#dm',
                icon: ICONS.dm,
                badge: totalUnreadDmCount,
            },
            {
                key: 'profile',
                name: t('nav.profile'),
                hash: '#profile/',
                dynamicHash: true,
                icon: ICONS.profile,
            },
            {
                key: 'settings',
                name: t('nav.settings'),
                hash: '#settings',
                icon: ICONS.settings,
            },
            {
                key: 'spaces',
                name: t('nav.spaces'),
                hash: '#stages',
                icon: ICONS.megaphone,
            },
            {
                key: 'groups',
                name: t('nav.groups'),
                hash: '#groups',
                icon: ICONS.group,
            },
        );
        if (getCurrentUser().admin) {
            menuItems.push({
                key: 'admin_reports',
                name: t('nav.admin_reports'),
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
                <a href="${href}" class="nav-item nui-nav-item ${href === '#admin/reports' ? 'nav-item-request' : ''} ${isActive ? 'active' : ''}" aria-label="${escapeHTML(item.name)}"${
                    isActive ? ' aria-current="page"' : ''
                }${
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
                ? `<button class="nav-item nav-item-post"><span class="nav-item-text">${t('composer.submit')}</span><span class="nav-item-icon">${ICONS.send}</span></button>`
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
            <img ${rankAvatarAttributes(getCurrentUser())} src="${getUserIconUrl(getCurrentUser())}" class="user-icon" alt="${escapeHTML(getCurrentUser().name)}'s icon">
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
    if (postButton) {
        // DMでは送信フォームと重なるため、右下のポストボタンだけを隠す。
        postButton.classList.toggle(
            'hidden',
            matchesMedia('(max-width: 544px)') && location.hash.startsWith('#dm'),
        );
    }
    // アカウント切替はDMでも常に使えるようにする（以前はDMで隠していた）。

    scheduleNextFrame(setupSidebarOverflowMenu);
    await loadRightSidebar();
}

// サイドメニュー項目の一元定義。この並び順がPC既定の表示順になる。
export const ALL_SIDEBAR_ITEMS = Object.freeze([
    Object.freeze({
        key: 'home',
        name: t('nav.home'),
        labelKey: 'nav.home',
        hash: '#',
        icon: ICONS.home,
        auth: false,
        admin: false,
        mobileBarDefault: true,
    }),
    Object.freeze({
        key: 'explore',
        name: t('nav.explore'),
        labelKey: 'nav.explore',
        hash: '#explore',
        icon: ICONS.explore,
        auth: false,
        admin: false,
        mobileBarDefault: true,
    }),
    Object.freeze({
        key: 'notifications',
        name: t('nav.notifications'),
        labelKey: 'nav.notifications',
        hash: '#notifications',
        icon: ICONS.notifications,
        auth: true,
        admin: false,
        mobileBarDefault: true,
    }),
    Object.freeze({
        key: 'likes',
        name: t('nav.likes'),
        labelKey: 'nav.likes',
        hash: '#likes',
        icon: ICONS.likes,
        auth: true,
        admin: false,
        mobileBarDefault: false,
    }),
    Object.freeze({
        key: 'stars',
        name: t('nav.stars'),
        labelKey: 'nav.stars',
        hash: '#stars',
        icon: ICONS.stars,
        auth: true,
        admin: false,
        mobileBarDefault: false,
    }),
    Object.freeze({
        key: 'dm',
        name: t('dm.fallback_title'),
        labelKey: 'nav.dm',
        hash: '#dm',
        icon: ICONS.dm,
        auth: true,
        admin: false,
        mobileBarDefault: true,
    }),
    Object.freeze({
        // 実際のhrefはログインユーザーIDが必要なので sidebar.js 側で解決する。
        key: 'profile',
        name: t('nav.profile'),
        labelKey: 'nav.profile',
        hash: '#profile/',
        dynamicHash: true,
        icon: ICONS.profile,
        auth: true,
        admin: false,
        mobileBarDefault: true,
    }),
    Object.freeze({
        key: 'settings',
        name: t('nav.settings'),
        labelKey: 'nav.settings',
        hash: '#settings',
        icon: ICONS.settings,
        auth: true,
        admin: false,
        mobileBarDefault: true,
    }),
    Object.freeze({
        key: 'spaces',
        name: t('nav.spaces'),
        labelKey: 'nav.spaces',
        hash: '#stages',
        icon: ICONS.megaphone,
        auth: true,
        admin: false,
        mobileBarDefault: false,
    }),
    Object.freeze({
        key: 'groups',
        name: t('nav.groups'),
        labelKey: 'nav.groups',
        hash: '#groups',
        icon: ICONS.group,
        auth: true,
        admin: false,
        mobileBarDefault: false,
    }),
    Object.freeze({
        key: 'admin_reports',
        name: t('dm.request_suffix'),
        labelKey: 'nav.admin_reports',
        hash: '#admin/reports',
        icon: ICONS.mask,
        auth: true,
        admin: true,
        mobileBarDefault: false,
    }),
]);

export const SIDEBAR_ITEM_KEYS = Object.freeze(
    ALL_SIDEBAR_ITEMS.map((item) => item.key),
);

const KNOWN_KEYS = new Set(SIDEBAR_ITEM_KEYS);
const OUTLETS = Object.freeze(['pc', 'mobile']);

const MOBILE_BAR_KEYS = Object.freeze(
    ALL_SIDEBAR_ITEMS.filter((item) => item.mobileBarDefault).map((item) => item.key),
);
const MOBILE_MORE_KEYS = Object.freeze(
    ALL_SIDEBAR_ITEMS.filter((item) => !item.mobileBarDefault).map((item) => item.key),
);

export const DEFAULT_SIDEBAR = Object.freeze({
    pc: Object.freeze({
        bar: Object.freeze([...SIDEBAR_ITEM_KEYS]),
        more: Object.freeze([]),
    }),
    mobile: Object.freeze({
        bar: Object.freeze([...MOBILE_BAR_KEYS]),
        more: Object.freeze([...MOBILE_MORE_KEYS]),
    }),
});

function knownKeyList(value) {
    if (!Array.isArray(value)) return [];
    const seen = [];
    const seenSet = new Set();
    value.forEach((entry) => {
        if (typeof entry !== 'string') return;
        if (!KNOWN_KEYS.has(entry)) return;
        if (seenSet.has(entry)) return;
        seenSet.add(entry);
        seen.push(entry);
    });
    return seen;
}

function defaultZone(outlet) {
    return {
        bar: [...DEFAULT_SIDEBAR[outlet].bar],
        more: [...DEFAULT_SIDEBAR[outlet].more],
    };
}

function readZoneLists(source) {
    if (!source || typeof source !== 'object') return { bar: [], more: [] };
    return { bar: knownKeyList(source.bar), more: knownKeyList(source.more) };
}

function normalizeZone(lists, outlet) {
    const { bar, more: listedMore } = lists;
    if (bar.length === 0 && listedMore.length === 0) return defaultZone(outlet);
    const placed = new Set(bar);
    // 両ゾーンに同じキーが来た場合はbar側を優先し、重複を落とす
    const more = listedMore.filter((key) => {
        if (placed.has(key)) return false;
        placed.add(key);
        return true;
    });
    // 設定に載っていない項目はメニューから消えないようbar末尾に補完する
    const missing = SIDEBAR_ITEM_KEYS.filter((key) => !placed.has(key));
    return { bar: [...bar, ...missing], more };
}

export function normalizeSideMenu(raw) {
    const result = {};
    OUTLETS.forEach((outlet) => {
        result[outlet] = normalizeZone(readZoneLists(raw?.[outlet]), outlet);
    });
    return result;
}

function hasSideMenu(saved) {
    return OUTLETS.some((outlet) => {
        const lists = readZoneLists(saved?.[outlet]);
        return lists.bar.length > 0 || lists.more.length > 0;
    });
}

function isDefaultZone(outlet, zone) {
    const fallback = DEFAULT_SIDEBAR[outlet];
    return (
        zone.bar.length === fallback.bar.length &&
        zone.bar.every((key, index) => key === fallback.bar[index]) &&
        zone.more.length === fallback.more.length &&
        zone.more.every((key, index) => key === fallback.more[index])
    );
}

function isDefaultSideMenu(menu) {
    return OUTLETS.every((outlet) => isDefaultZone(outlet, menu[outlet]));
}

function mirrorKey(userId) {
    return `nyaitter_side_menu_${userId}`;
}

export function readSideMenuMirror(userId) {
    try {
        const stored = localStorage.getItem(mirrorKey(userId));
        if (!stored) return null;
        return JSON.parse(stored);
    } catch (_) {
        return null;
    }
}

export function writeSideMenuMirror(userId, value) {
    try {
        localStorage.setItem(mirrorKey(userId), JSON.stringify(value));
    } catch (_) {}
}

export function getSavedSideMenu() {
    const user = getCurrentUser();
    const userId = user?.id ?? 'guest';
    const saved = user?.settings?.side_menu;
    if (hasSideMenu(saved)) {
        // サーバー設定が最優先。認識できるなら既定と同一でも採用する。
        return normalizeSideMenu(saved);
    }
    const mirrored = normalizeSideMenu(readSideMenuMirror(userId));
    if (!isDefaultSideMenu(mirrored)) return mirrored;
    return normalizeSideMenu(DEFAULT_SIDEBAR);
}

export function applySideMenuZones(candidates, zones) {
    const items = Array.isArray(candidates) ? candidates : [];
    const barKeys = Array.isArray(zones?.bar) ? zones.bar : [];
    const moreKeys = Array.isArray(zones?.more) ? zones.more : [];

    const indexQueues = new Map();
    items.forEach((item, index) => {
        const key = item?.key;
        if (typeof key !== 'string') return;
        if (!indexQueues.has(key)) indexQueues.set(key, []);
        indexQueues.get(key).push(index);
    });

    const barItems = [];
    const moreItems = [];
    const used = new Set();
    const pull = (key, target) => {
        const queue = indexQueues.get(key);
        if (!Array.isArray(queue)) return;
        while (queue.length > 0) {
            const index = queue.shift();
            if (used.has(index)) continue;
            used.add(index);
            target.push(items[index]);
            return;
        }
    };

    barKeys.forEach((key) => pull(key, barItems));
    moreKeys.forEach((key) => pull(key, moreItems));
    // どちらのゾーンにも無いキーの候補はbar末尾に残し、項目を落とさない
    items.forEach((item, index) => {
        if (!used.has(index)) barItems.push(item);
    });

    return { barItems, moreItems };
}
