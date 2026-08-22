/**
 * tabSwipe.js
 * Comprehensive tab management and touch gesture module:
 * - Common initTabGroup() function for any screen with tabbed navigation
 * - Touch swipe left/right transitions between tabs with smooth animation
 * - Swiping right at the leftmost tab or on tabless screens opens the mobile sidebar
 * - Keyboard navigation (ArrowLeft / ArrowRight) for tabs
 * - Seamless integration with Pull-To-Refresh (PTR)
 */

import { clearRealtimeTimelineUpdate } from './cache.js';
import { switchTimelineTab } from '../screens/timelineScreen.js';
import { openMobileSidebar } from './sidebar.js';
import { registerDynamicPtrHandler, unregisterDynamicPtrHandler } from './theme.js';

// Registry of active tab group controllers
const activeTabGroups = new Map();

/**
 * Trigger animated swipe visual feedback on a content container
 * @param {Element|string} container
 * @param {number} direction 1 for left swipe (moving to next), -1 for right swipe (moving to prev)
 */
export function triggerTabSwipeAnimation(container, direction) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.classList.remove('tab-swipe-left', 'tab-swipe-right');
    void el.offsetWidth; // Force DOM reflow
    el.classList.add(direction > 0 ? 'tab-swipe-left' : 'tab-swipe-right');
    setTimeout(() => {
        el.classList.remove('tab-swipe-left', 'tab-swipe-right');
    }, 250);
}

/**
 * Helper to get the tab identifier from a button element
 * @param {Element} button
 * @returns {string}
 */
export function getTabKeyFromButton(button) {
    if (!button || !(button instanceof Element)) return '';
    return button.dataset.tab
        || button.dataset.subTab
        || button.dataset.dmTab
        || button.dataset.groupTab
        || button.dataset.roleTab
        || button.dataset.manageTab
        || button.getAttribute('data-tab-key')
        || '';
}

/**
 * Safely scrolls a tab button to center inside its own scrollable tab bar container
 * WITHOUT triggering parent/window scroll shifts or moving fixed mobile headers/navs.
 * @param {Element} tabButton
 */
export function scrollTabIntoCenter(tabButton) {
    if (!tabButton || !(tabButton instanceof Element)) return;

    // Traverse up to find the actual horizontally scrollable container
    let container = tabButton.parentElement;
    while (container && container !== document.body && container !== document.documentElement) {
        const style = window.getComputedStyle(container);
        const overflowX = style.overflowX;
        const hasScrollableOverflow = overflowX === 'auto' || overflowX === 'scroll';
        if (hasScrollableOverflow || container.scrollWidth > container.clientWidth + 2) {
            if (container.clientWidth > 0) break;
        }
        container = container.parentElement;
    }

    if (!container || container === document.body || container === document.documentElement) {
        container = tabButton.closest(
            '.timeline-tabs-sticky-container, .timeline-tabs, #profile-tabs, #profile-sub-tabs-container, .profile-sub-tabs, .dm-tabs-container, .group-ui-post-tabs, .group-ui-manage-tabs, .settings-group-list'
        ) || tabButton.parentElement;
    }

    if (!container) return;

    // Calculate accurate position of button relative to scroll container
    const buttonRect = tabButton.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const relativeLeft = buttonRect.left - containerRect.left + container.scrollLeft;

    const containerWidth = container.clientWidth;
    const buttonWidth = tabButton.offsetWidth || buttonRect.width;
    const targetScrollLeft = relativeLeft - (containerWidth / 2) + (buttonWidth / 2);

    try {
        container.scrollTo({
            left: Math.max(0, targetScrollLeft),
            behavior: 'smooth',
        });
    } catch (_) {
        container.scrollLeft = Math.max(0, targetScrollLeft);
    }
}

/**
 * Initialize a Tab Group with full swipe, keyboard, and PTR support.
 * @param {Object} options
 * @param {Element|string} options.container - Tab buttons container (e.g. '.timeline-tabs', '#profile-tabs')
 * @param {string} [options.tabSelector] - Selector for tab buttons
 * @param {Element|string} [options.contentContainer] - Content element to animate on swipe
 * @param {string} [options.activeClass='active'] - Active class name
 * @param {Function} [options.getTabKey] - Custom extractor for tab key
 * @param {Function} [options.onTabChange] - Callback when a tab is selected (key, button, prevKey)
 * @param {Function} [options.onRefresh] - Pull-to-refresh callback for this tab group
 * @param {boolean} [options.enableSwipe=true] - Enable swipe gesture navigation
 * @param {boolean} [options.enableKeyboard=true] - Enable arrow key navigation
 * @param {string} [options.groupId] - Unique ID for registering this group
 * @returns {Object} Tab group controller
 */
export function initTabGroup(options = {}) {
    const {
        container,
        tabSelector = '.tab-button, .timeline-tab-button, .dm-tab-button, .settings-group-button, [data-tab], [data-sub-tab], [data-dm-tab]',
        contentContainer = null,
        activeClass = 'active',
        getTabKey = getTabKeyFromButton,
        onTabChange = null,
        onRefresh = null,
        enableSwipe = true,
        enableKeyboard = true,
        groupId = null,
    } = options;

    const containerEl = typeof container === 'string' ? document.querySelector(container) : container;
    if (!containerEl) {
        return {
            switchTab: () => {},
            nextTab: () => {},
            prevTab: () => {},
            getActiveTab: () => null,
            getTabs: () => [],
            destroy: () => {},
        };
    }

    const resolvedGroupId = groupId || `tab-group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    function getTabButtons() {
        return Array.from(containerEl.querySelectorAll(tabSelector))
            .filter((btn) => !btn.classList.contains('hidden') && btn.offsetParent !== null);
    }

    function getActiveButton() {
        const tabs = getTabButtons();
        return tabs.find((btn) => btn.classList.contains(activeClass)) || tabs[0] || null;
    }

    function getActiveKey() {
        const activeBtn = getActiveButton();
        return activeBtn ? getTabKey(activeBtn) : null;
    }

    function switchTab(targetKeyOrIndex, triggerCallback = true, direction = 0) {
        const tabs = getTabButtons();
        if (tabs.length === 0) return null;

        let targetBtn = null;
        if (typeof targetKeyOrIndex === 'number') {
            targetBtn = tabs[targetKeyOrIndex];
        } else {
            targetBtn = tabs.find((btn) => getTabKey(btn) === String(targetKeyOrIndex));
        }

        if (!targetBtn) return null;

        const prevBtn = getActiveButton();
        const prevKey = prevBtn ? getTabKey(prevBtn) : null;
        const newKey = getTabKey(targetBtn);

        // Update active class on all tabs
        tabs.forEach((btn) => {
            btn.classList.toggle(activeClass, btn === targetBtn);
            if (btn.hasAttribute('aria-selected')) {
                btn.setAttribute('aria-selected', btn === targetBtn ? 'true' : 'false');
            }
        });

        // Smooth scroll tab into view horizontally inside its own tab bar
        scrollTabIntoCenter(targetBtn);

        // Trigger swipe visual feedback on content container if supplied
        if (direction !== 0 && contentContainer) {
            triggerTabSwipeAnimation(contentContainer, direction);
        }

        if (triggerCallback && typeof onTabChange === 'function') {
            onTabChange(newKey, targetBtn, prevKey);
        }

        return targetBtn;
    }

    function nextTab(triggerCallback = true) {
        const tabs = getTabButtons();
        const activeIndex = tabs.findIndex((btn) => btn.classList.contains(activeClass));
        if (activeIndex === -1 || activeIndex >= tabs.length - 1) return null;
        return switchTab(activeIndex + 1, triggerCallback, 1);
    }

    function prevTab(triggerCallback = true) {
        const tabs = getTabButtons();
        const activeIndex = tabs.findIndex((btn) => btn.classList.contains(activeClass));
        if (activeIndex <= 0) return null;
        return switchTab(activeIndex - 1, triggerCallback, -1);
    }

    // Bind tab clicks
    const handleClick = (e) => {
        const btn = e.target.closest(tabSelector);
        if (!btn || !containerEl.contains(btn)) return;
        const key = getTabKey(btn);
        switchTab(key, true);
    };
    containerEl.addEventListener('click', handleClick);

    // Bind keyboard navigation (ArrowLeft / ArrowRight)
    const handleKeyDown = (e) => {
        if (!enableKeyboard) return;
        if (e.key === 'ArrowRight') {
            const next = nextTab(true);
            if (next) {
                e.preventDefault();
                next.focus();
            }
        } else if (e.key === 'ArrowLeft') {
            const prev = prevTab(true);
            if (prev) {
                e.preventDefault();
                prev.focus();
            }
        }
    };
    containerEl.addEventListener('keydown', handleKeyDown);

    // Register PTR handler if provided
    if (typeof onRefresh === 'function') {
        registerDynamicPtrHandler(resolvedGroupId, onRefresh);
    }

    const controller = {
        id: resolvedGroupId,
        container: containerEl,
        contentContainer,
        enableSwipe,
        switchTab,
        nextTab,
        prevTab,
        getActiveTab: getActiveKey,
        getActiveButton,
        getTabs: getTabButtons,
        destroy: () => {
            containerEl.removeEventListener('click', handleClick);
            containerEl.removeEventListener('keydown', handleKeyDown);
            if (typeof onRefresh === 'function') {
                unregisterDynamicPtrHandler(resolvedGroupId);
            }
            activeTabGroups.delete(resolvedGroupId);
        },
    };

    activeTabGroups.set(resolvedGroupId, controller);
    return controller;
}

let isListening = false;

/**
 * Setup global swipe gestures for tabs and mobile sidebar
 */
export function setupTabSwipeNavigation() {
    if (isListening) return;
    isListening = true;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;
    let isHorizontalGesture = false;

    const MIN_DISTANCE = 45; // Minimum horizontal distance in px
    const MAX_TIME = 550; // Max duration in ms for a swipe gesture
    const RATIO = 1.35; // Must be at least 1.35x more horizontal than vertical

    function isInteractiveOrScrollable(target) {
        if (!target || !(target instanceof Element)) return false;
        // Ignore text inputs/areas while typing and active modal dialogs
        if (target.closest('textarea, input[type="text"], input[type="search"], input[type="password"], [contenteditable="true"], .modal-overlay:not(.hidden), #image-preview-modal:not(.hidden)')) {
            return true;
        }
        // Ignore tap/swipe starting on tab buttons or tab bar containers
        if (target.closest('.tab-button, .timeline-tab-button, .dm-tab-button, .settings-group-button, [data-tab], [data-sub-tab], [data-dm-tab], [data-group-tab], [data-role-tab], [data-manage-tab], [data-tab-key], [role="tab"], .timeline-tabs, .timeline-tabs-sticky-container, #profile-tabs, #profile-sub-tabs-container, .profile-sub-tabs, .dm-tabs-container, .group-ui-post-tabs, .group-ui-manage-tabs, .settings-group-list, .tabs-container, [role="tablist"]')) {
            return true;
        }
        // Check active dynamic tab group containers
        for (const controller of activeTabGroups.values()) {
            if (controller.container && controller.container.contains(target)) {
                return true;
            }
        }
        // Ignore horizontally scrollable code blocks or tables with active overflow
        const codeOrPre = target.closest('pre, code, .code-block, .table-container');
        if (codeOrPre && codeOrPre.scrollWidth > codeOrPre.clientWidth + 8) {
            return true;
        }
        return false;
    }

    function getActiveScreenContext() {
        // If a modal or sidebar is open, ignore
        if (document.body.classList.contains('mobile-sidebar-open')) return null;
        if (document.querySelector('.modal-overlay:not(.hidden)')) return null;

        const hash = window.location.hash || '#';
        if (hash === '' || hash === '#') {
            const mainScreen = document.getElementById('main-screen');
            if (mainScreen && !mainScreen.classList.contains('hidden')) {
                return 'home';
            }
        }
        if (hash.startsWith('#profile')) {
            const profileScreen = document.getElementById('profile-screen');
            if (profileScreen && !profileScreen.classList.contains('hidden')) {
                return 'profile';
            }
        }
        if (hash === '#dm' || hash.startsWith('#dm/')) {
            const dmScreen = document.getElementById('dm-screen');
            if (dmScreen && !dmScreen.classList.contains('hidden')) {
                return 'dm';
            }
        }
        if (hash === '#notifications') {
            const notificationsScreen = document.getElementById('notifications-screen');
            if (notificationsScreen && !notificationsScreen.classList.contains('hidden')) {
                return 'notifications';
            }
        }
        if (hash === '#groups' || hash.startsWith('#group/')) {
            const groupScreen = document.getElementById('group-screen') || document.getElementById('groups-screen');
            if (groupScreen && !groupScreen.classList.contains('hidden')) {
                return 'group';
            }
        }
        return 'other';
    }

    function handleDynamicTabGroupSwipe(direction) {
        // Check dynamically registered active tab groups first
        for (const controller of activeTabGroups.values()) {
            if (!controller.enableSwipe) continue;
            if (controller.container && document.body.contains(controller.container) && controller.container.offsetParent !== null) {
                const tabs = controller.getTabs();
                if (tabs.length === 0) continue;
                const activeIndex = tabs.findIndex((btn) => btn.classList.contains('active'));
                if (activeIndex === -1) continue;

                // Swiping right on the leftmost tab opens mobile sidebar
                if (direction === -1 && activeIndex === 0) {
                    openMobileSidebar();
                    return true;
                }

                if (direction === 1 && activeIndex < tabs.length - 1) {
                    controller.nextTab(true);
                    return true;
                } else if (direction === -1 && activeIndex > 0) {
                    controller.prevTab(true);
                    return true;
                }
            }
        }
        return false;
    }

    function handleHomeSwipe(direction) {
        // direction: 1 for swipe left (next tab), -1 for swipe right (prev tab / sidebar)
        const tabs = Array.from(document.querySelectorAll('.timeline-tabs .timeline-tab-button'))
            .filter((btn) => !btn.classList.contains('hidden') && btn.offsetParent !== null);

        if (tabs.length === 0) {
            if (direction === -1) openMobileSidebar();
            return;
        }

        const activeIndex = tabs.findIndex((btn) => btn.classList.contains('active'));
        if (activeIndex === -1) return;

        // If swiping right on the leftmost tab (index 0), open the mobile sidebar
        if (direction === -1 && activeIndex === 0) {
            openMobileSidebar();
            return;
        }

        const targetIndex = activeIndex + direction;
        if (targetIndex >= 0 && targetIndex < tabs.length) {
            const targetBtn = tabs[targetIndex];
            clearRealtimeTimelineUpdate();
            void switchTimelineTab(targetBtn.dataset.tab, {
                forceRefresh: false,
                resetScroll: false,
            });
            scrollTabIntoCenter(targetBtn);
            triggerTabSwipeAnimation(document.getElementById('timeline'), direction);
        }
    }

    function handleProfileSwipe(direction) {
        // Check sub-tabs first (following/followers list)
        const subTabs = Array.from(document.querySelectorAll('#profile-sub-tabs-container .tab-button'))
            .filter((btn) => !btn.classList.contains('hidden') && btn.offsetParent !== null);
        if (subTabs.length > 0) {
            const activeIndex = subTabs.findIndex((btn) => btn.classList.contains('active'));
            if (activeIndex !== -1) {
                if (direction === -1 && activeIndex === 0) {
                    openMobileSidebar();
                    return;
                }
                const targetIndex = activeIndex + direction;
                if (targetIndex >= 0 && targetIndex < subTabs.length) {
                    subTabs[targetIndex].click();
                    triggerTabSwipeAnimation(document.getElementById('profile-content'), direction);
                    return;
                }
            }
        }

        // Main profile tabs
        const mainTabs = Array.from(document.querySelectorAll('#profile-tabs .tab-button'))
            .filter((btn) => !btn.classList.contains('hidden') && btn.offsetParent !== null);
        if (mainTabs.length === 0) {
            if (direction === -1) openMobileSidebar();
            return;
        }

        const activeIndex = mainTabs.findIndex((btn) => btn.classList.contains('active'));
        if (activeIndex === -1) return;

        // If swiping right on the leftmost tab (index 0), open the mobile sidebar
        if (direction === -1 && activeIndex === 0) {
            openMobileSidebar();
            return;
        }

        const targetIndex = activeIndex + direction;
        if (targetIndex >= 0 && targetIndex < mainTabs.length) {
            const targetBtn = mainTabs[targetIndex];
            targetBtn.click();
            scrollTabIntoCenter(targetBtn);
            triggerTabSwipeAnimation(document.getElementById('profile-content'), direction);
        }
    }

    function handleDmSwipe(direction) {
        const dmTabs = Array.from(document.querySelectorAll('.dm-tabs-container .dm-tab-button'))
            .filter((btn) => !btn.classList.contains('hidden') && btn.offsetParent !== null);
        if (dmTabs.length > 0) {
            const activeIndex = dmTabs.findIndex((btn) => btn.classList.contains('active'));
            if (activeIndex !== -1) {
                if (direction === -1 && activeIndex === 0) {
                    openMobileSidebar();
                    return;
                }
                const targetIndex = activeIndex + direction;
                if (targetIndex >= 0 && targetIndex < dmTabs.length) {
                    dmTabs[targetIndex].click();
                    triggerTabSwipeAnimation(document.getElementById('dm-list-container'), direction);
                    return;
                }
            }
        }
        if (direction === -1) openMobileSidebar();
    }

    function handleGroupSwipe(direction) {
        const groupTabs = Array.from(document.querySelectorAll('.group-ui-post-tabs .tab-button, .group-ui-manage-tabs .settings-group-button'))
            .filter((btn) => !btn.classList.contains('hidden') && btn.offsetParent !== null);
        if (groupTabs.length > 0) {
            const activeIndex = groupTabs.findIndex((btn) => btn.classList.contains('active'));
            if (activeIndex !== -1) {
                if (direction === -1 && activeIndex === 0) {
                    openMobileSidebar();
                    return;
                }
                const targetIndex = activeIndex + direction;
                if (targetIndex >= 0 && targetIndex < groupTabs.length) {
                    groupTabs[targetIndex].click();
                    triggerTabSwipeAnimation(document.getElementById('group-content') || document.getElementById('groups-container'), direction);
                    return;
                }
            }
        }
        if (direction === -1) openMobileSidebar();
    }

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) {
            tracking = false;
            return;
        }
        const screen = getActiveScreenContext();
        if (!screen) {
            tracking = false;
            return;
        }
        const target = e.target;
        if (isInteractiveOrScrollable(target)) {
            tracking = false;
            return;
        }

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        startTime = Date.now();
        tracking = true;
        isHorizontalGesture = false;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        const touch = e.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;

        if (!isHorizontalGesture) {
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                if (Math.abs(dx) > Math.abs(dy) * 1.15) {
                    isHorizontalGesture = true;
                } else {
                    tracking = false;
                }
            }
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;

        const touch = e.changedTouches[0];
        if (!touch) return;

        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        const elapsed = Date.now() - startTime;

        if (elapsed > MAX_TIME) return;
        if (Math.abs(dx) < MIN_DISTANCE) return;
        if (Math.abs(dx) < Math.abs(dy) * RATIO) return;

        const screen = getActiveScreenContext();
        if (!screen) return;

        // dx < 0: finger swiped left -> next tab (direction = +1)
        // dx > 0: finger swiped right -> prev tab / open sidebar (direction = -1)
        const direction = dx < 0 ? 1 : -1;

        // First attempt dynamically registered tab controller swipe
        if (handleDynamicTabGroupSwipe(direction)) {
            return;
        }

        if (screen === 'home') {
            handleHomeSwipe(direction);
        } else if (screen === 'profile') {
            handleProfileSwipe(direction);
        } else if (screen === 'dm') {
            handleDmSwipe(direction);
        } else if (screen === 'group') {
            handleGroupSwipe(direction);
        } else if (screen === 'other') {
            if (direction === -1) {
                openMobileSidebar();
            }
        }
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
        tracking = false;
    }, { passive: true });
}
