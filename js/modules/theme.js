import { DOM } from '../dom.js';
import { getCurrentUser, getIsDarkmode, setIsDarkmode } from '../state.js';
import { matchesMedia } from '../utils/helpers.js';

export const POSTS_PER_PAGE = 30;
export const DATA_SAVER_POSTS_PER_PAGE = 12;
export const DATA_SAVER_USERS_PER_PAGE = 10;
export const DATA_SAVER_MEDIA_PER_PAGE = 6;
export const DATA_SAVER_NOTIFICATIONS_PER_PAGE = 12;

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

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

export function normalizeColorTheme(theme) {
    if (theme === 'custom') return 'custom';
    if (['blue', 'green', 'orange', 'purple', 'red'].includes(theme)) {
        return theme;
    }
    return 'blue';
}

export function getSafeColorPalette(colors = {}) {
    const defaultPalette = {
        primary: '#1d9bf0',
        secondary: '#0c7abf',
        accent: '#e8f5fe',
        border: '#cbe7fb',
    };
    const hexPattern = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
    return {
        primary: hexPattern.test(colors?.primary) ? colors.primary : defaultPalette.primary,
        secondary: hexPattern.test(colors?.secondary) ? colors.secondary : defaultPalette.secondary,
        accent: hexPattern.test(colors?.accent) ? colors.accent : defaultPalette.accent,
        border: hexPattern.test(colors?.border) ? colors.border : defaultPalette.border,
    };
}

export function applyColorTheme(theme, customColors = null) {
    const root = document.documentElement;
    const normalizedTheme = normalizeColorTheme(theme);
    root.setAttribute('data-color-theme', normalizedTheme);
    if (normalizedTheme === 'custom' && customColors) {
        const palette = getSafeColorPalette(customColors);
        root.style.setProperty('--primary-color', palette.primary);
        root.style.setProperty('--secondary-color', palette.secondary);
        root.style.setProperty('--accent-color', palette.accent);
        root.style.setProperty('--border-color', palette.border);
    } else {
        root.style.removeProperty('--primary-color');
        root.style.removeProperty('--secondary-color');
        root.style.removeProperty('--accent-color');
        root.style.removeProperty('--border-color');
    }
}

export function getCustomColorsFromInputs() {
    return getSafeColorPalette({
        primary: document.getElementById('custom-color-primary')?.value,
        secondary: document.getElementById('custom-color-secondary')?.value,
        accent: document.getElementById('custom-color-accent')?.value,
        border: document.getElementById('custom-color-border')?.value,
    });
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
    applyColorTheme(
        getCurrentUser()?.settings?.color_theme,
        getCurrentUser()?.settings?.custom_colors,
    );
}

// Pull to refresh support
export function isPullToRefreshMobileViewport() {
    return matchesMedia('(max-width: 680px)');
}

export function getActivePullToRefreshContext() {
    const currentHash = window.location.hash || '#';
    if (currentHash === '#') {
        const mainScreen = document.getElementById('main-screen');
        if (mainScreen && !mainScreen.classList.contains('hidden')) {
            return { type: 'timeline', key: 'main' };
        }
    }
    const profileMatch = currentHash.match(/^#profile\/(\d+)(?:\/([a-z]+))?$/);
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
        isPullToRefreshMobileViewport() && getActivePullToRefreshContext(),
    );
    indicator.classList.toggle('ptr-available', available);
    if (!available) {
        indicator.classList.remove('ptr-visible', 'ptr-refreshing');
        indicator.style.removeProperty('--pull-distance');
        indicator.setAttribute('aria-hidden', 'true');
    }
}

let ptrInitialized = false;
export function setupTimelinePullToRefresh(onRefresh) {
    if (ptrInitialized) return;
    ptrInitialized = true;

    const indicator = document.getElementById('pull-to-refresh-indicator');
    if (!indicator) return;

    let startX = 0;
    let startY = 0;
    let startScrollY = 0;
    let trackingPull = false;
    let pullActive = false;
    let refreshInProgress = false;

    const MAX_PULL_DISTANCE = 88;
    const PULL_THRESHOLD = 52;

    const canStartPull = (target) => {
        if (window.scrollY > 0) return false;
        if (!getActivePullToRefreshContext()) return false;
        if (target.closest('button, a, input, textarea, select, .modal-overlay')) {
            return false;
        }
        return true;
    };

    const resetIndicator = () => {
        pullActive = false;
        indicator.classList.remove('ptr-visible', 'ptr-refreshing');
        indicator.style.removeProperty('--pull-distance');
        indicator.setAttribute('aria-hidden', 'true');
        const label = indicator.querySelector('.pull-to-refresh-label');
        if (label) label.textContent = '引いて更新';
    };

    const showPullProgress = (distance) => {
        indicator.classList.add('ptr-visible');
        indicator.classList.remove('ptr-refreshing');
        indicator.style.setProperty('--pull-distance', `${Math.min(distance, MAX_PULL_DISTANCE)}px`);
        indicator.setAttribute('aria-hidden', 'false');
        const label = indicator.querySelector('.pull-to-refresh-label');
        if (label) {
            label.textContent = distance >= PULL_THRESHOLD ? '離して更新' : '引いて更新';
        }
    };

    const runRefresh = async () => {
        if (refreshInProgress) return;
        refreshInProgress = true;
        indicator.classList.add('ptr-visible', 'ptr-refreshing');
        indicator.style.setProperty('--pull-distance', `${PULL_THRESHOLD}px`);
        const label = indicator.querySelector('.pull-to-refresh-label');
        if (label) label.textContent = '更新中…';

        try {
            if (typeof onRefresh === 'function') {
                await onRefresh(getActivePullToRefreshContext());
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
        if (refreshInProgress || !isPullToRefreshMobileViewport()) return;
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

    window.addEventListener('resize', updatePullToRefreshAvailability, { passive: true });
}
