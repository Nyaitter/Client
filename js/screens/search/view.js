import { DOM } from '../../dom.js';
import { ICONS } from '../../icons.js';
import { escapeHTML, getSafeConfiguredFileUrl } from '../../utils/helpers.js';

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
            <input type="search" id="search-input" class="nui-input" placeholder="検索" aria-label="検索">
            ${renderAdvancedSearchButton()}
        </div>
        <h2 id="page-title">検索結果: "${escapeHTML(title)}"</h2>
        <div class="search-tabs nui-tabs" id="search-tabs-container" data-nui="tabs">
            <button type="button" class="tab-button nui-tab ${tab === 'posts' ? 'active is-active' : ''}" data-search-tab="posts">ポスト</button>
            <button type="button" class="tab-button nui-tab ${tab === 'users' ? 'active is-active' : ''}" data-search-tab="users">ユーザー</button>
            <button type="button" class="tab-button nui-tab ${tab === 'groups' ? 'active is-active' : ''}" data-search-tab="groups">グループ</button>
        </div>
    `;
}

export function renderGroupSearchResult(group) {
    const id = encodeURIComponent(String(group?.id || ''));
    const name = escapeHTML(group?.name || '無題のグループ');
    const description = escapeHTML(group?.description || '説明はありません。');
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
                <p class="nui-list-meta">${visibility} ・ ${memberCount}人<br>${description}</p>
            </div>
        </a>
    </article>`;
}

export function renderGroupResults(container, groups) {
    if (!container) return;
    container.innerHTML = groups.length
        ? `<div class="settings-sessions-list nui-list" data-nui="list">${groups.map(renderGroupSearchResult).join('')}</div>`
        : '<p class="settings-help-text nui-empty-text">該当する公開グループはありません。</p>';
}

export function renderSearchError(container, message = '') {
    if (container) {
        container.innerHTML = `<p class="error-message">グループの検索に失敗しました。${escapeHTML(message)}</p>`;
    }
}

export function renderAdvancedSearchButton() {
    return `<button type="button" class="advanced-search-button" aria-label="高度な検索" title="高度な検索">${ICONS.explore}</button>`;
}
