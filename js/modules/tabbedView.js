/**
 * tabbedView.js
 * High-level reusable unified API for tabbed views, post/user lists, touch swipe,
 * pull-to-refresh (PTR), scroll position management, and caching in Nyaitter.
 */

import { renderPost } from './posts.js';
import { renderUserCard } from './pagination.js';
import { initTabGroup } from './tabSwipe.js';
import { registerDynamicPtrHandler, unregisterDynamicPtrHandler } from './theme.js';
import {
    getScreenDataCache,
    setScreenDataCache,
    deleteScreenDataCache,
} from './cache.js';
import {
    getScrollRouteKey,
    saveScrollPosition,
    restoreScrollPosition,
    clearSavedScrollPosition,
} from './scroll.js';
import { escapeHTML } from '../utils/helpers.js';

/**
 * Render a list of posts into a target container
 * @param {HTMLElement} container
 * @param {Array<Object>} posts
 * @param {Object} [options]
 * @param {string} [options.emptyText='ポストはありません']
 * @param {string} [options.listClassName='tab-posts-list']
 * @returns {Promise<HTMLElement>}
 */
export async function renderPostList(container, posts = [], options = {}) {
    if (!container) return null;
    container.innerHTML = '';

    const {
        emptyText = 'ポストはありません',
        listClassName = 'tab-posts-list',
    } = options;

    const list = Array.isArray(posts) ? posts : [];
    if (list.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'tab-empty-state';
        emptyDiv.style.cssText = 'padding: 3rem 1rem; text-align: center; color: var(--secondary-text-color); font-size: 0.95rem;';
        emptyDiv.innerHTML = `<p>${escapeHTML(emptyText)}</p>`;
        container.appendChild(emptyDiv);
        return emptyDiv;
    }

    const listWrapper = document.createElement('div');
    listWrapper.className = listClassName;

    const postElements = await Promise.all(list.map((post) => (
        renderPost(post, post.author || post.user)
    )));
    for (const postElement of postElements) {
        if (postElement) listWrapper.appendChild(postElement);
    }

    container.appendChild(listWrapper);
    return listWrapper;
}

/**
 * Render a list of users into a target container using Nyaitter standard user card component
 * @param {HTMLElement} container
 * @param {Array<Object>} users
 * @param {Object} [options]
 * @param {string} [options.emptyText='ユーザーはいません']
 * @param {string} [options.listClassName='tab-users-list']
 * @returns {HTMLElement}
 */
export function renderUserList(container, users = [], options = {}) {
    if (!container) return null;
    container.innerHTML = '';

    const {
        emptyText = 'ユーザーはいません',
        listClassName = 'tab-users-list',
    } = options;

    const list = Array.isArray(users) ? users : [];
    if (list.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'tab-empty-state';
        emptyDiv.style.cssText = 'padding: 3rem 1rem; text-align: center; color: var(--secondary-text-color); font-size: 0.95rem;';
        emptyDiv.innerHTML = `<p>${escapeHTML(emptyText)}</p>`;
        container.appendChild(emptyDiv);
        return emptyDiv;
    }

    const listWrapper = document.createElement('div');
    listWrapper.className = listClassName;

    for (const user of list) {
        const card = renderUserCard(user);
        if (card) {
            listWrapper.appendChild(card);
        }
    }

    container.appendChild(listWrapper);
    return listWrapper;
}

/**
 * Setup a complete standard Nyaitter tabbed list view with swipe, PTR, cache, and scroll persistence
 * @param {HTMLElement} container - Root container element
 * @param {Object} options
 * @param {string} [options.routeHash] - Base URL hash for scroll route key (e.g. `#post/123/activity`)
 * @param {string} [options.cacheKey] - Key for caching data in screenDataCaches
 * @param {string} [options.initialTab] - Initial active tab key
 * @param {boolean} [options.forceRefresh=false] - Force bypass cache and reload from server
 * @param {boolean} [options.resetScroll=false] - Reset scroll to top
 * @param {Array<Object>} options.tabs - Array of tab definitions
 * @param {Function} [options.onTabChange] - Callback when active tab changes
 * @param {Function} [options.onRefresh] - Custom refresh handler
 * @returns {Promise<Object>} Controller
 */
export async function setupTabbedListView(container, options = {}) {
    if (!container) return null;

    const {
        routeHash = window.location.hash || '#',
        cacheKey = null,
        initialTab = null,
        forceRefresh = false,
        resetScroll = false,
        tabs = [],
        onTabChange = null,
        onRefresh = null,
    } = options;

    if (!Array.isArray(tabs) || tabs.length === 0) return null;

    // Look for existing container for fast list-only refresh without recreating headers/tabs
    const existingContainer = container.querySelector('.tabbed-view-container');
    let currentActiveTab = initialTab || tabs[0]?.key;

    // Validate that currentActiveTab exists
    if (!tabs.some((t) => t.key === currentActiveTab)) {
        currentActiveTab = tabs[0]?.key;
    }

    let tabsContainer = existingContainer?.querySelector('.tabbed-view-tabs');
    let bodyContainer = existingContainer?.querySelector('.tabbed-view-body');

    const renderTabContent = async (tabKey, shouldRestoreScroll = true) => {
        currentActiveTab = tabKey;
        const tabDef = tabs.find((t) => t.key === tabKey) || tabs[0];
        if (!tabDef || !bodyContainer) return;

        bodyContainer.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';

        try {
            let items = [];
            if (typeof tabDef.fetch === 'function') {
                items = await tabDef.fetch(forceRefresh);
            } else if (Array.isArray(tabDef.items)) {
                items = tabDef.items;
            }

            // Update tab button count if available
            if (tabsContainer) {
                const tabBtn = tabsContainer.querySelector(`[data-tab="${tabDef.key}"]`);
                if (tabBtn) {
                    const count = Array.isArray(items) ? items.length : tabDef.count;
                    if (count !== undefined && count !== null) {
                        tabBtn.textContent = `${tabDef.label} (${count})`;
                    }
                }
            }

            if (tabDef.type === 'posts') {
                await renderPostList(bodyContainer, items, {
                    emptyText: tabDef.emptyText || 'ポストはありません',
                });
            } else if (tabDef.type === 'users') {
                renderUserList(bodyContainer, items, {
                    emptyText: tabDef.emptyText || 'ユーザーはいません',
                });
            } else if (typeof tabDef.render === 'function') {
                await tabDef.render(bodyContainer, items);
            }

            if (shouldRestoreScroll && !resetScroll) {
                const routeKey = getScrollRouteKey(routeHash, tabKey);
                restoreScrollPosition(routeKey);
            } else if (resetScroll) {
                window.scrollTo(0, 0);
            }
        } catch (err) {
            console.error('[tabbedView] error rendering tab:', tabKey, err);
            bodyContainer.innerHTML = `<div class="tab-empty-state" style="padding: 3rem 1rem; text-align: center; color: var(--secondary-text-color);"><p>${escapeHTML(err?.message || 'データの取得に失敗しました')}</p></div>`;
        }
    };

    if (existingContainer && forceRefresh) {
        // Fast in-place list update
        await renderTabContent(currentActiveTab, !resetScroll);
        return {
            getActiveTab: () => currentActiveTab,
            switchTab: (tabKey) => renderTabContent(tabKey),
        };
    }

    // Full UI initialization
    container.innerHTML = `
        <div class="tabbed-view-container post-activity-screen-container">
            <div class="timeline-tabs-sticky-container">
                <div class="timeline-tabs tabbed-view-tabs" id="tabbed-view-tabs-${Date.now()}">
                    ${tabs.map((tab) => `
                        <button type="button" class="tab-button ${tab.key === currentActiveTab ? 'active' : ''}" data-tab="${escapeHTML(tab.key)}">
                            ${escapeHTML(tab.label)}${tab.count !== undefined && tab.count !== null ? ` (${tab.count})` : ''}
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="tabbed-view-body post-activity-screen-body"></div>
        </div>
    `;

    tabsContainer = container.querySelector('.tabbed-view-tabs');
    bodyContainer = container.querySelector('.tabbed-view-body');

    // Register Dynamic Pull-To-Refresh handler
    const dynamicPtrKey = `tabbed-view-${routeHash.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    registerDynamicPtrHandler(dynamicPtrKey, async () => {
        if (cacheKey) {
            deleteScreenDataCache(cacheKey);
        }
        if (typeof onRefresh === 'function') {
            await onRefresh(currentActiveTab);
        } else {
            await renderTabContent(currentActiveTab, false);
        }
    });

    // Initialize swipe navigation and tabs
    initTabGroup({
        container: tabsContainer,
        tabSelector: '.tab-button',
        contentContainer: bodyContainer,
        getTabKey: (btn) => btn.dataset.tab,
        onTabChange: async (newTabKey) => {
            const prevRouteKey = getScrollRouteKey(routeHash, currentActiveTab);
            saveScrollPosition(prevRouteKey);
            await renderTabContent(newTabKey, true);
            if (typeof onTabChange === 'function') {
                onTabChange(newTabKey);
            }
        },
        onRefresh: async () => {
            if (cacheKey) {
                deleteScreenDataCache(cacheKey);
            }
            if (typeof onRefresh === 'function') {
                await onRefresh(currentActiveTab);
            } else {
                await renderTabContent(currentActiveTab, false);
            }
        },
    });

    // Handle same-tab click for smooth scroll-to-top and forced refresh
    tabsContainer.querySelectorAll('.tab-button').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const tabKey = btn.dataset.tab;
            if (tabKey === currentActiveTab) {
                e.stopPropagation();
                if (cacheKey) {
                    deleteScreenDataCache(cacheKey);
                }
                clearSavedScrollPosition(getScrollRouteKey(routeHash, tabKey));
                window.scrollTo({ top: 0, behavior: 'smooth' });
                if (typeof onRefresh === 'function') {
                    await onRefresh(tabKey);
                } else {
                    await renderTabContent(tabKey, false);
                }
            }
        });
    });

    await renderTabContent(currentActiveTab, !resetScroll);

    return {
        getActiveTab: () => currentActiveTab,
        switchTab: (tabKey) => renderTabContent(tabKey),
        destroy: () => {
            unregisterDynamicPtrHandler(dynamicPtrKey);
        },
    };
}
