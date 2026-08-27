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
    if (!value) return '日時不明';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '日時不明' : date.toLocaleString('ja-JP');
}

export function moderationTargetLabel(kind) {
    return { user: 'ユーザー', post: 'ポスト', dm: 'DM' }[kind] || 'コンテンツ';
}

export function moderationEvidenceText(value) {
    if (typeof value === 'string') return escapeHTML(value);
    try {
        return escapeHTML(JSON.stringify(value, null, 2));
    } catch (_) {
        return '表示できません';
    }
}

export function renderModerationSubject(user) {
    if (!user) return '<p class="moderation-help-text">対象ユーザーの証跡はありません。</p>';
    return `<div class="moderation-content-evidence"><strong>${escapeHTML(user.name || '名称未設定')}</strong><br><span class="moderation-help-text">@${escapeHTML(user.scid || user.handle || String(user.id))}</span></div>`;
}

export async function showAdminReportsScreen(showScreenFn = null) {
    renderHeader('リクエスト');
    showScreenCompat('admin-reports-screen', showScreenFn);

    const contentDiv = document.getElementById('admin-reports-content');
    if (!contentDiv) return;
    renderLoading(contentDiv);

    try {
        const { data, error } = await apiRequest('/server/api/reports/assigned');
        if (error) throw error;
        const reports = Array.isArray(data?.reports) ? data.reports : [];
        if (reports.length === 0) {
            renderEmpty(contentDiv, '現在、あなたに割り当てられているリクエストはありません。');
            return;
        }
        renderReportList(contentDiv, reports, formatModerationDate, moderationTargetLabel);
    } catch (error) {
        console.error('リクエスト一覧の取得に失敗:', error);
        renderError(contentDiv, 'リクエスト一覧の取得に失敗しました。');
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
    renderHeader('報告を確認');
    showScreenCompat('admin-reports-screen', showScreenFn);

    const contentDiv = document.getElementById('admin-reports-content');
    if (!contentDiv) return;
    renderLoading(contentDiv);

    try {
        const { data, error } = await apiRequest(`/server/api/reports/${normalizedReportId}`);
        if (error) throw error;
        const report = data?.report;
        if (!report) throw new Error('報告が見つかりません');
        const snapshot = report.target_snapshot || {};

        if (report.assignment_type === 'verification_application') {
            DOM.pageHeader.querySelector('#page-title').textContent = '認証申請を確認';
            contentDiv.innerHTML = `
                <div class="moderation-review-layout">
                    <section class="moderation-review-section">
                        <h3>申請者</h3>
                        ${renderModerationSubject(snapshot.subjectUser)}
                    </section>
                    <section class="moderation-review-section">
                        <h3>判断</h3>
                        <p class="moderation-help-text">承認すると、申請者のプロフィールに認証バッジを付与します。</p>
                        <div class="moderation-form-actions">
                            <button type="button" class="moderation-submit-button" data-verification-decision="approved">承認して認証する</button>
                            <button type="button" class="delete-btn" data-verification-decision="rejected">拒否する</button>
                        </div>
                        <p id="verification-decision-error" class="login-modal-message login-modal-error hidden" role="alert"></p>
                    </section>
                </div>`;

            document.querySelectorAll('[data-verification-decision]').forEach((button) => {
                button.addEventListener('click', async () => {
                    const decision = button.dataset.verificationDecision;
                    if (
                        !(await showAppConfirm(
                            decision === 'approved'
                                ? 'この認証申請を承認し、認証バッジを付与しますか？'
                                : 'この認証申請を拒否しますか？',
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
                            errorElement.textContent = decisionError.message || '認証申請を処理できませんでした。';
                            errorElement.classList.remove('hidden');
                        }
                        return;
                    }
                    await showAppAlert(
                        decision === 'approved' ? '認証申請を承認しました。' : '認証申請を拒否しました。',
                    );
                    window.location.hash = '#admin/reports';
                });
            });
            return;
        }

        if (report.assignment_type === 'freeze_appeal') {
            DOM.pageHeader.querySelector('#page-title').textContent = '異議申し立てを確認';
            contentDiv.innerHTML = `
                <div class="moderation-review-layout">
                    <section class="moderation-review-section">
                        <h3>申立対象のアカウント</h3>
                        ${renderModerationSubject(snapshot.subjectUser)}
                    </section>
                    <section class="moderation-review-section">
                        <h3>現在の凍結理由</h3>
                        <div class="moderation-content-evidence">${escapeHTML(snapshot.freezeReason || '理由は記録されていません。')}</div>
                    </section>
                    <section class="moderation-review-section">
                        <h3>異議申し立ての説明</h3>
                        <div class="moderation-content-evidence">${escapeHTML(report.description || '説明は添付されていません。')}</div>
                    </section>
                    <section class="moderation-review-section">
                        <h3>判断</h3>
                        <div class="moderation-form-actions" id="appeal-decision-actions">
                            <button type="button" class="moderation-submit-button" data-appeal-decision="approved">承認して凍結を解除</button>
                            <button type="button" class="delete-btn" data-appeal-decision="rejected">拒否する</button>
                        </div>
                        <p id="appeal-decision-error" class="login-modal-message login-modal-error hidden" role="alert"></p>
                    </section>
                </div>`;

            document.querySelectorAll('[data-appeal-decision]').forEach((button) => {
                button.addEventListener('click', async () => {
                    const decision = button.dataset.appealDecision;
                    if (
                        !(await showAppConfirm(
                            decision === 'approved'
                                ? 'この異議申し立てを承認し、アカウントの凍結を解除しますか？'
                                : 'この異議申し立てを拒否しますか？',
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
                            errorElement.textContent = decisionError.message || '異議申し立てを処理できませんでした。';
                            errorElement.classList.remove('hidden');
                        }
                        return;
                    }
                    await showAppAlert(
                        decision === 'approved'
                            ? '異議申し立てを承認し、凍結を解除しました。'
                            : '異議申し立てを拒否しました。',
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
                .join('') || 'メッセージ証跡はありません。';

        const evidence =
            report.target_kind === 'post'
                ? `<div class="moderation-review-section"><h3>報告されたポスト</h3>${renderModerationSubject(snapshot.subjectUser)}<div class="moderation-content-evidence">${moderationEvidenceText(snapshot.post?.content || '')}</div></div>`
                : report.target_kind === 'dm_message'
                  ? `<div class="moderation-review-section"><h3>報告されたDMメッセージ</h3>${renderModerationSubject(snapshot.subjectUser)}<div class="moderation-content-evidence">${moderationEvidenceText(snapshot.message?.content || '本文は記録されていません。')}</div><div class="moderation-content-evidence">${dmEvidence}</div></div>`
                  : report.target_kind === 'dm'
                    ? `<div class="moderation-review-section"><h3>報告されたDM</h3><div class="moderation-content-evidence">${dmEvidence}</div></div>`
                    : `<div class="moderation-review-section"><h3>報告されたユーザー</h3>${renderModerationSubject(snapshot.subjectUser)}</div>`;

        contentDiv.innerHTML = `
            <div class="moderation-review-layout">
                <section class="moderation-review-section">
                    <h3>報告理由</h3>
                    <div class="moderation-content-evidence">${escapeHTML(report.description || '説明は添付されていません。')}</div>
                </section>
                ${evidence}
                <section class="moderation-review-section">
                    <h3>対応</h3>
                    <form id="moderation-resolution-form" data-report-id="${Number(report.id)}">
                        ${selectableUsers.length > 0 ? `<div class="moderation-action-field"><label for="moderation-target-user">対応対象ユーザー</label><select id="moderation-target-user" class="moderation-target-select"><option value="">選択してください</option>${targetOptions}</select></div>` : ''}
                        <div class="moderation-action-grid">
                            ${report.target_kind === 'post' ? '<label><input id="moderation-delete-post" type="checkbox"> 該当ポストを削除</label>' : ''}
                            <label><input id="moderation-search-exclude" type="checkbox"> 検索から除外</label>
                            <label><input id="moderation-freeze" type="checkbox"> アカウントを凍結</label>
                        </div>
                        <div class="moderation-action-field"><label for="moderation-freeze-reason">凍結理由</label><input id="moderation-freeze-reason" class="moderation-target-select" type="text" maxlength="2000" placeholder="凍結する場合のみ入力"></div>
                        <div class="moderation-action-field"><label for="moderation-notice">対象ユーザーへの通知</label><textarea id="moderation-notice" class="moderation-textarea" maxlength="2000" rows="4" placeholder="任意の通知本文"></textarea></div>
                        <div class="moderation-form-actions"><button type="submit" class="moderation-submit-button">対応を完了する</button></div>
                        <p id="moderation-resolution-error" class="login-modal-message login-modal-error hidden" role="alert"></p>
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
                searchExclude: Boolean(document.getElementById('moderation-search-exclude')?.checked),
                freeze: Boolean(document.getElementById('moderation-freeze')?.checked),
                freezeReason: document.getElementById('moderation-freeze-reason')?.value || '',
                notice: document.getElementById('moderation-notice')?.value || '',
                targetUserId: targetUserId ? Number(targetUserId) : null,
            };

            const submit = form.querySelector('button[type="submit"]');
            if (submit) submit.disabled = true;
            const { error: resolveError } = await apiRequest(`/server/api/reports/${Number(report.id)}/resolve`, {
                method: 'POST',
                body: { actions },
            });
            if (submit) submit.disabled = false;
            if (resolveError) {
                if (errorElement) {
                    errorElement.textContent = resolveError.message || '対応を完了できませんでした。';
                    errorElement.classList.remove('hidden');
                }
                return;
            }
            await showAppAlert('報告への対応を完了しました。');
            window.location.hash = '#admin/reports';
        });
    } catch (error) {
        console.error('報告詳細の取得に失敗:', error);
        contentDiv.innerHTML = '<div class="admin-reports-container"><p class="error-message">報告詳細の取得に失敗しました。</p></div>';
    } finally {
        showLoading(false);
    }
}

export async function showAdminLogsScreen(showScreenFn = null) {
    renderHeader('アクセスログ');
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
                trigger.innerHTML = `<p class="error-message">${escapeHTML(error.message)}</p>`;
                hasMore = false;
                return;
            }

            if (data && data.length > 0) {
                data.forEach((log) => {
                    const logItem = document.createElement('div');
                    logItem.className = 'widget-item';
                    logItem.style.cssText = 'display: flex; flex-direction: column; gap: 0.25rem;';
                    logItem.innerHTML = `
                        <div><strong>SCID:</strong> ${escapeHTML(log.scratch_id)} (#${log.nyaitter_id})</div>
                        <div style="font-size: 0.9rem; color: var(--secondary-text-color);">${new Date(log.log_time).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</div>
                        <div style="font-size: 0.8rem; color: var(--secondary-text-color); font-family: monospace; word-break: break-all;">識別子: ${log.masked_ip_uuid}</div>
                    `;
                    contentDiv.insertBefore(logItem, trigger);
                });
                currentPage++;
            }

            if (!data || data.length < LOGS_PER_PAGE) {
                hasMore = false;
                trigger.innerHTML =
                    contentDiv.children.length > 1
                        ? 'すべてのログを読み込みました'
                        : 'ログはまだありません。';
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
    const actionText = newVerifyStatus ? '認証' : '認証の取り消し';

    if (await showAppConfirm(`本当にこのユーザーの${actionText}を行いますか?`)) {
        const { error } = await api
            .from('user')
            .update({ verify: newVerifyStatus })
            .eq('id', targetUser.id);
        if (error) {
            showAppAlert(`${actionText}に失敗しました: ${error.message}`);
        } else {
            await showAppAlert(`ユーザーの${actionText}が完了しました。\nページをリロードします。`);
            window.location.reload();
        }
    }
}

export async function adminSendNotice(targetUserId) {
    if (!(await showAppConfirm('このユーザーへ管理者からのお知らせ通知を送信しますか？'))) return;
    await sendNotification(targetUserId, 'admin_notice', { kind: 'route', value: '#notifications' });
    showAppAlert('通知を送信しました。');
}

export async function adminToggleShadow(targetUser) {
    const newShadowStatus = !targetUser.shadow;
    const actionText = newShadowStatus ? '有効' : '無効';

    if (await showAppConfirm(`本当にこのユーザーの検索除外を${actionText}にしますか?`)) {
        const { data, error } = await api.rpc('admin_set_status', {
            p_id: targetUser.id,
            p_shadow: newShadowStatus,
        });
        if (error) {
            showAppAlert(`${actionText}に失敗しました: ${error.message}`);
        } else {
            targetUser.shadow = data?.status?.shadow === undefined
                ? newShadowStatus
                : Boolean(data.status.shadow);
            await showAppAlert(`ユーザーの検索除外の${actionText}化が完了しました。\nページをリロードします。`);
            window.location.reload();
        }
    }
}

export async function adminFreezeAccount(targetUserId) {
    const reason = await showAppPrompt('アカウントの凍結理由を入力してください (必須):');
    if (reason && reason.trim()) {
        if (await showAppConfirm(`本当にこのユーザーを凍結しますか？\n理由: ${reason}`)) {
            const { error } = await api
                .from('user')
                .update({ freeze: reason.trim() })
                .eq('id', targetUserId);
            if (error) {
                showAppAlert(`凍結に失敗しました: ${error.message}`);
            } else {
                await showAppAlert('アカウントを凍結しました。\nページをリロードします。');
                window.location.reload();
            }
        }
    } else {
        showAppAlert('凍結理由の入力は必須です。');
    }
}

export async function adminUnfreezeAccount(targetUserId) {
    if (!(await showAppConfirm('このユーザーの凍結を解除しますか？'))) return;
    const { error } = await api
        .from('user')
        .update({ freeze: null })
        .eq('id', targetUserId);
    if (error) {
        showAppAlert(`凍結解除に失敗しました: ${error.message}`);
        return;
    }
    await showAppAlert('アカウントの凍結を解除しました。\nページをリロードします。');
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
    target.textContent = `${targetLabel} を報告します。`;
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
                errorElement.textContent = error.message || String(error) || '報告を送信できませんでした。';
                errorElement.classList.remove('hidden');
            }
            return;
        }
        closeReportModal();
        await showAppAlert('報告を送信しました。ご協力ありがとうございます。');
    };
}

export function closeReportModal() {
    const modal = document.getElementById('report-modal');
    modal?.classList.add('hidden');
}
