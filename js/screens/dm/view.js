import { DOM } from '../../dom.js';

export function renderListHeader() {
    DOM.pageHeader.innerHTML = `
        <div class="header-with-action-button">
            <h2 id="page-title">メッセージ</h2>
            <button type="button" class="header-action-btn" data-action="open-create-dm">新しいメッセージ</button>
        </div>`;
}

export function renderConversationShell(content) {
    if (content) content.innerHTML = '<div id="dm-conversation-container"></div>';
}

export function renderListShell(content, activeTab) {
    if (!content) return;
    content.innerHTML = `
        <div class="dm-tabs-container">
            <button type="button" class="dm-tab-button ${activeTab === 'inbox' ? 'active' : ''}" data-dm-tab="inbox">
                <span>メッセージ</span>
            </button>
            <button type="button" class="dm-tab-button ${activeTab === 'requests' ? 'active' : ''}" data-dm-tab="requests">
                <span>リクエスト</span>
                <span class="dm-tab-badge hidden" id="dm-request-tab-badge">0</span>
            </button>
        </div>
        <div id="dm-list-container" class="dm-list-container">
            <div id="dm-list-items-wrapper" class="dm-list-items-wrapper spinner" aria-label="読み込み中"></div>
        </div>`;
}
