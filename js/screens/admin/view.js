import { DOM } from '../../dom.js';
import { ICONS } from '../../icons.js';
import { escapeHTML, getUserIconUrl } from '../../utils/helpers.js';

const OVERDUE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CONTAINER_CLASS = 'admin-requests-container';

export function renderHeader(title) {
    DOM.pageHeader.innerHTML = `
        <div class="header-with-back-button">
            <button class="header-back-btn" data-action="history-back" aria-label="戻る">${ICONS.back}</button>
            <h2 id="page-title">${escapeHTML(title)}</h2>
        </div>`;
}

export function renderLoading(content, className = DEFAULT_CONTAINER_CLASS) {
    if (content) {
        content.innerHTML = `<div class="${className}"><div class="spinner" aria-label="読み込み中"></div></div>`;
    }
}

export function renderError(content, message, className = DEFAULT_CONTAINER_CLASS) {
    if (content) {
        content.innerHTML = `<div class="${className}"><p class="error-message nui-empty-text">${escapeHTML(message)}</p></div>`;
    }
}

export function renderEmpty(content, message, className = DEFAULT_CONTAINER_CLASS) {
    if (content) {
        content.innerHTML = `
            <div class="${className}">
                <div class="admin-requests-empty">
                    <span class="admin-requests-empty__icon" aria-hidden="true">${ICONS.user_check}</span>
                    <p class="moderation-help-text nui-empty-text">${escapeHTML(message)}</p>
                </div>
            </div>`;
    }
}

export function requestTypeMeta(report) {
    if (report?.assignment_type === 'freeze_appeal') {
        return { key: 'freeze_appeal', label: '凍結異議', tone: 'appeal', icon: ICONS.shield };
    }
    if (report?.assignment_type === 'verification_application') {
        return { key: 'verification_application', label: '認証申請', tone: 'verify', icon: ICONS.verify };
    }
    return { key: 'report', label: '報告', tone: 'report', icon: ICONS.report };
}

export function moderationTargetLabel(kind) {
    return { user: 'ユーザー', post: 'ポスト', dm: 'DM', dm_message: 'DMメッセージ' }[kind] || 'コンテンツ';
}

export function formatRelativeTime(value, now = Date.now()) {
    if (!value) return '日時不明';
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return '日時不明';
    const diff = now - time;
    if (diff <= 0) return 'たった今';
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return 'たった今';
    if (diff < hour) return `${Math.floor(diff / minute)}分前`;
    if (diff < day) return `${Math.floor(diff / hour)}時間前`;
    if (diff < 30 * day) return `${Math.floor(diff / day)}日前`;
    return new Date(time).toLocaleDateString('ja-JP');
}

function truncate(value, maxLength) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}

function subjectName(user) {
    if (!user) return '';
    return user.name || (user.scid ? `@${user.scid}` : `#${user.id}`);
}

function subjectHandle(user) {
    if (!user) return '';
    return `@${user.scid || user.handle || user.id}`;
}

function renderSubjectRow(user, subtitle = '') {
    if (!user) return '';
    return `
        <span class="admin-request-subject">
            <span class="admin-request-avatar nui-avatar">
                <img src="${escapeHTML(getUserIconUrl(user))}" alt="" loading="lazy" decoding="async">
            </span>
            <span class="admin-request-subject__text">
                <strong>${escapeHTML(subjectName(user))}</strong>
                <span class="admin-request-subject__handle">${escapeHTML(subjectHandle(user))}</span>
                ${subtitle ? `<span class="admin-request-subject__sub">${escapeHTML(subtitle)}</span>` : ''}
            </span>
        </span>`;
}

function renderCardPreview(report, snapshot) {
    const subject = snapshot?.subjectUser || null;
    if (report.assignment_type === 'verification_application') {
        return renderSubjectRow(subject);
    }
    if (report.assignment_type === 'freeze_appeal') {
        const reason = snapshot?.freezeReason
            ? `<span class="admin-request-card__excerpt">${escapeHTML(truncate(snapshot.freezeReason, 130))}</span>`
            : '';
        return `${renderSubjectRow(subject, '凍結中のアカウント')}${reason}`;
    }
    if (report.target_kind === 'post') {
        const content = snapshot?.post?.content
            ? `<span class="admin-request-card__excerpt">${escapeHTML(truncate(snapshot.post.content, 170))}</span>`
            : '';
        return `${renderSubjectRow(subject)}${content}`;
    }
    if (report.target_kind === 'dm_message') {
        const content = snapshot?.message?.content
            ? `<span class="admin-request-card__excerpt">${escapeHTML(truncate(snapshot.message.content, 170))}</span>`
            : '';
        return `${renderSubjectRow(subject)}${content}`;
    }
    if (report.target_kind === 'dm') {
        const members = (snapshot?.dm?.members || []).map((member) => subjectName(member)).filter(Boolean).join('、');
        return `<span class="admin-request-card__excerpt">${escapeHTML(truncate(members || 'DMの証跡を確認', 170))}</span>`;
    }
    return renderSubjectRow(subject);
}

function renderCardFlags(report, snapshot, subject) {
    const flags = [];
    if (report.target_kind === 'post' && snapshot?.post) {
        if (snapshot.post.mask) flags.push('<span class="admin-request-flag admin-request-flag--mask nui-badge">ワンクッション</span>');
        if (snapshot.post.lock) flags.push('<span class="admin-request-flag admin-request-flag--lock nui-badge">限定公開</span>');
    }
    if (subject?.freeze) flags.push('<span class="admin-request-flag admin-request-flag--freeze nui-badge nui-badge-danger">凍結中</span>');
    if (subject?.shadow) flags.push('<span class="admin-request-flag admin-request-flag--shadow nui-badge">検索除外</span>');
    if (subject?.verify) flags.push('<span class="admin-request-flag admin-request-flag--verify nui-badge nui-badge-accent">認証済み</span>');
    return flags.join('');
}

export function renderRequestCard(report, options = {}) {
    const { formatDate = () => '日時不明', now = Date.now() } = options;
    const meta = requestTypeMeta(report);
    const snapshot = report.target_snapshot || {};
    const subject = snapshot?.subjectUser || null;
    const assignedAt = report.assigned_at || report.created_at;
    const age = assignedAt ? now - new Date(assignedAt).getTime() : 0;
    const overdue = Number.isFinite(age) && age >= OVERDUE_MS;

    const targetChip = meta.key === 'report'
        ? `<span class="admin-request-target">${escapeHTML(moderationTargetLabel(report.target_kind))}</span>`
        : '';

    const reasonLabel = meta.key === 'report'
        ? '報告理由'
        : meta.key === 'freeze_appeal'
            ? '異議の内容'
            : '申請内容';
    const reason = report.description
        ? `<span class="admin-request-card__reason">
               <span class="admin-request-card__reason-label">${reasonLabel}</span>
               ${escapeHTML(truncate(report.description, 150))}
           </span>`
        : '';

    const flags = renderCardFlags(report, snapshot, subject);

    return `
        <button type="button" class="admin-request-card admin-request-card--${meta.tone}${overdue ? ' is-overdue' : ''} nui-card is-interactive" data-action="open-admin-report" data-report-id="${Number(report.id)}">
            <span class="admin-request-card__rail" aria-hidden="true"></span>
            <span class="admin-request-card__head">
                <span class="admin-request-badge admin-request-badge--${meta.tone} nui-badge">
                    <span class="admin-request-badge__icon" aria-hidden="true">${meta.icon}</span>${escapeHTML(meta.label)}
                </span>
                ${targetChip}
                <span class="admin-request-card__time" title="${escapeHTML(formatDate(assignedAt))}">
                    ${overdue ? `<span class="admin-request-card__overdue">24時間以上</span>` : ''}
                    ${escapeHTML(formatRelativeTime(assignedAt, now))}
                </span>
            </span>
            ${renderCardPreview(report, snapshot)}
            ${reason}
            <span class="admin-request-card__foot">
                <span class="admin-request-card__id">リクエスト #${Number(report.id)}</span>
                <span class="admin-request-card__flags">${flags}</span>
            </span>
        </button>`;
}

export function renderReportList(content, reports, options = {}) {
    if (!content) return;
    const {
        formatDate = () => '日時不明',
        filter = 'all',
        onFilterChange = null,
        now = Date.now(),
    } = options;

    const counts = { all: reports.length, report: 0, freeze_appeal: 0, verification_application: 0 };
    for (const report of reports) counts[requestTypeMeta(report).key] += 1;

    const filterDefs = [
        { key: 'all', label: 'すべて', count: counts.all },
        { key: 'report', label: '報告', count: counts.report },
        { key: 'freeze_appeal', label: '凍結異議', count: counts.freeze_appeal },
        { key: 'verification_application', label: '認証申請', count: counts.verification_application },
    ].filter((def) => def.key === 'all' || def.count > 0);

    const activeFilter = filterDefs.some((def) => def.key === filter) ? filter : 'all';
    const visible = activeFilter === 'all'
        ? reports
        : reports.filter((report) => requestTypeMeta(report).key === activeFilter);

    content.innerHTML = `
        <div class="admin-requests-container nui-page" data-nui="page">
            <div class="admin-requests-overview nui-card" data-nui="card">
                <span class="admin-requests-overview__stat nui-stat">
                    <span class="admin-requests-overview__number">${reports.length}</span>
                    <span class="admin-requests-overview__label">対応待ち</span>
                </span>
                <p class="admin-requests-overview__hint nui-help-text">報告者の情報は、対応する管理者には表示されません。</p>
            </div>
            ${filterDefs.length > 1 ? `
            <div class="admin-requests-filters nui-tabs" role="tablist" aria-label="リクエストの種類" data-nui="tabs">
                ${filterDefs.map((def) => `
                    <button type="button" role="tab" aria-selected="${def.key === activeFilter}" class="admin-requests-filter nui-tab${def.key === activeFilter ? ' is-active' : ''}" data-request-filter="${def.key}">
                        ${escapeHTML(def.label)}<span class="admin-requests-filter__count">${def.count}</span>
                    </button>`).join('')}
            </div>` : ''}
            <div class="admin-requests-list nui-list" data-nui="list">
                ${visible.length === 0
                    ? '<p class="moderation-help-text admin-requests-list__empty nui-empty-text">該当するリクエストはありません。</p>'
                    : visible.map((report) => renderRequestCard(report, { formatDate, now })).join('')}
            </div>
        </div>`;

    if (typeof onFilterChange === 'function') {
        content.querySelectorAll('[data-request-filter]').forEach((button) => {
            button.addEventListener('click', () => onFilterChange(button.dataset.requestFilter));
        });
    }
}
