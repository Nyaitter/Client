import { DOM } from '../../dom.js';
import { ICONS } from '../../icons.js';
import { escapeHTML } from '../../utils/helpers.js';

export function renderHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-with-back-button">
            <button class="header-back-btn" data-action="history-back" aria-label="戻る">${ICONS.back}</button>
            <h2 id="page-title">
                <div id="page-title-main">プロフィール</div>
                <small id="page-title-sub"></small>
            </h2>
        </div>`;
}

export function renderTabs(container, user, activeTab) {
    if (!container) return;
    const sharedGroups = Array.isArray(user?.groups) ? user.groups : [];
    const tabs = [
        { key: 'posts', name: 'ポスト' },
        { key: 'media', name: 'メディア' },
        { key: 'likes', name: 'いいね' },
        { key: 'stars', name: 'お気に入り' },
        ...sharedGroups.map((group) => ({
            key: `group:${group.id}`,
            name: group.name || 'グループ',
            className: 'profile-group-tab',
            title: group.name || 'グループ',
        })),
    ];
    container.innerHTML = tabs.map((tab) => (
        `<button class="tab-button ${tab.className || ''} ${tab.key === activeTab ? 'active' : ''}" data-tab="${escapeHTML(tab.key)}" title="${escapeHTML(tab.title || tab.name)}">${escapeHTML(tab.name)}</button>`
    )).join('');
    return tabs;
}
