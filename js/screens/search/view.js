import { DOM } from '../../dom.js';
import { ICONS } from '../../icons.js';
import { escapeHTML } from '../../utils/helpers.js';

const GROUP_VISIBILITY_LABELS = {
    open: 'Open',
    open_invite: 'OpenInvite',
};

function getGroupImageUrl(value) {
    const image = typeof value === 'string' ? value.trim() : '';
    if (!image) return '';
    if (/^data:image\//i.test(image) || /^https?:\/\//i.test(image)) return image;
    const configuredUrl = globalThis.NyaitterClientConfig?.userFileUrl?.(image);
    return typeof configuredUrl === 'string' ? configuredUrl : image;
}

export function renderSearchHeader(query, tab, title) {
    DOM.pageHeader.innerHTML = `
        <div class="header-search-bar">
            ${ICONS.explore}
            <input type="search" id="search-input" placeholder="検索">
        </div>
        <h2 id="page-title">検索結果: "${title}"</h2>
        <div class="search-tabs" id="search-tabs-container">
            <button class="tab-button ${tab === 'posts' ? 'active' : ''}" data-search-tab="posts">ポスト</button>
            <button class="tab-button ${tab === 'users' ? 'active' : ''}" data-search-tab="users">ユーザー</button>
            <button class="tab-button ${tab === 'groups' ? 'active' : ''}" data-search-tab="groups">グループ</button>
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
        ? `<img class="group-ui-avatar" src="${escapeHTML(imageUrl)}" alt="">`
        : `<div class="group-ui-avatar group-ui-avatar-fallback" aria-hidden="true">${ICONS.group}</div>`;
    return `<article class="settings-session-item group-ui-list-item">
        <a class="group-ui-list-link" href="#group/${id}">
            ${avatar}
            <div class="settings-session-details">
                <span class="settings-session-title">${name}</span>
                <p>${visibility} ・ ${memberCount}人<br>${description}</p>
            </div>
        </a>
    </article>`;
}

export function renderGroupResults(container, groups) {
    if (!container) return;
    container.innerHTML = groups.length
        ? `<div class="settings-sessions-list">${groups.map(renderGroupSearchResult).join('')}</div>`
        : '<p class="settings-help-text">該当する公開グループはありません。</p>';
}

export function renderSearchError(container, message = '') {
    if (container) {
        container.innerHTML = `<p class="error-message">グループの検索に失敗しました。${escapeHTML(message)}</p>`;
    }
}
