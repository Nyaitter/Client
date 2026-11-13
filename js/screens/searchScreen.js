import { t } from '../modules/i18n.js';
import { apiRequest } from '../api.js';
import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
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
    openPostModal,
} from '../modules/posts.js';
import { goToLoginPage } from '../modules/auth.js';
import {
    loadPostsWithPagination,
    loadUsersWithPagination,
} from '../modules/pagination.js';
import { getEmoji } from '../modules/format.js';
import { bindTabBar, setActiveTab } from '../modules/tabs.js';
import { escapeHTML, showLoading, getSafeConfiguredFileUrl } from '../utils/helpers.js';
import { getActiveScreenContext, showScreenCompat } from '../screenManager.js';
import { trackSearchComposition, guardSearchFormComposition } from '../utils/searchIme.js';

const GROUP_VISIBILITY_LABELS = {
    open: 'Open',
    open_invite: 'OpenInvite',
};

function getGroupImageUrl(value) {
    const image = typeof value === 'string' ? value.trim() : '';
    if (!image) return '';
    if (/^data:image\/(?:jpeg|png|gif|webp);base64,[a-z0-9+/]+=*$/i.test(image)) return image;
    if (/^https?:\/\/[^\s"'<>]+$/i.test(image)) return getSafeConfiguredFileUrl(image);
    const configuredUrl = globalThis.NyaitterClientConfig?.userFileUrl?.(image);
    const safeConfiguredUrl = getSafeConfiguredFileUrl(configuredUrl);
    if (safeConfiguredUrl) return safeConfiguredUrl;
    return /^attachments\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(image) && !image.includes('..') ? image : '';
}

export function renderSearchHeader(query, tab, title) {
    DOM.pageHeader.innerHTML = `
        <div class="header-search-bar">
            <input type="search" id="search-input" class="nui-input" placeholder="${t('settings.account.search_button')}" aria-label="${t('settings.account.search_button')}">
            ${renderAdvancedSearchButton()}
        </div>
        <h2 id="page-title">${t('searchview.results_title', { query: escapeHTML(title) })}</h2>
        <div class="search-tabs nui-tabs" id="search-tabs-container" data-nui="tabs">
            <button type="button" class="tab-button nui-tab ${tab === 'posts' ? 'active is-active' : ''}" data-search-tab="posts">${t('composer.submit')}</button>
            <button type="button" class="tab-button nui-tab ${tab === 'users' ? 'active is-active' : ''}" data-search-tab="users">${t('post.user_fallback')}</button>
            <button type="button" class="tab-button nui-tab ${tab === 'groups' ? 'active is-active' : ''}" data-search-tab="groups">${t('nav.groups')}</button>
        </div>
    `;
}

function renderGroupSearchResult(group) {
    const id = encodeURIComponent(String(group?.id || ''));
    const name = escapeHTML(group?.name || t('searchview.untitled_group'));
    const description = escapeHTML(group?.description || t('searchview.no_description'));
    const visibility = escapeHTML(GROUP_VISIBILITY_LABELS[group?.visibility] || group?.visibility || 'Open');
    const memberCount = Math.max(0, Number(group?.member_count || 0));
    const imageUrl = getGroupImageUrl(group?.icon_data);
    const avatar = imageUrl
        ? `<img class="group-ui-avatar nui-avatar" src="${escapeHTML(imageUrl)}" alt="">`
        : `<div class="group-ui-avatar group-ui-avatar-fallback nui-avatar" data-nui="avatar" aria-hidden="true">${ICONS.group}</div>`;
    return `<article class="settings-session-item group-ui-list-item nui-list-item" data-nui="list-item">
        <a class="group-ui-list-link nui-list-link" href="#group/${id}">
            ${avatar}
            <div class="settings-session-details nui-list-copy">
                <span class="settings-session-title nui-list-title">${name}</span>
                <p class="nui-list-meta">${visibility} ・ ${t('callview.count_people', { count: memberCount })}<br>${description}</p>
            </div>
        </a>
    </article>`;
}

export function renderGroupResults(container, groups) {
    if (!container) return;
    container.innerHTML = groups.length
        ? `<div class="settings-sessions-list nui-list" data-nui="list">${groups.map(renderGroupSearchResult).join('')}</div>`
        : `<p class="settings-help-text nui-empty-text">${t('searchview.no_groups')}</p>`;
}

export function renderSearchError(container, message = '') {
    if (container) {
        container.innerHTML = `<p class="error-message">${t('searchview.group_search_failed')}${escapeHTML(message)}</p>`;
    }
}

export function renderAdvancedSearchButton() {
    return `<button type="button" class="advanced-search-button" aria-label="${t('advsearch.title')}" title="${t('advsearch.title')}">${ICONS.explore}</button>`;
}

const quote = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function readAdvancedSearch(query = '') {
    const values = { keywords: '', phrase: '', from: '', excludeFrom: false, dateMode: 'any', at: '', since: '', until: '', media: '', links: '', kind: '' };
    const keywords = [];
    const seen = new Set();
    const tokens = String(query).match(/(?:-?\w+:)?"(?:\\.|[^"\\])*"|\S+/g) || [];
    const fallback = () => ({ ...values, keywords: String(query), phrase: '', from: '', excludeFrom: false, dateMode: 'any', at: '', since: '', until: '', media: '', links: '', kind: '' });
    for (const raw of tokens) {
        const operator = /^(-?)(from|at|since|until|has|is):(.+)$/i.exec(raw);
        if (!operator) {
            if (/^"(?:\\.|[^"\\])*"$/.test(raw)) {
                if (seen.has('phrase')) return fallback();
                seen.add('phrase'); values.phrase = raw.slice(1, -1).replace(/\\(["\\])/g, '$1');
            } else keywords.push(raw);
            continue;
        }
        const [, negative, rawType, rawValue] = operator;
        const type = rawType.toLowerCase();
        const value = /^"/.test(rawValue) ? rawValue.slice(1, -1).replace(/\\(["\\])/g, '$1') : rawValue;
        const key = type === 'has' ? (value === 'link' ? 'links' : value) : type;
        if (seen.has(key)) return fallback();
        seen.add(key);
        if (type === 'from') { values.from = value; values.excludeFrom = Boolean(negative); }
        else if (['at', 'since', 'until'].includes(type)) {
            if (negative || /^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) return fallback();
            if ((type === 'at' && (seen.has('since') || seen.has('until'))) || (type !== 'at' && seen.has('at'))) return fallback();
            values[type] = value; values.dateMode = type === 'at' ? 'day' : 'range';
        } else if (type === 'has' && ['media', 'links'].includes(key)) values[key] = negative ? 'exclude' : 'include';
        else if (type === 'is' && ['reply', 'quote', 'repost'].includes(value)) values.kind = negative ? `-${value}` : value;
        else return fallback();
    }
    values.keywords = keywords.join(' ');
    return values;
}

export function buildAdvancedSearch(values) {
    const parts = [String(values.keywords || '').trim()];
    if (values.phrase?.trim()) parts.push(quote(values.phrase.trim()));
    if (values.from?.trim()) {
        const from = values.from.trim();
        parts.push(`${values.excludeFrom ? '-' : ''}from:${/[\s"\\]/.test(from) ? quote(from) : from}`);
    }
    if (values.dateMode === 'day' && values.at) parts.push(`at:${values.at}`);
    if (values.dateMode === 'range') {
        if (values.since) parts.push(`since:${values.since}`);
        if (values.until) parts.push(`until:${values.until}`);
    }
    for (const type of ['media', 'links']) if (values[type]) parts.push(`${values[type] === 'exclude' ? '-' : ''}has:${type}`);
    if (values.kind) parts.push(values.kind.startsWith('-') ? `-is:${values.kind.slice(1)}` : `is:${values.kind}`);
    return parts.filter(Boolean).join(' ');
}

export function bindAdvancedSearch(header, context) {
    const button = header?.querySelector('.advanced-search-button');
    if (!button) return;
    let closeModal = null;
    const open = () => {
        if (closeModal) return;
        const initial = readAdvancedSearch(header.querySelector('#search-input')?.value || '');
        const modal = document.createElement('div');
        modal.className = 'modal-overlay nui-modal-backdrop advanced-search-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'advanced-search-title');
        modal.innerHTML = `<section class="modal-content nui-modal advanced-search-modal" data-nui="modal" style="width: min(620px, calc(100vw - 2rem));">
            <header class="advanced-search-heading"><h2 id="advanced-search-title" class="nui-modal-title">${t('advsearch.title')}</h2><button type="button" class="advanced-search-close" aria-label="${t('common.close')}">×</button></header>
            <form class="advanced-search-form nui-form">
                <div class="advanced-search-fields">
                    <label>${t('advsearch.keywords_label')}<input name="keywords" type="text" class="nui-input" placeholder="${t('advsearch.keywords_placeholder')}" autocomplete="off"></label>
                    <label>${t('advsearch.phrase_label')}<input name="phrase" type="text" class="nui-input" placeholder="${t('advsearch.phrase_placeholder')}" autocomplete="off"></label>
                    <fieldset><legend>${t('advsearch.author_legend')}</legend><label>${t('advsearch.author_label')}<input name="from" type="text" class="nui-input" placeholder="${t('advsearch.author_placeholder')}" autocomplete="off"></label><label class="advanced-search-checkbox"><input name="excludeFrom" type="checkbox"><span>${t('advsearch.exclude_author')}</span></label></fieldset>
                    <fieldset><legend>${t('advsearch.date_legend')} <small>UTC</small></legend><label>${t('advsearch.date_range_label')}<select name="dateMode" class="nui-input"><option value="any">${t('advsearch.date_any')}</option><option value="day">${t('advsearch.date_specific_day')}</option><option value="range">${t('advsearch.date_range_option')}</option></select></label>
                        <label data-search-date="day" hidden>${t('advsearch.date_day_label')}<input name="at" type="date" class="nui-input"></label>
                        <div class="advanced-search-date-range" data-search-date="range" hidden><label>${t('advsearch.date_since')}<input name="since" type="date" class="nui-input"></label><label>${t('advsearch.date_until')}<input name="until" type="date" class="nui-input"></label></div>
                    </fieldset>
                    <fieldset class="advanced-search-filters"><legend>${t('advsearch.content_legend')}</legend>
                        <label>${t('advsearch.media_label')}<select name="media" class="nui-input"><option value="">${t('advsearch.date_any')}</option><option value="include">${t('advsearch.media_include')}</option><option value="exclude">${t('advsearch.media_exclude')}</option></label>
                        <label>${t('advsearch.links_label')}<select name="links" class="nui-input"><option value="">${t('advsearch.date_any')}</option><option value="include">${t('advsearch.links_include')}</option><option value="exclude">${t('advsearch.links_exclude')}</option></label>
                        <label class="advanced-search-kind">${t('advsearch.kind_label')}<select name="kind" class="nui-input"><option value="">${t('timeline.tab.all')}</option><option value="reply">${t('advsearch.kind_reply')}</option><option value="quote">${t('advsearch.kind_quote')}</option><option value="repost">${t('advsearch.kind_repost')}</option><option value="-reply">${t('advsearch.kind_exclude_reply')}</option><option value="-quote">${t('advsearch.kind_exclude_quote')}</option><option value="-repost">${t('advsearch.kind_exclude_repost')}</option></select></label>
                    </fieldset>
                    <p class="advanced-search-error" role="alert" hidden></p>
                </div>
                <footer class="advanced-search-actions"><button type="button" class="nui-button-secondary" data-search-cancel>${t('common.cancel')}</button><button type="submit" class="nui-button settings-primary-button">${t('settings.account.search_button')}</button></footer>
            </form>
        </section>`;
        const previousOverflow = document.body.style.overflow;
        const form = modal.querySelector('form');
        guardSearchFormComposition(form);
        for (const [name, value] of Object.entries(initial)) {
            const input = form.elements.namedItem(name);
            if (input.type === 'checkbox') input.checked = value;
            else input.value = value;
        }
        const readValues = () => Object.fromEntries([...form.elements].filter(input => input.name).map(input => [input.name, input.type === 'checkbox' ? input.checked : input.value]));
        const updateDates = () => {
            form.elements.at.required = form.elements.dateMode.value === 'day';
            for (const row of modal.querySelectorAll('[data-search-date]')) row.hidden = row.dataset.searchDate !== form.elements.dateMode.value;
        };
        updateDates();
        form.elements.dateMode.addEventListener('change', updateDates);
        const close = () => {
            if (!closeModal) return;
            document.removeEventListener('keydown', onKeyDown, true);
            document.body.style.overflow = previousOverflow;
            modal.remove();
            closeModal = null;
            if (button.isConnected) button.focus({ preventScroll: true });
        };
        const onKeyDown = event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
            if (event.key !== 'Tab') return;
            const controls = [...modal.querySelectorAll('button,input,select')].filter(input => !input.disabled && !input.closest('[hidden]'));
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
        };
        closeModal = close;
        document.addEventListener('keydown', onKeyDown, true);
        modal.querySelector('.advanced-search-close').addEventListener('click', close);
        modal.querySelector('[data-search-cancel]').addEventListener('click', close);
        modal.addEventListener('click', event => { if (event.target === modal) close(); });
        form.addEventListener('submit', event => {
            event.preventDefault();
            const values = readValues();
            const query = buildAdvancedSearch(values);
            const error = modal.querySelector('.advanced-search-error');
            const message = !query ? t('advsearch.no_criteria') : values.dateMode === 'range' && values.since && values.until && values.since >= values.until ? t('advsearch.invalid_range') : '';
            error.hidden = !message; error.textContent = message;
            if (message) { form.elements[!query ? 'keywords' : 'until'].focus(); return; }
            close();
            const searchInput = header.querySelector('#search-input');
            if (searchInput) searchInput.value = query;
            window.location.hash = `#search/${encodeURIComponent(query)}`;
        });
        document.body.append(modal);
        document.body.style.overflow = 'hidden';
        form.elements.keywords.focus({ preventScroll: true });
    };
    button.addEventListener('click', open);
    context?.addCleanup(() => { closeModal?.(); button.removeEventListener('click', open); });
}

let activeSearchRequestVersion = 0;
let activeSearchQuery = '';

export async function showSearchResults(query, tab = 'posts', showScreenFn = null) {
    activeSearchQuery = query;
    renderSearchHeader(query, tab, getEmoji(escapeHTML(query)));

    const searchInput = document.getElementById('search-input');
    let isComposing = () => false;
    const performSearch = () => {
        if (!searchInput?.isConnected || document.activeElement !== searchInput || isComposing({})) return;
        const newQuery = searchInput?.value.trim();
        if (newQuery) {
            window.location.hash = `#search/${encodeURIComponent(newQuery)}`;
        }
    };
    if (searchInput) {
        searchInput.value = query;
        isComposing = trackSearchComposition(searchInput);
        // 入力や変換確定では検索しない。実行は Enter の明示操作のみ。
        searchInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !isComposing(e)) {
                performSearch();
            }
        };
    }

    bindTabBar(DOM.pageHeader, {
        containerSelector: '#search-tabs-container',
        getKey: (button) => button.dataset.searchTab || '',
        onChange: (tabKey) => {
            void loadSearchTabContent(activeSearchQuery, tabKey);
        },
    });

    showScreenCompat('search-results-screen', showScreenFn);


    bindAdvancedSearch(DOM.pageHeader, getActiveScreenContext());
    await loadSearchTabContent(query, tab);
}

export async function loadSearchTabContent(query, tab) {
    const searchRequestVersion = ++activeSearchRequestVersion;
    const signal = getActiveScreenContext()?.signal;
    setCurrentSearchTab(tab);
    setActiveTab(document.getElementById('search-tabs-container'), tab, {
        getKey: (button) => button.dataset.searchTab || '',
    });

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
        if (getCurrentUser() && !/(?:^|\s)-?(?:from|at|since|until|has|is):/i.test(query)) {
            const tagPostButton = document.createElement('button');
            tagPostButton.className = 'tag-post-button nui-button-secondary';
            tagPostButton.setAttribute('data-nui', 'button-secondary');
            tagPostButton.innerHTML = t('search.post_with_tag');
            tagPostButton.addEventListener('click', async () => {
                if (!getCurrentUser()) return goToLoginPage();
                openPostModal();
                const modalContainer = DOM.postModal.querySelector('.post-form-container-modal');
                if (!modalContainer) return;
                const textarea = modalContainer.querySelector('textarea');
                if (textarea) textarea.value = '#' + query;
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
