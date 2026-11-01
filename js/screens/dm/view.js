import { DOM } from '../../dom.js';
import { t } from '../../modules/i18n.js';

export function renderListHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-with-action-button">
            <h2 id="page-title">${t('nav.dm')}</h2>
            <button type="button" class="header-action-btn nui-button-secondary" data-nui="button-secondary" data-action="open-create-dm">${t('dm.new_short')}</button>
        </div>`;
}

export function renderConversationShell(content) {
    if (content) content.innerHTML = '<div id="dm-conversation-container"></div>';
}

export function renderListShell(content, activeTab) {
    if (!content) return;
    content.innerHTML = `
        <div class="dm-tabs-container nui-tabs" data-nui="tabs">
            <button type="button" class="dm-tab-button nui-tab ${activeTab === 'inbox' ? 'active is-active' : ''}" data-dm-tab="inbox">
                <span>${t('nav.dm')}</span>
            </button>
            <button type="button" class="dm-tab-button nui-tab ${activeTab === 'requests' ? 'active is-active' : ''}" data-dm-tab="requests">
                <span>${t('dm.tab_requests')}</span>
                <span class="dm-tab-badge hidden" id="dm-request-tab-badge">0</span>
            </button>
        </div>
        <div id="dm-list-container" class="dm-list-container">
            <div id="dm-list-items-wrapper" class="dm-list-items-wrapper nui-list nui-list--flush spinner" data-nui="list" aria-label="${t('common.loading')}"></div>
        </div>`;
}
