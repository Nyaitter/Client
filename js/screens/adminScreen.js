import { t } from '../modules/i18n.js';
import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { api, apiRequest } from '../api.js';
import {
    getCurrentUser,
    getPostLoadObserver,
    setPostLoadObserver,
    setIsLoadingMore,
    getIsLoadingMore,
} from '../state.js';
import { sendNotification } from '../modules/notifications.js';
import { openLoginModal } from '../modules/auth.js';
import { createViewportObserver } from '../utils/viewport.js';
import {
    escapeHTML,
    showLoading,
    showAppAlert,
    showAppConfirm,
    showAppPrompt,
} from '../utils/helpers.js';
import {
    renderEmpty,
    renderError,
    renderHeader,
    renderLoading,
    renderReportList,
} from './admin/view.js';
import { showScreenCompat } from '../screenManager.js';

export function formatModerationDate(value) {
    if (!value) return t('settings.common.unknown_date');
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? t('settings.common.unknown_date') : date.toLocaleString('ja-JP');
}

export function moderationTargetLabel(kind) {
    return { user: t('post.user_fallback'), post: t('composer.submit'), dm: 'DM' }[kind] || t('admin.target_content');
}

export function moderationEvidenceText(value) {
    if (typeof value === 'string') return escapeHTML(value);
    try {
        return escapeHTML(JSON.stringify(value, null, 2));
    } catch (_) {
        return t('admin.cannot_display');
    }
}

export function renderModerationSubject(user) {
    if (!user) return `<p class="moderation-help-text nui-empty-text">${t('admin.no_user_evidence')}</p>`;
    return `<div class="moderation-content-evidence"><strong>${escapeHTML(user.name || t('settings.general.name_unset'))}</strong><br><span class="moderation-help-text nui-help-text">@${escapeHTML(user.scid || user.handle || String(user.id))}</span></div>`;
}

export function moderationActionSummary(actions = {}) {
    const lines = [];
    if (actions.deletePost) lines.push(t('admin.action_delete_post'));
    if (actions.maskPost) lines.push(t('admin.action_mask_post'));
    if (actions.makePrivate) lines.push(t('admin.action_make_private'));
    if (actions.searchExclude) lines.push(t('admin.action_search_exclude'));
    if (actions.freeze) lines.push(t('admin.action_freeze', { reason: actions.freezeReason }));
    if (actions.notice) lines.push(t('admin.action_notice'));
    return lines;
}

function renderActionCard({ id, tone, icon, title, description }) {
    return `
        <label class="moderation-action-card moderation-action-card--${tone} nui-list-item">
            <input id="${id}" type="checkbox">
            <span class="moderation-action-card__icon" aria-hidden="true">${icon}</span>
            <span class="moderation-action-card__body">
                <span class="moderation-action-card__title nui-list-title">${escapeHTML(title)}</span>
                <span class="moderation-action-card__desc nui-list-meta">${escapeHTML(description)}</span>
            </span>
        </label>`;
}

function renderCurrentPostState(targetState, snapshot) {
    const exists = targetState ? targetState.exists !== false : true;
    const mask = targetState ? Boolean(targetState.mask) : Boolean(snapshot?.post?.mask);
    const lock = targetState ? Boolean(targetState.lock) : Boolean(snapshot?.post?.lock);
    if (!exists) {
        return `<div class="moderation-post-state"><span class="moderation-state-badge moderation-state-badge--deleted nui-badge nui-badge-danger">${t('admin.state_deleted')}</span></div>`;
    }
    const badges = [];
    if (mask) badges.push(`<span class="moderation-state-badge moderation-state-badge--mask nui-badge">${t('admin.state_masked')}</span>`);
    if (lock) badges.push(`<span class="moderation-state-badge moderation-state-badge--lock nui-badge">${t('post.private')}</span>`);
    if (badges.length === 0) {
        return `<p class="moderation-help-text nui-help-text">${t('admin.no_visibility_limit')}</p>`;
    }
    return `<div class="moderation-post-state">${badges.join('')}</div>`;
}

export async function showAdminReportsScreen(showScreenFn = null) {
    renderHeader(t('nav.admin_reports'));
    showScreenCompat('admin-reports-screen', showScreenFn);

    const contentDiv = document.getElementById('admin-reports-content');
    if (!contentDiv) return;
    renderLoading(contentDiv);

    try {
        const { data, error } = await apiRequest('/server/api/reports/assigned');
        if (error) throw error;
        const reports = Array.isArray(data?.reports) ? data.reports : [];
        if (reports.length === 0) {
            renderEmpty(contentDiv, t('admin.no_assigned_requests'));
            return;
        }
        let filter = 'all';
        const draw = () => {
            renderReportList(contentDiv, reports, {
                formatDate: formatModerationDate,
                filter,
                onFilterChange: (nextFilter) => {
                    filter = nextFilter;
                    draw();
                },
            });
        };
        draw();
    } catch (error) {
        console.error('リクエスト一覧の取得に失敗:', error);
        renderError(contentDiv, t('admin.requests_load_failed'));
    } finally {
        showLoading(false);
    }
}

export async function showAdminReportDetailScreen(reportId, showScreenFn = null) {
    const normalizedReportId = Number(reportId);
    if (!Number.isInteger(normalizedReportId) || normalizedReportId < 1) {
        window.location.hash = '#admin/reports';
        return;
    }
    renderHeader(t('admin.review_report_header'));
    showScreenCompat('admin-reports-screen', showScreenFn);

    const contentDiv = document.getElementById('admin-reports-content');
    if (!contentDiv) return;
    renderLoading(contentDiv);

    try {
        const { data, error } = await apiRequest(`/server/api/reports/${normalizedReportId}`);
        if (error) throw error;
        const report = data?.report;
        if (!report) throw new Error(t('admin.report_not_found'));
        const snapshot = report.target_snapshot || {};

        if (report.assignment_type === 'verification_application') {
            DOM.pageHeader.querySelector('#page-title').textContent = t('admin.review_verification_title');
            contentDiv.innerHTML = `
                <div class="moderation-review-layout nui-page" data-nui="page">
                    <header class="moderation-detail-head nui-page-heading" data-nui="page-heading">
                        <span class="admin-request-badge admin-request-badge--verify nui-badge">
                            <span class="admin-request-badge__icon" aria-hidden="true">${ICONS.verify}</span>${t('admin.verification_request_badge')}
                        </span>
                        <span class="moderation-detail-head__meta">${t('admin.request_number', { id: Number(report.id) })}</span>
                    </header>
                    <section class="moderation-review-section nui-section" data-nui="section">
                        <h3 class="nui-section-title">${t('admin.applicant')}</h3>
                        ${renderModerationSubject(snapshot.subjectUser)}
                    </section>
                    <section class="moderation-review-section nui-section" data-nui="section">
                        <h3 class="nui-section-title">${t('admin.decision')}</h3>
                        <p class="moderation-help-text nui-help-text">${t('admin.verification_approve_note')}</p>
                        <div class="moderation-form-actions nui-actions">
                            <button type="button" class="moderation-submit-button nui-button" data-verification-decision="approved">${t('admin.approve_and_verify')}</button>
                            <button type="button" class="delete-btn nui-button-danger" data-verification-decision="rejected">${t('admin.reject_button')}</button>
                        </div>
                        <p id="verification-decision-error" class="login-modal-message login-modal-error nui-help-text hidden" role="alert"></p>
                    </section>
                </div>`;

            document.querySelectorAll('[data-verification-decision]').forEach((button) => {
                button.addEventListener('click', async () => {
                    const decision = button.dataset.verificationDecision;
                    if (
                        !(await showAppConfirm(
                            decision === 'approved'
                                ? t('admin.verification_approve_confirm')
                                : t('admin.verification_reject_confirm'),
                        ))
                    )
                        return;
                    const errorElement = document.getElementById('verification-decision-error');
                    const { error: decisionError } = await apiRequest(
                        `/server/api/reports/${Number(report.id)}/resolve`,
                        {
                            method: 'POST',
                            body: { decision },
                        },
                    );
                    if (decisionError) {
                        if (errorElement) {
                            errorElement.textContent = decisionError.message || t('admin.verification_process_failed');
                            errorElement.classList.remove('hidden');
                        }
                        return;
                    }
                    await showAppAlert(
                        decision === 'approved' ? t('admin.verification_approved') : t('admin.verification_rejected'),
                    );
                    window.location.hash = '#admin/reports';
                });
            });
            return;
        }

        if (report.assignment_type === 'freeze_appeal') {
            DOM.pageHeader.querySelector('#page-title').textContent = t('admin.review_appeal_title');
            contentDiv.innerHTML = `
                <div class="moderation-review-layout nui-page" data-nui="page">
                    <header class="moderation-detail-head nui-page-heading" data-nui="page-heading">
                        <span class="admin-request-badge admin-request-badge--appeal nui-badge">
                            <span class="admin-request-badge__icon" aria-hidden="true">${ICONS.shield}</span>${t('admin.freeze_appeal_badge')}
                        </span>
                        <span class="moderation-detail-head__meta">${t('admin.request_number', { id: Number(report.id) })}</span>
                    </header>
                    <section class="moderation-review-section nui-section" data-nui="section">
                        <h3 class="nui-section-title">${t('admin.appeal_account')}</h3>
                        ${renderModerationSubject(snapshot.subjectUser)}
                    </section>
                    <section class="moderation-review-section nui-section" data-nui="section">
                        <h3 class="nui-section-title">${t('admin.current_freeze_reason')}</h3>
                        <div class="moderation-content-evidence">${escapeHTML(snapshot.freezeReason || t('admin.no_reason_recorded'))}</div>
                    </section>
                    <section class="moderation-review-section nui-section" data-nui="section">
                        <h3 class="nui-section-title">${t('admin.appeal_description')}</h3>
                        <div class="moderation-content-evidence">${escapeHTML(report.description || t('admin.no_description_attached'))}</div>
                    </section>
                    <section class="moderation-review-section nui-section" data-nui="section">
                        <h3 class="nui-section-title">${t('admin.decision')}</h3>
                        <div class="moderation-form-actions nui-actions" id="appeal-decision-actions">
                            <button type="button" class="moderation-submit-button nui-button" data-appeal-decision="approved">${t('admin.approve_and_unfreeze')}</button>
                            <button type="button" class="delete-btn nui-button-danger" data-appeal-decision="rejected">${t('admin.reject_button')}</button>
                        </div>
                        <p id="appeal-decision-error" class="login-modal-message login-modal-error nui-help-text hidden" role="alert"></p>
                    </section>
                </div>`;

            document.querySelectorAll('[data-appeal-decision]').forEach((button) => {
                button.addEventListener('click', async () => {
                    const decision = button.dataset.appealDecision;
                    if (
                        !(await showAppConfirm(
                            decision === 'approved'
                                ? t('admin.appeal_approve_confirm')
                                : t('admin.appeal_reject_confirm'),
                        ))
                    )
                        return;
                    const errorElement = document.getElementById('appeal-decision-error');
                    const { error: decisionError } = await apiRequest(
                        `/server/api/reports/${Number(report.id)}/appeal-decision`,
                        {
                            method: 'POST',
                            body: { decision },
                        },
                    );
                    if (decisionError) {
                        if (errorElement) {
                            errorElement.textContent = decisionError.message || t('admin.appeal_process_failed');
                            errorElement.classList.remove('hidden');
                        }
                        return;
                    }
                    await showAppAlert(
                        decision === 'approved'
                            ? t('admin.appeal_approved')
                            : t('admin.appeal_rejected'),
                    );
                    window.location.hash = '#admin/reports';
                });
            });
            return;
        }

        const targetUsers = snapshot.subjectUser ? [snapshot.subjectUser] : snapshot.dm?.members || [];
        const selectableUsers = targetUsers.filter((u) => Number.isInteger(Number(u?.id)));
        const targetOptions = selectableUsers
            .map(
                (u) =>
                    `<option value="${Number(u.id)}">${escapeHTML(u.name || `@${u.id}`)} (@${escapeHTML(u.scid || u.handle || u.id)})</option>`,
            )
            .join('');

        const dmEvidence =
            (snapshot.dm?.recentMessages || [])
                .map((m) => `<div class="moderation-message-evidence">${moderationEvidenceText(m?.content || m)}</div>`)
                .join('') || t('admin.no_message_evidence');

        const isPost = report.target_kind === 'post';
        const targetState = report.target_state || null;
        const postAvailable = isPost && (!targetState || targetState.exists !== false);
        const alreadyMasked = targetState ? Boolean(targetState.mask) : Boolean(snapshot.post?.mask);
        const alreadyPrivate = targetState ? Boolean(targetState.lock) : Boolean(snapshot.post?.lock);

        const postStateSection = isPost
            ? `<section class="moderation-review-section nui-section" data-nui="section">
                   <h3 class="nui-section-title">${t('admin.post_current_state')}</h3>
                   ${renderCurrentPostState(targetState, snapshot)}
               </section>`
            : '';

        const evidence =
            isPost
                ? `<div class="moderation-review-section nui-section" data-nui="section"><h3 class="nui-section-title">${t('admin.reported_post')}</h3>${renderModerationSubject(snapshot.subjectUser)}<div class="moderation-content-evidence">${moderationEvidenceText(snapshot.post?.content || '')}</div></div>`
                : report.target_kind === 'dm_message'
                  ? `<div class="moderation-review-section nui-section" data-nui="section"><h3 class="nui-section-title">${t('admin.reported_dm_message')}</h3>${renderModerationSubject(snapshot.subjectUser)}<div class="moderation-content-evidence">${moderationEvidenceText(snapshot.message?.content || t('admin.no_content_recorded'))}</div><div class="moderation-content-evidence">${dmEvidence}</div></div>`
                  : report.target_kind === 'dm'
                    ? `<div class="moderation-review-section nui-section" data-nui="section"><h3 class="nui-section-title">${t('admin.reported_dm')}</h3><div class="moderation-content-evidence">${dmEvidence}</div></div>`
                    : `<div class="moderation-review-section nui-section" data-nui="section"><h3 class="nui-section-title">${t('admin.reported_user')}</h3>${renderModerationSubject(snapshot.subjectUser)}</div>`;

        const actionCards = [
            postAvailable ? {
                id: 'moderation-delete-post',
                tone: 'delete',
                icon: ICONS.trash,
                title: t('admin.action_delete_post'),
                description: t('admin.action_delete_post_desc'),
            } : null,
            postAvailable && !alreadyMasked ? {
                id: 'moderation-mask-post',
                tone: 'mask',
                icon: ICONS.preview,
                title: t('admin.action_mask_post'),
                description: t('admin.action_mask_post_desc'),
            } : null,
            postAvailable && !alreadyPrivate ? {
                id: 'moderation-make-private',
                tone: 'lock',
                icon: ICONS.lock,
                title: t('admin.action_make_private'),
                description: t('admin.action_make_private_desc'),
            } : null,
            {
                id: 'moderation-search-exclude',
                tone: 'shadow',
                icon: ICONS.search_off,
                title: t('admin.action_search_exclude'),
                description: t('admin.action_search_exclude_desc'),
            },
            {
                id: 'moderation-freeze',
                tone: 'freeze',
                icon: ICONS.freeze,
                title: t('admin.action_freeze_title'),
                description: t('admin.action_freeze_desc'),
            },
        ].filter(Boolean);

        contentDiv.innerHTML = `
            <div class="moderation-review-layout nui-page" data-nui="page">
                <header class="moderation-detail-head nui-page-heading" data-nui="page-heading">
                    <span class="admin-request-badge admin-request-badge--report nui-badge">
                        <span class="admin-request-badge__icon" aria-hidden="true">${ICONS.report}</span>${t('admin.report_badge')}
                    </span>
                    <span class="admin-request-target">${escapeHTML(moderationTargetLabel(report.target_kind))}</span>
                    <span class="moderation-detail-head__meta">${t('admin.request_number', { id: Number(report.id) })}</span>
                </header>
                <section class="moderation-review-section nui-section" data-nui="section">
                    <h3 class="nui-section-title">${t('admin.report_reason')}</h3>
                    <div class="moderation-content-evidence">${escapeHTML(report.description || t('admin.no_description_attached'))}</div>
                </section>
                ${evidence}
                ${postStateSection}
                <section class="moderation-review-section moderation-review-section--actions nui-section" data-nui="section">
                    <h3 class="nui-section-title">${t('admin.response')}</h3>
                    <p class="moderation-help-text nui-help-text">${t('admin.response_hint')}</p>
                    <form id="moderation-resolution-form" class="nui-form" data-report-id="${Number(report.id)}" data-nui="form">
                        ${selectableUsers.length > 0 ? `<div class="moderation-action-field nui-field"><label for="moderation-target-user">${t('admin.target_user_label')}</label><select id="moderation-target-user" class="moderation-target-select nui-input"><option value="">${t('admin.select_placeholder')}</option>${targetOptions}</select><p class="moderation-help-text nui-help-text">${t('admin.target_user_hint')}</p></div>` : ''}
                        <div class="moderation-action-grid">
                            ${actionCards.map((card) => renderActionCard(card)).join('')}
                        </div>
                        <div class="moderation-action-field nui-field"><label for="moderation-freeze-reason">${t('admin.freeze_reason_label')}</label><input id="moderation-freeze-reason" class="moderation-target-select nui-input" type="text" maxlength="2000" placeholder="${t('admin.freeze_reason_placeholder')}"></div>
                        <div class="moderation-action-field nui-field"><label for="moderation-notice">${t('admin.notice_label')}</label><textarea id="moderation-notice" class="moderation-textarea nui-input" maxlength="2000" rows="4" placeholder="${t('admin.notice_placeholder')}"></textarea></div>
                        <div class="moderation-form-actions nui-actions"><button type="submit" class="moderation-submit-button nui-button">${t('admin.complete_response')}</button></div>
                        <p id="moderation-resolution-error" class="login-modal-message login-modal-error nui-help-text hidden" role="alert"></p>
                    </form>
                </section>
            </div>`;

        const form = document.getElementById('moderation-resolution-form');
        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const errorElement = document.getElementById('moderation-resolution-error');
            const targetUserId = document.getElementById('moderation-target-user')?.value || null;
            const actions = {
                deletePost: Boolean(document.getElementById('moderation-delete-post')?.checked),
                maskPost: Boolean(document.getElementById('moderation-mask-post')?.checked),
                makePrivate: Boolean(document.getElementById('moderation-make-private')?.checked),
                searchExclude: Boolean(document.getElementById('moderation-search-exclude')?.checked),
                freeze: Boolean(document.getElementById('moderation-freeze')?.checked),
                freezeReason: document.getElementById('moderation-freeze-reason')?.value || '',
                notice: document.getElementById('moderation-notice')?.value || '',
                targetUserId: targetUserId ? Number(targetUserId) : null,
            };

            if (errorElement) errorElement.classList.add('hidden');
            const summary = moderationActionSummary(actions);
            const confirmation = summary.length > 0
                ? t('admin.resolve_confirm', { items: summary.join('\n・') })
                : t('admin.resolve_confirm_none');
            if (!(await showAppConfirm(confirmation))) return;

            const submit = form.querySelector('button[type="submit"]');
            if (submit) submit.disabled = true;
            const { error: resolveError } = await apiRequest(`/server/api/reports/${Number(report.id)}/resolve`, {
                method: 'POST',
                body: { actions },
            });
            if (submit) submit.disabled = false;
            if (resolveError) {
                if (errorElement) {
                    errorElement.textContent = resolveError.message || t('admin.resolve_failed');
                    errorElement.classList.remove('hidden');
                }
                return;
            }
            await showAppAlert(t('admin.resolve_done'));
            window.location.hash = '#admin/reports';
        });
    } catch (error) {
        console.error('報告詳細の取得に失敗:', error);
        contentDiv.innerHTML = `<div class="admin-requests-container nui-page" data-nui="page"><p class="error-message nui-empty-text">${t('admin.report_detail_failed')}</p></div>`;
    } finally {
        showLoading(false);
    }
}

export async function showAdminLogsScreen(showScreenFn = null) {
    renderHeader(t('settings.apps.scope.access_log'));
    showScreenCompat('admin-logs-screen', showScreenFn);

    const contentDiv = document.getElementById('admin-logs-content');
    if (!contentDiv) return;
    contentDiv.innerHTML = '';

    setIsLoadingMore(false);
    const LOGS_PER_PAGE = 30;
    let currentPage = 0;
    let hasMore = true;

    const trigger = document.createElement('div');
    trigger.className = 'load-more-trigger';
    contentDiv.appendChild(trigger);

    let preloadLogsPromise = null;
    const triggerPreloadNextLogs = (nextPage) => {
        if (!hasMore) return;
        const nextOffset = nextPage * LOGS_PER_PAGE;
        preloadLogsPromise = api.rpc('get_logs_with_masked_ip', {
            p_limit: LOGS_PER_PAGE,
            p_offset: nextOffset,
        }).catch(() => null);
    };

    const loadMoreLogs = async () => {
        if (getIsLoadingMore() || !hasMore) return;
        setIsLoadingMore(true);
        trigger.innerHTML = '<div class="spinner"></div>';

        try {
            const offset = currentPage * LOGS_PER_PAGE;
            let data;
            let error;
            if (preloadLogsPromise) {
                const res = await preloadLogsPromise;
                preloadLogsPromise = null;
                data = res?.data;
                error = res?.error;
            } else {
                const res = await api.rpc('get_logs_with_masked_ip', {
                    p_limit: LOGS_PER_PAGE,
                    p_offset: offset,
                });
                data = res?.data;
                error = res?.error;
            }

            if (error) {
                console.error('ログの取得に失敗:', error);
                trigger.innerHTML = `<p class="error-message nui-empty-text">${escapeHTML(error.message)}</p>`;
                hasMore = false;
                return;
            }

            if (data && data.length > 0) {
                data.forEach((log) => {
                    const logItem = document.createElement('div');
                    logItem.className = 'widget-item nui-list-item';
                    logItem.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem;';
                    logItem.innerHTML = `
                        <div><strong>SCID:</strong> ${escapeHTML(log.scratch_id)} (#${escapeHTML(log.nyaitter_id)})</div>
                        <div style="font-size: 0.9rem; color: var(--secondary-text-color);">${new Date(log.log_time).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</div>
                        <div style="font-size: 0.8rem; color: var(--secondary-text-color); font-family: monospace; word-break: break-all;">${t('admin.identifier_label')}${escapeHTML(log.masked_ip_uuid)}</div>
                    `;
                    contentDiv.insertBefore(logItem, trigger);
                });
                currentPage++;
            }

            if (!data || data.length < LOGS_PER_PAGE) {
                hasMore = false;
                trigger.innerHTML =
                    contentDiv.children.length > 1
                        ? t('admin.logs_all_loaded')
                        : t('admin.logs_none');
                if (getPostLoadObserver()) getPostLoadObserver().disconnect();
            } else {
                trigger.innerHTML = '';
                triggerPreloadNextLogs(currentPage);
                requestAnimationFrame(() => {
                    if (!hasMore || getIsLoadingMore()) return;
                    const rect = trigger.getBoundingClientRect();
                    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
                    if (rect.top <= vh + 300 && rect.bottom >= -300) {
                        void loadMoreLogs();
                    }
                });
            }
        } finally {
            setIsLoadingMore(false);
        }
    };

    setPostLoadObserver(
        createViewportObserver(
            (entries) => {
                if (entries[0].isIntersecting) void loadMoreLogs();
            },
            { rootMargin: '300px' },
        ),
    );
    getPostLoadObserver().observe(trigger);
    showLoading(false);
}

export async function adminToggleVerify(targetUser) {
    const newVerifyStatus = !targetUser.verify;
    const actionText = newVerifyStatus ? t('settings.verification.title') : t('admin.verify_revoke');

    if (await showAppConfirm(t('admin.verify_confirm', { action: actionText }))) {
        const { error } = await api
            .from('user')
            .update({ verify: newVerifyStatus })
            .eq('id', targetUser.id);
        if (error) {
            showAppAlert(t('admin.action_failed', { action: actionText, message: error.message }));
        } else {
            await showAppAlert(t('admin.verify_done', { action: actionText }));
            window.location.reload();
        }
    }
}

export async function adminSendNotice(targetUserId) {
    if (!(await showAppConfirm(t('admin.notice_confirm')))) return;
    await sendNotification(targetUserId, 'admin_notice', { kind: 'route', value: '#notifications' });
    showAppAlert(t('admin.notice_sent'));
}

export async function adminToggleShadow(targetUser) {
    const newShadowStatus = !targetUser.shadow;
    const actionText = newShadowStatus ? t('admin.enable') : t('settings.general.disable');

    if (await showAppConfirm(t('admin.shadow_confirm', { action: actionText }))) {
        const { data, error } = await api.rpc('admin_set_status', {
            p_id: targetUser.id,
            p_shadow: newShadowStatus,
        });
        if (error) {
            showAppAlert(t('admin.action_failed', { action: actionText, message: error.message }));
        } else {
            targetUser.shadow = data?.status?.shadow === undefined
                ? newShadowStatus
                : Boolean(data.status.shadow);
            await showAppAlert(t('admin.shadow_done', { action: actionText }));
            window.location.reload();
        }
    }
}

export async function adminFreezeAccount(targetUserId) {
    const reason = await showAppPrompt(t('admin.freeze_reason_prompt'));
    if (reason && reason.trim()) {
        if (await showAppConfirm(t('admin.freeze_confirm', { reason }))) {
            const { error } = await api
                .from('user')
                .update({ freeze: reason.trim() })
                .eq('id', targetUserId);
            if (error) {
                showAppAlert(t('admin.freeze_failed', { message: error.message }));
            } else {
                await showAppAlert(t('admin.freeze_done'));
                window.location.reload();
            }
        }
    } else {
        showAppAlert(t('admin.freeze_reason_required'));
    }
}

export async function adminUnfreezeAccount(targetUserId) {
    if (!(await showAppConfirm(t('admin.unfreeze_confirm')))) return;
    const { error } = await api
        .from('user')
        .update({ freeze: null })
        .eq('id', targetUserId);
    if (error) {
        showAppAlert(t('admin.unfreeze_failed', { message: error.message }));
        return;
    }
    await showAppAlert(t('admin.unfreeze_done'));
    window.location.reload();
}

export function openReportModal({ targetKind, targetId, targetLabel }) {
    if (!getCurrentUser()) {
        openLoginModal();
        return;
    }
    const modal = document.getElementById('report-modal');
    const form = document.getElementById('report-form');
    const description = document.getElementById('report-description');
    const target = document.getElementById('report-modal-target');
    const errorElement = document.getElementById('report-modal-error');
    if (!modal || !form || !description || !target) return;

    form.reset();
    errorElement?.classList.add('hidden');
    target.textContent = t('admin.report_target', { target: targetLabel });
    modal.classList.remove('hidden');
    description.focus();

    modal.querySelector('.modal-close-btn').onclick = closeReportModal;
    modal.querySelector('[data-action="close-report-modal"]').onclick = closeReportModal;
    modal.onclick = (event) => {
        if (event.target === modal) closeReportModal();
    };

    form.onsubmit = async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        if (submit) submit.disabled = true;
        errorElement?.classList.add('hidden');
        const { error } = await apiRequest('/server/api/reports', {
            method: 'POST',
            body: {
                target_kind: targetKind,
                target_id: targetKind === 'dm' ? String(targetId) : Number(targetId),
                description: description.value,
            },
        });
        if (submit) submit.disabled = false;
        if (error) {
            if (errorElement) {
                errorElement.textContent = error.message || String(error) || t('admin.report_send_failed');
                errorElement.classList.remove('hidden');
            }
            return;
        }
        closeReportModal();
        await showAppAlert(t('admin.report_sent'));
    };
}

export function closeReportModal() {
    const modal = document.getElementById('report-modal');
    modal?.classList.add('hidden');
}
