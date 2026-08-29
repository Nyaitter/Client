import { DOM } from '../dom.js';
import { api, apiRequest } from '../api.js';
import {
    getCurrentUser,
    setCurrentUser,
} from '../state.js';
import { cacheUser, invalidateTimelinePageCache, invalidateDmCaches } from './cache.js';
import { applyInterfaceTheme } from './theme.js';
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
        await showAppAlert('インポスターアカウントから直接ログアウトすることはできません。アカウント切替をご利用ください。');
        await openAccountSwitcherModal();
        return;
    }
    try {
        await apiRequest('/server/auth/logout', { method: 'POST' });
        setCurrentUser(null);
        applyInterfaceTheme();
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
        openAppealBtn.textContent = '異議申し立てを行う';
        openAppealBtn.classList.remove('hidden');
        return;
    }

    appealStatus.classList.remove('hidden');
    if (appeal.status === 'pending') {
        appealStatus.textContent = '現在、管理者が異議申し立てを確認しています。';
        openAppealBtn.classList.add('hidden');
        return;
    }
    if (appeal.status === 'approved') {
        appealStatus.textContent = '異議申し立てが承認されました。アカウントの状態を再確認してください。';
        openAppealBtn.classList.add('hidden');
        return;
    }
    if (appeal.status === 'rejected') {
        const note = appeal.resolution_note ? `` : '';
        appealStatus.textContent = `異議申し立ては却下されました${note}`;
        openAppealBtn.textContent = '再審査を申し立てる';
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
                throw new Error(error?.message || '異議申し立ての送信に失敗しました');
            }
            closeFreezeAppealModal();
            updateFreezeAppealStatus(data.appeal);
            await showAppAlert('異議申し立てを送信しました。管理者が確認するまでお待ちください。');
        } catch (err) {
            if (errorEl) {
                errorEl.textContent = err.message || '送信に失敗しました';
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
        <button type="button" class="account-switcher-add-btn">＋ アカウント追加</button>
        <ul class="account-switcher-list">
            <li class="account-switcher-empty"><div class="spinner" aria-label="アカウント一覧を読み込み中"></div></li>
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
        <button type="button" class="account-switcher-add-btn">＋ アカウント追加</button>
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
                            <span>${getEmoji(escapeHTML(acc.name || '不明なユーザー'))}</span>
                            <span style="color:var(--secondary-text-color); font-size:0.95em;">${formatNyaitterId(acc)}</span>
                            ${isAccImposter ? '<span class="settings-session-current">インポスター</span>' : ''}
                        </span>
                        ${acc.automatic_imposter || isAccImposter ? '' : '<button type="button" class="switcher-delete-btn" title="この端末からアカウントを解除">×</button>'}
                    </li>`;
                          })
                          .join('')
                    : '<li class="account-switcher-empty">アカウントがありません。</li>'
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
                        'この端末からアカウントを解除しますか？',
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
                        `アカウントの解除に失敗しました: ${removeError.message}`,
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
                                `アカウントの切替に失敗しました: ${switchError.message}`,
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

            closeModal();
            const releaseLoadingScreen = holdLoadingScreen();
            let switchError = null;
            try {
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
                        switchError = new Error('切替後のアカウント情報を確認できませんでした。');
                    } else {
                        await router();
                    }
                }
            } catch (error) {
                switchError = error instanceof Error
                    ? error
                    : new Error('アカウントの切替中に通信エラーが発生しました。');
            } finally {
                releaseLoadingScreen();
            }

            if (switchError) {
                await showAppAlert(
                    `アカウントの切替に失敗しました: ${switchError.message}`,
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
            await showAppAlert(error?.message || 'ログイン承認依頼を取得できませんでした。');
            return;
        }
        requestData = data.approval;
    }
    if (!requestData?.id) {
        await showAppAlert('ログイン承認依頼が無効です。');
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
        <h3 id="login-approval-modal-title">新しい端末からのログイン確認</h3>
        <p class="settings-help-text">以下の端末からログインの許可がリクエストされています。</p>
        <div class="login-approval-details">
            <p><strong>IPアドレス:</strong> ${escapeHTML(requestData.ip_masked || requestData.ip || '不明')}</p>
            <p><strong>端末情報:</strong> ${escapeHTML(requestData.user_agent || '不明')}</p>
            <p><strong>リクエスト日時:</strong> ${new Date(requestData.created_at).toLocaleString()}</p>
        </div>
        <div class="login-approval-actions">
            <button type="button" class="login-secondary-button login-approval-deny-btn">拒否</button>
            <button type="button" class="settings-primary-button login-approval-approve-btn">ログインを許可</button>
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
            await showAppAlert('処理に失敗しました。');
        } finally {
            showLoading(false);
        }
    };

    body.querySelector('.login-approval-deny-btn')?.addEventListener('click', () => decide('deny'));
    body.querySelector('.login-approval-approve-btn')?.addEventListener('click', () => decide('approve'));
    modal.classList.remove('hidden');
}

export async function checkSession({
    route = true,
    onSessionReady = null,
    refreshAccounts = true,
} = {}) {
    showLoading(true);
    try {
        const { data: sessionData, error: sessionError } = await api.auth.getSession();
        const session = sessionData?.session;

        if (sessionError || !session || !session.user) {
            setCurrentUser(null);
            DOM.loginBanner?.classList.remove('hidden');
            applyInterfaceTheme();
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

        if (userData.freeze) {
            if (DOM.freezeReason) {
                DOM.freezeReason.textContent = userData.freeze_reason || (typeof userData.freeze === 'string' ? userData.freeze : '利用規約違反のため');
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
        if (refreshAccounts) await refreshAccountList();
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
        if (typeof onSessionReady === 'function') {
            await onSessionReady(null);
        }
        if (route) await router();
        return null;
    }
}
