import { t } from './i18n.js';
import { DOM } from '../dom.js';
import { api, apiRequest } from '../api.js';
import {
    getCurrentUser,
    setCurrentUser,
    setRecommendedUsersCache,
} from '../state.js';
import { cacheUser, invalidateTimelinePageCache, invalidateDmCaches } from './cache.js';
import { applyInterfaceTheme } from './theme.js';
import { applyUserUiMode } from './uiMode.js';
import { router } from '../router.js';
import { subscribeToChanges, unsubscribeFromChanges } from './realtime.js';
import {
    showAppAlert,
    showAppConfirm,
    escapeHTML,
    getUserIconUrl,
    formatNyaitterId,
    holdLoadingScreen,
    showLoading,
} from '../utils/helpers.js';
import { getEmoji } from './format.js';

export const ACCOUNT_LIST_STORAGE_KEY = 'nyaitter_accounts';

let sessionCheckGeneration = 0;
let accountSwitchInFlight = null;

export function goToLoginPage() {
    if (typeof window.openNyaitterLoginModal === 'function') {
        window.openNyaitterLoginModal({ reset: true });
        return;
    }
    window.location.href = './index.html?login=1';
}

export function openLoginModal(options = {}) {
    if (typeof window.openNyaitterLoginModal === 'function') {
        window.openNyaitterLoginModal(options);
    } else {
        goToLoginPage();
    }
}

export async function handleLoginSuccess() {
    const modal = document.getElementById('login-modal');
    modal?.classList.add('hidden');
    invalidateTimelinePageCache();
    invalidateDmCaches();
    await checkSession({ route: true, refreshAccounts: true });
}

window.NyaitterOnLoginSuccess = handleLoginSuccess;
window.addEventListener('nyaitter:login-success', () => {
    void handleLoginSuccess();
});

export async function handleLogout(onLogoutComplete) {
    const currentUser = getCurrentUser();
    if (currentUser?.is_imposter || currentUser?.auth_provider === 'imposter' || currentUser?.settings?.imposter?.parent_id) {
        await showAppAlert(t('auth.imposter_logout_forbidden'));
        await openAccountSwitcherModal();
        return;
    }
    try {
        await apiRequest('/server/auth/logout', { method: 'POST' });
        setCurrentUser(null);
        applyInterfaceTheme();
        applyUserUiMode(null);
        invalidateTimelinePageCache();
        invalidateDmCaches();
        if (typeof onLogoutComplete === 'function') {
            await onLogoutComplete();
        }
        await checkSession({ route: true, refreshAccounts: true });
    } catch (error) {
        console.error('ログアウト処理エラー:', error);
        await checkSession({ route: true, refreshAccounts: true });
    }
}

export function ensureAccountListStorage() {
    const raw = localStorage.getItem(ACCOUNT_LIST_STORAGE_KEY);
    if (!raw) {
        localStorage.setItem(ACCOUNT_LIST_STORAGE_KEY, JSON.stringify([]));
    }
}

export function getAccountList() {
    ensureAccountListStorage();
    try {
        const raw = localStorage.getItem(ACCOUNT_LIST_STORAGE_KEY);
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
    } catch (_) {
        return [];
    }
}

export function setAccountList(accounts) {
    const valid = Array.isArray(accounts)
        ? accounts.filter((acc) => acc && Number.isInteger(Number(acc.id)))
        : [];
    localStorage.setItem(ACCOUNT_LIST_STORAGE_KEY, JSON.stringify(valid));
}

export async function refreshAccountList() {
    try {
        const { data, error } = await apiRequest('/server/auth/accounts');
        if (error || !Array.isArray(data?.accounts)) {
            return getAccountList();
        }

        const accounts = data.accounts.filter(
            (account) => account && Number.isInteger(Number(account.id)),
        );
        setAccountList(accounts);
        return accounts;
    } catch (_) {
        return getAccountList();
    }
}

export function addAccountToList(user) {
    if (!user || !Number.isInteger(Number(user.id))) return;
    const isImposter = Boolean(
        user.is_imposter ||
        user.auth_provider === 'imposter' ||
        user.account_provider === 'imposter' ||
        user.settings?.imposter?.parent_id
    );
    const list = getAccountList().filter(
        (acc) => Number(acc.id) !== Number(user.id),
    );
    list.unshift({
        id: Number(user.id),
        name: String(user.name || ''),
        icon_data: user.icon_data || null,
        nyaitter_id: user.nyaitter_id ?? Number(user.id),
        is_imposter: isImposter,
        auth_provider: user.auth_provider || null,
    });
    setAccountList(list);
}

export function removeAccountFromList(id) {
    const list = getAccountList().filter(
        (acc) => Number(acc.id) !== Number(id),
    );
    setAccountList(list);
}

export function updateAccountData(user, previousId = null) {
    if (!user || !Number.isInteger(Number(user.id))) return;
    const targetPreviousId = Number.isInteger(Number(previousId)) ? Number(previousId) : null;
    const list = getAccountList();
    const index = list.findIndex((acc) => (
        (targetPreviousId != null && Number(acc.id) === targetPreviousId)
        || Number(acc.id) === Number(user.id)
        || (user.scid && acc.scid === user.scid)
        || (user.uuid && acc.uuid === user.uuid)
    ));
    if (index !== -1) {
        const isImposter = Boolean(
            user.is_imposter ||
            user.auth_provider === 'imposter' ||
            user.account_provider === 'imposter' ||
            user.settings?.imposter?.parent_id ||
            list[index].is_imposter
        );
        list[index] = {
            ...list[index],
            id: Number(user.id),
            name: String(user.name || list[index].name),
            handle: user.handle || list[index].handle,
            icon_data: user.icon_data !== undefined ? user.icon_data : list[index].icon_data,
            nyaitter_id: user.nyaitter_id ?? list[index].nyaitter_id ?? Number(user.id),
            is_imposter: isImposter,
            auth_provider: user.auth_provider || list[index].auth_provider,
        };
        setAccountList(list);
    }
}

// Freeze appeal UI
export function updateFreezeAppealStatus(appeal) {
    const appealStatus = document.getElementById('freeze-appeal-status');
    const openAppealBtn = document.getElementById('open-freeze-appeal-btn');
    if (!appealStatus || !openAppealBtn) return;

    if (!appeal) {
        appealStatus.classList.add('hidden');
        appealStatus.textContent = '';
        openAppealBtn.textContent = t('auth.appeal_open');
        openAppealBtn.classList.remove('hidden');
        return;
    }

    appealStatus.classList.remove('hidden');
    if (appeal.status === 'pending') {
        appealStatus.textContent = t('auth.appeal_status_reviewing');
        openAppealBtn.classList.add('hidden');
        return;
    }
    if (appeal.status === 'approved') {
        appealStatus.textContent = t('auth.appeal_status_approved');
        openAppealBtn.classList.add('hidden');
        return;
    }
    if (appeal.status === 'rejected') {
        const note = appeal.resolution_note ? `` : '';
        appealStatus.textContent = t('auth.appeal_status_rejected', { note });
        openAppealBtn.textContent = t('auth.appeal_reopen');
        openAppealBtn.classList.remove('hidden');
    }
}

export async function refreshFreezeAppealStatus() {
    try {
        const { data } = await apiRequest('/server/auth/freeze/appeal/status');
        updateFreezeAppealStatus(data?.appeal || null);
    } catch (_) {}
}

export function closeFreezeAppealModal() {
    const modal = document.getElementById('freeze-appeal-modal');
    modal?.classList.add('hidden');
}

let freezeAppealInitialized = false;
export function setupFreezeAppealUi() {
    if (freezeAppealInitialized) return;
    freezeAppealInitialized = true;

    const modal = document.getElementById('freeze-appeal-modal');
    const openBtn = document.getElementById('open-freeze-appeal-btn');
    const form = document.getElementById('freeze-appeal-form');
    const textarea = document.getElementById('freeze-appeal-description');
    const errorEl = document.getElementById('freeze-appeal-error');

    openBtn?.addEventListener('click', () => {
        if (errorEl) {
            errorEl.classList.add('hidden');
            errorEl.textContent = '';
        }
        if (textarea) textarea.value = '';
        modal?.classList.remove('hidden');
        textarea?.focus();
    });

    document.querySelectorAll('[data-action="close-freeze-appeal"]').forEach((btn) => {
        btn.addEventListener('click', closeFreezeAppealModal);
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const description = (textarea?.value || '').trim();
        if (!description) return;

        if (errorEl) errorEl.classList.add('hidden');
        try {
            const { data, error } = await apiRequest('/server/auth/freeze/appeal', {
                method: 'POST',
                body: { description },
            });
            if (error || !data) {
                throw new Error(error?.message || t('auth.appeal_send_failed'));
            }
            closeFreezeAppealModal();
            updateFreezeAppealStatus(data.appeal);
            await showAppAlert(t('auth.appeal_sent'));
        } catch (err) {
            if (errorEl) {
                errorEl.textContent = err.message || t('auth.send_failed');
                errorEl.classList.remove('hidden');
            }
        }
    });
}

export async function openAccountSwitcherModal() {
    const modal = document.getElementById('account-switcher-modal');
    const content = document.getElementById('account-switcher-modal-content');
    if (!modal || !content) return;

    const closeModal = () => modal.classList.add('hidden');
    const openLoginFromSwitcher = () => {
        closeModal();
        goToLoginPage();
    };

    modal.classList.remove('hidden');
    modal.querySelector('.modal-close-btn').onclick = closeModal;
    modal.onclick = (event) => {
        if (event.target === modal) closeModal();
    };
    content.innerHTML = `
        <button type="button" class="account-switcher-add-btn nui-button">${t('auth.account_add')}</button>
        <ul class="account-switcher-list">
            <li class="account-switcher-empty"><div class="spinner" aria-label="${t('auth.accounts_loading_label')}"></div></li>
        </ul>
    `;
    content.querySelector('.account-switcher-add-btn').onclick = openLoginFromSwitcher;

    let accounts = getAccountList();
    if (accounts.length === 0) {
        accounts = await refreshAccountList();
        if (modal.classList.contains('hidden')) return;
    }
    const current = getCurrentUser();
    const currentId = current ? Number(current.id) : null;
    const isCurrentImposter = Boolean(
        current?.is_imposter ||
        current?.auth_provider === 'imposter' ||
        current?.account_provider === 'imposter' ||
        current?.settings?.imposter?.parent_id
    );

    content.innerHTML = `
        <button type="button" class="account-switcher-add-btn nui-button">${t('auth.account_add')}</button>
        <ul class="account-switcher-list">
            ${
                accounts.length > 0
                    ? accounts
                          .map((acc) => {
                              const isThisAccCurrent = Number(acc.id) === currentId;
                              const isAccImposter = Boolean(
                                  acc.is_imposter ||
                                  acc.auth_provider === 'imposter' ||
                                  acc.account_provider === 'imposter' ||
                                  acc.settings?.imposter?.parent_id ||
                                  (isThisAccCurrent && isCurrentImposter)
                              );
                              return `
                    <li class="account-switcher-item${isThisAccCurrent ? ' active' : ''}" data-id="${escapeHTML(String(acc.id))}" data-automatic-imposter="${acc.automatic_imposter ? 'true' : 'false'}" data-imposter="${isAccImposter ? 'true' : 'false'}">
                        <span class="switcher-user-info">
                            <img class="switcher-user-icon" src="${escapeHTML(getUserIconUrl(acc))}" alt="${escapeHTML(acc.name || '')}">
                            <span>${getEmoji(escapeHTML(acc.name || t('composer.account_unknown')))}</span>
                            <span style="color:var(--secondary-text-color); font-size:0.95em;">${formatNyaitterId(acc)}</span>
                            ${isAccImposter ? `<span class="settings-session-current">${t('post.imposter_badge')}</span>` : ''}
                        </span>
                        ${acc.automatic_imposter || isAccImposter ? '' : `<button type="button" class="switcher-delete-btn" title="${t('auth.account_remove_title')}">×</button>`}
                    </li>`;
                          })
                          .join('')
                    : `<li class="account-switcher-empty">${t('auth.accounts_none')}</li>`
            }
        </ul>
    `;

    content.querySelector('.account-switcher-add-btn').onclick = openLoginFromSwitcher;

    content.querySelectorAll('.account-switcher-item').forEach((item) => {
        const userId = Number(item.dataset.id);
        const automaticImposter = item.dataset.automaticImposter === 'true';
        const isImposter = item.dataset.imposter === 'true';
        item.onclick = async (event) => {
            if (!isImposter && event.target.closest('.switcher-delete-btn')) {
                if (
                    !(await showAppConfirm(
                        t('auth.account_remove_confirm'),
                    ))
                )
                    return;
                const { data: removeResult, error: removeError } =
                    await apiRequest(
                        `/server/auth/accounts/${encodeURIComponent(userId)}`,
                        { method: 'DELETE' },
                    );
                if (removeError) {
                    await showAppAlert(
                        t('auth.account_remove_failed', { message: removeError.message }),
                    );
                    return;
                }
                removeAccountFromList(userId);
                if (removeResult?.active_removed) {
                    // 現在使用中のアカウントが解除された。
                    // 残っているアカウントがある場合は一覧の先頭のアカウントへ
                    // 自動で切り替え、モーダルを再読み込みして最新の一覧を表示する。
                    setCurrentUser(null);
                    unsubscribeFromChanges();
                    const remainingAccounts = await refreshAccountList();
                    if (remainingAccounts.length > 0) {
                        const nextAccount = remainingAccounts[0];
                        const { error: switchError } = await apiRequest(
                            '/server/auth/accounts/switch',
                            {
                                method: 'POST',
                                body: { user_id: Number(nextAccount.id) },
                            },
                        );
                        if (switchError) {
                            await showAppAlert(
                                t('auth.account_switch_failed', { message: switchError.message }),
                            );
                        }
                    }
                    await checkSession();
                }
                await openAccountSwitcherModal();
                return;
            }
            if (userId === currentId) {
                closeModal();
                return;
            }

            if (accountSwitchInFlight) return;
            accountSwitchInFlight = true;
            closeModal();
            const releaseLoadingScreen = holdLoadingScreen();
            let switchError = null;
            try {
                // 切り替え開始前の遅いセッション確認が結果を上書きしないようにする。
                sessionCheckGeneration += 1;
                const result = await apiRequest(
                    automaticImposter
                        ? `/server/auth/imposters/${encodeURIComponent(userId)}/switch`
                        : '/server/auth/accounts/switch',
                    automaticImposter
                        ? { method: 'POST', body: {} }
                        : { method: 'POST', body: { user_id: userId } },
                );
                switchError = result.error;
                if (!switchError) {
                    unsubscribeFromChanges();
                    const switchedUser = await checkSession({
                        route: false,
                        refreshAccounts: false,
                    });
                    if (!switchedUser) {
                        switchError = new Error(t('auth.account_switch_verify_failed'));
                    } else {
                        setRecommendedUsersCache(null);
                        invalidateTimelinePageCache();
                        invalidateDmCaches();
                        await router();
                    }
                }
            } catch (error) {
                switchError = error instanceof Error
                    ? error
                    : new Error(t('auth.account_switch_network_error'));
            } finally {
                accountSwitchInFlight = null;
                releaseLoadingScreen();
            }

            if (switchError) {
                await showAppAlert(
                    t('auth.account_switch_failed', { message: switchError.message }),
                );
            }
        };
    });
}

export async function openLoginApprovalModal(approvalRequest) {
    const modal = document.getElementById('login-approval-modal');
    const body = document.getElementById('login-approval-modal-body');
    if (!modal || !body) return;

    let requestData = approvalRequest;
    if (typeof approvalRequest === 'string') {
        const approvalId = approvalRequest.trim();
        if (!approvalId) return;
        const { data, error } = await apiRequest(
            `/server/auth/login-approvals/${encodeURIComponent(approvalId)}`,
        );
        if (error || !data?.approval) {
            await showAppAlert(error?.message || t('auth.approval_fetch_failed'));
            return;
        }
        requestData = data.approval;
    }
    if (!requestData?.id) {
        await showAppAlert(t('auth.approval_invalid'));
        return;
    }

    const closeModal = () => {
        modal.classList.add('hidden');
        if (window.location.hash.startsWith('#login-approval/')) {
            window.history.replaceState(window.history.state, '', '#notifications');
        }
    };
    modal.querySelector('.modal-close-btn').onclick = closeModal;
    modal.onclick = (event) => {
        if (event.target === modal) closeModal();
    };

    body.innerHTML = `
        <h3 id="login-approval-modal-title" class="nui-modal-title">${t('auth.approval_title')}</h3>
        <p class="settings-help-text nui-help-text">${t('auth.approval_desc')}</p>
        <div class="login-approval-details">
            <p><strong>${t('auth.ip_address_label')}</strong> ${escapeHTML(requestData.ip_masked || requestData.ip || t('dm.unknown_name'))}</p>
            <p><strong>${t('auth.device_info_label')}</strong> ${escapeHTML(requestData.user_agent || t('dm.unknown_name'))}</p>
            <p><strong>${t('auth.request_date_label')}</strong> ${new Date(requestData.created_at).toLocaleString()}</p>
        </div>
        <div class="login-approval-actions">
            <button type="button" class="login-secondary-button login-approval-deny-btn nui-button-secondary">${t('auth.deny_button')}</button>
            <button type="button" class="settings-primary-button login-approval-approve-btn nui-button">${t('auth.approve_login_button')}</button>
        </div>
    `;

    const decide = async (action) => {
        showLoading(true);
        try {
            const { error } = await apiRequest(
                `/server/auth/login-approvals/${encodeURIComponent(requestData.id)}/decision`,
                {
                    method: 'POST',
                    body: { decision: action },
                },
            );
            if (error) throw error;
            closeModal();
        } catch (error) {
            console.error('ログイン許可の送信に失敗:', error);
            await showAppAlert(t('auth.process_failed'));
        } finally {
            showLoading(false);
        }
    };

    body.querySelector('.login-approval-deny-btn')?.addEventListener('click', () => decide('deny'));
    body.querySelector('.login-approval-approve-btn')?.addEventListener('click', () => decide('approve'));
    modal.classList.remove('hidden');
}

function accountRecoveryStatusLabel(status) {
    switch (status) {
        case 'waiting': return t('auth.status_waiting');
        case 'approved': return t('auth.status_approved');
        case 'blocked': return t('auth.status_blocked');
        case 'consumed': return t('auth.status_consumed');
        default: return t('dm.unknown_name');
    }
}

export async function openAccountRecoveryModal(recoveryRequest) {
    const modal = document.getElementById('account-recovery-modal');
    const body = document.getElementById('account-recovery-modal-body');
    if (!modal || !body) return;

    let requestData = recoveryRequest;
    if (typeof recoveryRequest === 'string') {
        const recoveryId = recoveryRequest.trim();
        if (!recoveryId) return;
        const { data, error } = await apiRequest(
            `/server/auth/account-recovery/${encodeURIComponent(recoveryId)}`,
        );
        if (error || !data?.recovery) {
            await showAppAlert(error?.message || t('auth.recovery_fetch_failed'));
            return;
        }
        requestData = data.recovery;
    }
    if (!requestData?.id) {
        await showAppAlert(t('auth.recovery_invalid'));
        return;
    }

    const closeModal = () => {
        modal.classList.add('hidden');
        if (window.location.hash.startsWith('#account-recovery/')) {
            window.history.replaceState(window.history.state, '', '#notifications');
        }
    };
    modal.querySelector('.modal-close-btn').onclick = closeModal;
    modal.onclick = (event) => {
        if (event.target === modal) closeModal();
    };

    const providerName =
        requestData.auth_provider_display_name ||
        requestData.auth_provider ||
        t('auth.unknown_provider');
    const status = String(requestData.status || '');
    const pending = status === 'waiting';
    const isCurrentIp = requestData.is_your_current_ip === true;
    const formatDate = value => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? t('dm.unknown_name') : date.toLocaleString();
    };

    body.innerHTML = `
        <h3 id="account-recovery-modal-title" class="nui-modal-title">${t('auth.recovery_title')}</h3>
        <p class="settings-help-text nui-help-text">${t('auth.recovery_desc')}</p>
        <dl class="account-recovery-facts">
            <div><dt>${t('auth.recovery_source_label')}</dt><dd>${escapeHTML(requestData.ip_masked || t('dm.unknown_name'))}</dd></div>
            <div><dt>${t('auth.recovery_device_label')}</dt><dd>${escapeHTML(requestData.user_agent || t('dm.unknown_name'))}</dd></div>
            <div><dt>${t('auth.recovery_method_label')}</dt><dd>${escapeHTML(providerName)}</dd></div>
            <div><dt>${t('auth.recovery_date_label')}</dt><dd>${escapeHTML(formatDate(requestData.started_at))}</dd></div>
            ${pending ? `<div><dt>${t('auth.recovery_wait_end_label')}</dt><dd>${escapeHTML(formatDate(requestData.wait_until))}</dd></div>` : ''}
        </dl>
        ${isCurrentIp ? `<p class="account-recovery-warning" role="alert">${t('auth.recovery_current_ip_warning')}</p>` : ''}
        ${pending ? `
            <p class="settings-help-text nui-help-text">${t('auth.recovery_choose_hint')}</p>
            <div class="login-approval-actions">
                <button type="button" class="login-secondary-button account-recovery-block-btn nui-button-secondary">${t('profile.block')}</button>
                <button type="button" class="settings-primary-button account-recovery-approve-btn nui-button">${t('group.approve')}</button>
            </div>
            <details class="account-recovery-more">
                <summary>${t('auth.recovery_block_summary')}</summary>
                <p>${t('auth.recovery_block_explain')}</p>
            </details>
        ` : `<p class="settings-help-text nui-help-text">${t('auth.recovery_already_processed', { status: escapeHTML(accountRecoveryStatusLabel(status)) })}</p>`}
    `;

    const decide = async (action) => {
        if (action === 'block') {
            const confirmed = await showAppConfirm(
                isCurrentIp
                    ? t('auth.recovery_block_confirm_current')
                    : t('auth.recovery_block_confirm'),
            );
            if (!confirmed) return;
        }
        showLoading(true);
        try {
            const { data, error } = await apiRequest(
                `/server/auth/account-recovery/${encodeURIComponent(requestData.id)}/decision`,
                { method: 'POST', body: { decision: action } },
            );
            if (error) throw error;
            closeModal();
            if (action === 'approve') {
                await showAppAlert(t('auth.recovery_approved'));
            } else if (data?.current_ip_blocked) {
                await showAppAlert(t('auth.recovery_blocked_current'));
            } else {
                await showAppAlert(t('auth.recovery_blocked'));
            }
        } catch (error) {
            console.error('復旧依頼の処理に失敗:', error);
            await showAppAlert(t('auth.process_failed'));
        } finally {
            showLoading(false);
        }
    };

    body.querySelector('.account-recovery-block-btn')?.addEventListener('click', () => decide('block'));
    body.querySelector('.account-recovery-approve-btn')?.addEventListener('click', () => decide('approve'));
    modal.classList.remove('hidden');
}

export async function checkSession({
    route = true,
    onSessionReady = null,
    refreshAccounts = true,
} = {}) {
    const generation = ++sessionCheckGeneration;
    showLoading(true);
    try {
        const { data: sessionData, error: sessionError } = await api.auth.getSession();
        if (generation !== sessionCheckGeneration) return getCurrentUser();
        const session = sessionData?.session;

        if (sessionError || !session || !session.user) {
            setCurrentUser(null);
            DOM.loginBanner?.classList.remove('hidden');
            applyInterfaceTheme();
            // 未ログイン時はユーザー設定を解除し、サーバー既定へフォールバックする。
            applyUserUiMode(null);
            unsubscribeFromChanges();
            if (typeof onSessionReady === 'function') {
                await onSessionReady(null);
            }
            if (route) await router();
            return null;
        }

        const userData = session.user;

        setCurrentUser(userData);
        cacheUser(userData);
        // セッション確定ユーザーの表示UI設定を反映する（テーマ反映と対称）。
        applyUserUiMode(userData.settings?.ui_mode ?? null);

        if (userData.freeze) {
            if (DOM.freezeReason) {
                DOM.freezeReason.textContent = userData.freeze_reason || (typeof userData.freeze === 'string' ? userData.freeze : t('auth.freeze_reason_default'));
            }
            DOM.freezeOverlay?.classList.remove('hidden');
            setupFreezeAppealUi();
            await refreshFreezeAppealStatus();
            showLoading(false);
            return null;
        } else {
            DOM.freezeOverlay?.classList.add('hidden');
        }

        DOM.loginBanner?.classList.add('hidden');
        addAccountToList(userData);
        if (refreshAccounts) void refreshAccountList();
        applyInterfaceTheme();
        subscribeToChanges();

        if (typeof onSessionReady === 'function') {
            await onSessionReady(userData);
        }
        if (route) await router();
        return userData;
    } catch (error) {
        console.error('Session check failed:', error);
        setCurrentUser(null);
        DOM.loginBanner?.classList.remove('hidden');
        applyInterfaceTheme();
        // セッション確認に失敗した場合は未ログイン扱いにし、サーバー既定へ戻す。
        applyUserUiMode(null);
        if (typeof onSessionReady === 'function') {
            await onSessionReady(null);
        }
        if (route) await router();
        return null;
    }
}
