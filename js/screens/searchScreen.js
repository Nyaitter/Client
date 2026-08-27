import { apiRequest } from '../api.js';
import { DOM } from '../dom.js';
import {
    getCurrentUser,
    getCurrentSearchTab,
    setCurrentSearchTab,
    setIsLoadingMore,
    getPostLoadObserver,
} from '../state.js';
import {
    getUserPageCache,
    getAuxiliaryPostPageCache,
} from '../modules/cache.js';
import {
    createPostFormHTML,
    attachPostFormListeners,
    closePostModal,
} from '../modules/posts.js';
import { goToLoginPage } from '../modules/auth.js';
import {
    loadPostsWithPagination,
    loadUsersWithPagination,
} from '../modules/pagination.js';
import { getEmoji } from '../modules/format.js';
import { escapeHTML, showLoading } from '../utils/helpers.js';
import { getActiveScreenContext, showScreenCompat } from '../screenManager.js';
import {
    renderGroupResults,
    renderSearchError,
    renderSearchHeader,
} from './search/view.js';

let activeSearchRequestVersion = 0;

export async function showSearchResults(query, tab = 'posts', showScreenFn = null) {
    renderSearchHeader(query, tab, getEmoji(escapeHTML(query)));

    const searchInput = document.getElementById('search-input');
    let searchDebounceTimer;
    const performSearch = () => {
        const newQuery = searchInput?.value.trim();
        if (newQuery) {
            window.location.hash = `#search/${encodeURIComponent(newQuery)}`;
        }
    };
    if (searchInput) {
        searchInput.value = query;
        searchInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                clearTimeout(searchDebounceTimer);
                performSearch();
            }
        };
        searchInput.oninput = () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(performSearch, 400);
        };
    }

    document
        .getElementById('search-tabs-container')
        ?.querySelectorAll('.tab-button')
        .forEach((button) => {
            button.onclick = (e) => {
                e.stopPropagation();
                void loadSearchTabContent(query, button.dataset.searchTab);
            };
        });

    showScreenCompat('search-results-screen', showScreenFn);

    await loadSearchTabContent(query, tab);
}

export async function loadSearchTabContent(query, tab) {
    const searchRequestVersion = ++activeSearchRequestVersion;
    const signal = getActiveScreenContext()?.signal;
    setCurrentSearchTab(tab);
    document
        .querySelectorAll('#search-tabs-container .tab-button')
        .forEach((btn) => btn.classList.toggle('active', btn.dataset.searchTab === tab));

    setIsLoadingMore(false);
    if (getPostLoadObserver()) getPostLoadObserver().disconnect();

    const contentDiv = DOM.searchResultsContent;
    contentDiv.innerHTML = '';

    if (tab === 'groups') {
        const { data, error } = await apiRequest(
            `/server/api/groups?q=${encodeURIComponent(String(query || ''))}&limit=100`,
            { signal },
        );
        if (searchRequestVersion !== activeSearchRequestVersion || getCurrentSearchTab() !== 'groups') return;
        if (signal?.aborted) return;
        if (error) {
            renderSearchError(contentDiv, error.message || '');
        } else {
            const groups = Array.isArray(data?.groups) ? data.groups : [];
            renderGroupResults(contentDiv, groups);
        }
        showLoading(false);
    } else if (tab === 'users') {
        const normalizedQuery = String(query || '')
            .normalize('NFKC')
            .trim()
            .replace(/\s+/g, ' ');
        const filterQuery = normalizedQuery.replace(/[%,()]/g, ' ');
        const filters = [
            `name.ilike.%${filterQuery}%`,
            `nyaitter_id.ilike.%${filterQuery}%`,
            `scid.ilike.%${filterQuery}%`,
            `me.ilike.%${filterQuery}%`,
        ];
        const normalizedIdQuery = normalizedQuery.replace(/^#/, '');
        if (/^\d+$/.test(normalizedIdQuery)) {
            filters.unshift(`id.eq.${Number(normalizedIdQuery)}`);
        }

        const userScope = getCurrentUser()?.id ?? 'guest';
        const searchUsersCacheKey = `${userScope}:search:users:${normalizedQuery.toLocaleLowerCase('ja-JP')}`;
        const needle = normalizedQuery.toLocaleLowerCase('ja-JP');
        const scoreUser = (user) => {
            const id = String(user.id || '');
            const values = [user.name, user.scid, user.me]
                .filter((value) => typeof value === 'string')
                .map((value) => value.normalize('NFKC').toLocaleLowerCase('ja-JP'));
            if (id === normalizedIdQuery) return 0;
            if (values.some((value) => value === needle)) return 1;
            if (values.some((value) => value.startsWith(needle))) return 2;
            return 3;
        };

        await loadUsersWithPagination(contentDiv, 'search', {
            filters: filters.join(','),
            pageSize: 15,
            pageCache: getUserPageCache(searchUsersCacheKey),
            signal,
            sortResults: (left, right) =>
                scoreUser(left) - scoreUser(right) ||
                Number(left.id) - Number(right.id),
            isCurrent: () =>
                searchRequestVersion === activeSearchRequestVersion &&
                getCurrentSearchTab() === 'users',
        });
        if (
            searchRequestVersion === activeSearchRequestVersion &&
            getCurrentSearchTab() === 'users'
        ) {
            showLoading(false);
        }
    } else {
        if (getCurrentUser()) {
            const tagPostButton = document.createElement('button');
            tagPostButton.className = 'tag-post-button';
            tagPostButton.innerHTML = 'このタグでポストする';
            tagPostButton.addEventListener('click', async () => {
                if (!getCurrentUser()) return goToLoginPage();
                DOM.postModal.classList.remove('hidden');
                const modalContainer = DOM.postModal.querySelector('.post-form-container-modal');
                if (!modalContainer) return;
                modalContainer.innerHTML =
                    createPostFormHTML(true) + `<div id="quoting-preview-container"></div>`;
                attachPostFormListeners(modalContainer);
                const textarea = modalContainer.querySelector('textarea');
                if (textarea) textarea.value = '#' + query;

                DOM.postModal.querySelector('.modal-close-btn').onclick = closePostModal;
                textarea?.focus();
            });
            contentDiv.appendChild(tagPostButton);
        }

        const postResultsContainer = document.createElement('div');
        contentDiv.appendChild(postResultsContainer);
        const userScope = getCurrentUser()?.id ?? 'guest';
        await loadPostsWithPagination(postResultsContainer, 'search', {
            query,
            pageCache: getAuxiliaryPostPageCache(
                `${userScope}:search:posts:${query}`,
            ),
            signal: getActiveScreenContext()?.signal,
        });
        showLoading(false);
    }
}
