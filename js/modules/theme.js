import { DOM } from '../dom.js';
import { getCurrentUser, getIsDarkmode, setIsDarkmode } from '../state.js';
import { matchesMedia } from '../utils/helpers.js';

export const POSTS_PER_PAGE = 30;
export const DATA_SAVER_POSTS_PER_PAGE = 12;
export const DATA_SAVER_USERS_PER_PAGE = 10;
export const DATA_SAVER_MEDIA_PER_PAGE = 6;
export const DATA_SAVER_NOTIFICATIONS_PER_PAGE = 12;

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const COLOR_THEME_PRESETS = Object.freeze({
    nyaitter: Object.freeze({
        primary_color: '#ff9900',
        primary_hover_color: '#e88b00',
        light_primary_color: '#ffebcc',
        dark_light_primary_color: '#8f5600',
    }),
    nyax: Object.freeze({
        primary_color: '#1d9bf0',
        primary_hover_color: '#1a8cd8',
        light_primary_color: '#cce6ff',
        dark_light_primary_color: '#004a8f',
    }),
});

export const COLOR_THEME_CSS_VARIABLES = Object.freeze({
    primary_color: '--primary-color',
    primary_hover_color: '--primary-hover-color',
    light_primary_color: '--l-light-primary-color',
    dark_light_primary_color: '--d-light-primary-color',
});

export function isDataSaverEnabled() {
    return Boolean(getCurrentUser()?.settings?.data_saver);
}

export function getPostsPerPage() {
    return isDataSaverEnabled() ? DATA_SAVER_POSTS_PER_PAGE : POSTS_PER_PAGE;
}

export function getUsersPerPage() {
    return isDataSaverEnabled() ? DATA_SAVER_USERS_PER_PAGE : 20;
}

export function getMediaPerPage() {
    return isDataSaverEnabled() ? DATA_SAVER_MEDIA_PER_PAGE : 12;
}

export function getNotificationsPerPage() {
    return isDataSaverEnabled() ? DATA_SAVER_NOTIFICATIONS_PER_PAGE : 30;
}

export function normalizeColorTheme(value) {
    return ['nyaitter', 'nyax', 'custom'].includes(value)
        ? value
        : 'nyaitter';
}

export function getSafeColorPalette(colorTheme, customColors = {}) {
    const theme = normalizeColorTheme(colorTheme);
    const basePalette = COLOR_THEME_PRESETS.nyaitter;
    if (theme !== 'custom') return COLOR_THEME_PRESETS[theme];

    return Object.fromEntries(
        Object.entries(basePalette).map(([key, fallback]) => [
            key,
            typeof customColors?.[key] === 'string' &&
            HEX_COLOR_PATTERN.test(customColors[key])
                ? customColors[key].toLowerCase()
                : fallback,
        ]),
    );
}

export function applyColorTheme(settings = {}) {
    const colorTheme = normalizeColorTheme(settings?.color_theme);
    const palette = getSafeColorPalette(colorTheme, settings?.custom_colors);
    const rootStyle = document.documentElement.style;
    for (const [key, cssVariable] of Object.entries(COLOR_THEME_CSS_VARIABLES)) {
        rootStyle.setProperty(cssVariable, palette[key]);
    }
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = palette.primary_color;
    return { colorTheme, palette };
}

export function getCustomColorsFromInputs(root = document) {
    const requestedColors = {};
    root.querySelectorAll('.settings-color-code[data-color-key]').forEach((input) => {
        requestedColors[input.dataset.colorKey] = input.value.trim();
    });
    return getSafeColorPalette('custom', requestedColors);
}

export function applyInterfaceTheme(themePreference = null) {
    const preference = themePreference || getCurrentUser()?.settings?.theme || 'auto';
    const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark =
        preference === 'dark' || (preference === 'auto' && darkThemeMq.matches);
    setIsDarkmode(isDark);
    document.documentElement.setAttribute(
        'data-theme',
        isDark ? 'dark' : 'light',
    );
    document.body.classList.toggle('dark', isDark);
    document.body.classList.toggle('light', !isDark);
    applyColorTheme(getCurrentUser()?.settings || {});
}

// Pull to refresh support
const dynamicPtrHandlers = new Map();

export function registerDynamicPtrHandler(key, handler) {
    if (typeof handler === 'function') {
        dynamicPtrHandlers.set(key, handler);
        updatePullToRefreshAvailability();
    }
}

export function unregisterDynamicPtrHandler(key) {
    dynamicPtrHandlers.delete(key);
    updatePullToRefreshAvailability();
}

export function isPullToRefreshTouchCapable() {
    return Number(globalThis.navigator?.maxTouchPoints || 0) > 0
        || matchesMedia('(any-pointer: coarse)');
}

export function getActivePullToRefreshContext() {
    // Check if there is an active screen or tab with a dynamic handler
    for (const [key, handler] of dynamicPtrHandlers.entries()) {
        const elem = document.getElementById(key) || document.querySelector(key);
        if (elem && !elem.classList.contains('hidden') && elem.offsetParent !== null) {
            return { type: 'dynamic', key, handler };
        }
    }

    const currentHash = window.location.hash || '#';
    if (currentHash === '#' || currentHash === '') {
        const mainScreen = document.getElementById('main-screen');
        if (mainScreen && !mainScreen.classList.contains('hidden')) {
            return { type: 'timeline', key: 'main' };
        }
    }
    if (currentHash === '#notifications') {
        const notificationsScreen = document.getElementById('notifications-screen');
        if (notificationsScreen && !notificationsScreen.classList.contains('hidden')) {
            return { type: 'notifications' };
        }
    }
    if (currentHash === '#dm' || currentHash.startsWith('#dm/')) {
        const dmScreen = document.getElementById('dm-screen');
        if (dmScreen && !dmScreen.classList.contains('hidden')) {
            return { type: 'dm' };
        }
    }
    if (currentHash === '#explore') {
        const exploreScreen = document.getElementById('explore-screen');
        if (exploreScreen && !exploreScreen.classList.contains('hidden')) {
            return { type: 'explore' };
        }
    }
    if (currentHash === '#groups' || currentHash.startsWith('#group/')) {
        const groupScreen = document.getElementById('group-screen') || document.getElementById('groups-screen');
        if (groupScreen && !groupScreen.classList.contains('hidden')) {
            return { type: 'group' };
        }
    }
    const postDetailMatch = currentHash.match(/^#\/?post\/(\d+)/i);
    if (postDetailMatch) {
        const postDetailScreen = document.getElementById('post-detail-screen');
        if (postDetailScreen && !postDetailScreen.classList.contains('hidden')) {
            return { type: 'post-detail', postId: Number(postDetailMatch[1]) };
        }
    }
    const profileMatch = currentHash.match(/^#profile\/(\d+)(?:\/([^/]+))?$/);
    if (profileMatch) {
        const profileScreen = document.getElementById('profile-screen');
        if (profileScreen && !profileScreen.classList.contains('hidden')) {
            return {
                type: 'profile',
                userId: Number(profileMatch[1]),
                subpage: profileMatch[2] || '',
            };
        }
    }
    return null;
}

export function updatePullToRefreshAvailability() {
    const indicator = document.getElementById('pull-to-refresh-indicator');
    if (!indicator) return;
    const available = Boolean(
        isPullToRefreshTouchCapable() && getActivePullToRefreshContext(),
    );
    document.documentElement.classList.toggle('pull-to-refresh-enabled', available);
    document.body.classList.toggle('pull-to-refresh-enabled', available);
    if (!available) {
        indicator.classList.remove('is-pulling', 'is-ready', 'is-refreshing');
        indicator.style.setProperty('--pull-distance', '0px');
        indicator.style.setProperty('--pull-opacity', '0');
        indicator.setAttribute('aria-hidden', 'true');
    }
}

let ptrInitialized = false;
let ptrOnRefresh = null;
export function setupTimelinePullToRefresh(onRefresh) {
    ptrOnRefresh = typeof onRefresh === 'function' ? onRefresh : null;
    if (ptrInitialized) {
        updatePullToRefreshAvailability();
        return;
    }
    ptrInitialized = true;

    const indicator = document.getElementById('pull-to-refresh-indicator');
    if (!indicator) return;

    let startX = 0;
    let startY = 0;
    let startScrollY = 0;
    let trackingPull = false;
    let pullActive = false;
    let refreshInProgress = false;

    const MAX_PULL_DISTANCE = 104;
    const PULL_THRESHOLD = 66;

    const canStartPull = (target) => {
        if (window.scrollY > 0) return false;
        if (!getActivePullToRefreshContext()) return false;
        if (target && target.closest('.modal-overlay:not(.hidden), textarea, input[type="text"], input[type="search"]')) {
            return false;
        }
        return true;
    };

    const resetIndicator = () => {
        pullActive = false;
        indicator.classList.remove('is-pulling', 'is-ready', 'is-refreshing');
        indicator.style.setProperty('--pull-distance', '0px');
        indicator.style.setProperty('--pull-opacity', '0');
        indicator.setAttribute('aria-hidden', 'true');
        const label = indicator.querySelector('.pull-to-refresh-label');
        if (label) label.textContent = '引いて更新';
    };

    const showPullProgress = (distance) => {
        const pullDistance = Math.min(distance, MAX_PULL_DISTANCE);
        const ready = pullDistance >= PULL_THRESHOLD;
        indicator.classList.add('is-pulling');
        indicator.classList.remove('is-refreshing');
        indicator.classList.toggle('is-ready', ready);
        indicator.style.setProperty('--pull-distance', `${pullDistance}px`);
        indicator.style.setProperty('--pull-opacity', String(Math.min(1, pullDistance / 34)));
        indicator.setAttribute('aria-hidden', 'false');
        const label = indicator.querySelector('.pull-to-refresh-label');
        if (label) label.textContent = ready ? '離して更新' : '引いて更新';
    };

    const runRefresh = async () => {
        if (refreshInProgress || !getActivePullToRefreshContext() || !ptrOnRefresh) return;
        refreshInProgress = true;
        indicator.classList.remove('is-pulling', 'is-ready');
        indicator.classList.add('is-refreshing');
        indicator.style.setProperty('--pull-distance', '0px');
        indicator.style.setProperty('--pull-opacity', '1');
        const label = indicator.querySelector('.pull-to-refresh-label');
        if (label) label.textContent = '更新中';

        try {
            if (ptrOnRefresh) {
                await ptrOnRefresh(getActivePullToRefreshContext());
            }
        } finally {
            setTimeout(() => {
                refreshInProgress = false;
                resetIndicator();
            }, 220);
        }
    };

    document.addEventListener('touchstart', (event) => {
        updatePullToRefreshAvailability();
        if (refreshInProgress || !isPullToRefreshTouchCapable()) return;
        const target = event.target instanceof Element ? event.target : null;
        const touch = event.touches[0];
        if (!target || !touch || !canStartPull(target)) return;
        startX = touch.clientX;
        startY = touch.clientY;
        startScrollY = Math.max(0, window.scrollY || 0);
        trackingPull = true;
    }, { passive: true });

    document.addEventListener('touchmove', (event) => {
        if (!trackingPull || refreshInProgress) return;
        const touch = event.touches[0];
        if (!touch) {
            trackingPull = false;
            resetIndicator();
            return;
        }

        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
            if (pullActive) resetIndicator();
            return;
        }

        if (window.scrollY > 1) return;
        const pullDistance = Math.max(0, deltaY - startScrollY);
        const distance = Math.min(MAX_PULL_DISTANCE, pullDistance * 0.55);
        if (distance < 4) return;
        pullActive = true;
        showPullProgress(distance);
        if (event.cancelable) event.preventDefault();
    }, { passive: false });

    const finishPull = () => {
        if (!trackingPull) return;
        trackingPull = false;
        startScrollY = 0;
        const shouldRefresh =
            pullActive &&
            Number.parseFloat(indicator.style.getPropertyValue('--pull-distance')) >= PULL_THRESHOLD;
        if (!shouldRefresh) {
            resetIndicator();
            return;
        }
        void runRefresh();
    };

    document.addEventListener('touchend', finishPull, { passive: true });
    document.addEventListener('touchcancel', () => {
        trackingPull = false;
        startScrollY = 0;
        if (!refreshInProgress) resetIndicator();
    }, { passive: true });

    document.addEventListener('keydown', (event) => {
        if (event.repeat || !event.altKey || event.ctrlKey || event.metaKey
            || String(event.key || '').toLowerCase() !== 'r') return;
        if (!getActivePullToRefreshContext()) return;
        event.preventDefault();
        void runRefresh();
    });

    window.addEventListener('resize', updatePullToRefreshAvailability, { passive: true });
    updatePullToRefreshAvailability();
}
