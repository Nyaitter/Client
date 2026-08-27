import { DOM } from '../../dom.js';
import { ICONS } from '../../icons.js';
import { escapeHTML } from '../../utils/helpers.js';

export function renderHeader(title) {
    DOM.pageHeader.innerHTML = `
        <div class="header-with-back-button">
            <button class="header-back-btn" data-action="history-back" aria-label="戻る">${ICONS.back}</button>
            <h2 id="page-title">${escapeHTML(title)}</h2>
        </div>`;
}

export function renderLoading(content, className = 'admin-reports-container') {
    if (content) content.innerHTML = `<div class="${className}"><div class="spinner" aria-label="読み込み中"></div></div>`;
}

export function renderError(content, message, className = 'admin-reports-container') {
    if (content) content.innerHTML = `<div class="${className}"><p class="error-message">${escapeHTML(message)}</p></div>`;
}

export function renderEmpty(content, message, className = 'admin-reports-container') {
    if (content) content.innerHTML = `<div class="${className}"><p class="moderation-help-text">${escapeHTML(message)}</p></div>`;
}

export function renderReportList(content, reports, formatDate, targetLabel) {
    if (!content) return;
    content.innerHTML = `
        <div class="admin-reports-container">
            <div class="admin-reports-list">
                ${reports.map((report) => `
                    <button type="button" class="moderation-report-card" data-action="open-admin-report" data-report-id="${Number(report.id)}">
                        <strong>${report.assignment_type === 'freeze_appeal' ? '凍結異議申し立て' : report.assignment_type === 'verification_application' ? '認証申請' : `${targetLabel(report.target_kind)}の報告`}</strong>
                        <div class="moderation-report-meta">
                            <span>割当: ${escapeHTML(formatDate(report.assigned_at))}</span>
                            <span>リクエストID: ${Number(report.id)}</span>
                        </div>
                        <p>${escapeHTML(report.description || '説明は添付されていません。')}</p>
                    </button>
                `).join('')}
            </div>
        </div>`;
}
