import { DOM } from '../dom.js';
import { api, apiRequest } from '../api.js';
import {
    getCurrentUser,
    setCurrentUser,
} from '../state.js';
import { cacheUser } from './cache.js';
import { applyInterfaceTheme } from './theme.js';
import { router } from '../router.js';
import { subscribeToChanges, unsubscribeFromChanges } from './realtime.js';
import {
    showAppAlert,
    showAppConfirm,
    escapeHTML,
    getUserIconUrl,
    formatNyaitterId,
    showLoading,
} from '../utils/helpers.js';
import { getEmoji } from './format.js';

export const ACCOUNT_LIST_STORAGE_KEY = 'nyaitter_accounts';

export function goToLoginPage() {
    if (typeof window.openNyaitterLoginModal === 'function') {
        window.openNyaitterLoginModal({ reset: false });
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

export async function handleLogout(onLogoutComplete) {
    try {
        await apiRequest('/server/auth/logout', { method: 'POST' });
        setCurrentUser(null);
        applyInterfaceTheme();
        if (typeof onLogoutComplete === 'function') {
            await onLogoutComplete();
        }
        window.location.reload();
    } catch (error) {
        console.error('ログアウト処理エラー:', error);
        window.location.reload();
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

export function addAccountToList(user) {
    if (!user || !Number.isInteger(Number(user.id))) return;
    const list = getAccountList().filter(
        (acc) => Number(acc.id) !== Number(user.id),
    );
    list.unshift({
        id: Number(user.id),
        name: String(user.name || ''),
        icon_data: user.icon_data || null,
        nyaitter_id: user.nyaitter_id ?? Number(user.id),
    });
    setAccountList(list);
}

export function removeAccountFromList(id) {
    const list = getAccountList().filter(
        (acc) => Number(acc.id) !== Number(id),
    );
    setAccountList(list);
}

export function updateAccountData(user) {
    if (!user || !Number.isInteger(Number(user.id))) return;
    const list = getAccountList();
    const index = list.findIndex((acc) => Number(acc.id) === Number(user.id));
    if (index !== -1) {
        list[index] = {
            ...list[index],
            name: String(user.name || list[index].name),
            icon_data: user.icon_data !== undefined ? user.icon_data : list[index].icon_data,
            nyaitter_id: user.nyaitter_id ?? list[index].nyaitter_id ?? Number(user.id),
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
        const note = appeal.resolution_note ? `（回答: ${appeal.resolution_note}）` : '';
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

    const { data: accountPayload, error } = await apiRequest(
        '/server/auth/accounts',
    );
    const accounts = error
        ? getAccountList()
        : Array.isArray(accountPayload?.accounts)
          ? accountPayload.accounts
          : [];
    if (!error) {
        setAccountList(
            accounts
                .filter((account) => !account.automatic_imposter)
                .map(({ id, name, icon_data, scid, nyaitter_id, is_imposter }) => ({
                    id: Number(id),
                    name: String(name || ''),
                    icon_data: icon_data || null,
                    scid: scid || null,
                    nyaitter_id: nyaitter_id ?? Number(id),
                    is_imposter: Boolean(is_imposter),
                })),
        );
    }
    const current = getCurrentUser();
    const currentId = current ? Number(current.id) : null;

    content.innerHTML = `
        <button type="button" class="account-switcher-add-btn">＋ アカウント追加</button>
        <ul class="account-switcher-list">
            ${
                accounts.length > 0
                    ? accounts
                          .map(
                              (acc) => `
                    <li class="account-switcher-item${Number(acc.id) === currentId ? ' active' : ''}" data-id="${escapeHTML(String(acc.id))}" data-automatic-imposter="${acc.automatic_imposter ? 'true' : 'false'}">
                        <span class="switcher-user-info">
                            <img class="switcher-user-icon" src="${escapeHTML(getUserIconUrl(acc))}" alt="${escapeHTML(acc.name || '')}">
                            <span>${getEmoji(escapeHTML(acc.name || '不明なユーザー'))}</span>
                            <span style="color:var(--secondary-text-color); font-size:0.95em;">${formatNyaitterId(acc)}</span>
                            ${acc.is_imposter ? '<span class="settings-session-current">インポスター</span>' : ''}
                        </span>
                        ${acc.automatic_imposter ? '' : '<button type="button" class="switcher-delete-btn" title="この端末からアカウントを解除">×</button>'}
                    </li>`,
                          )
                          .join('')
                    : '<li class="account-switcher-empty">アカウントがありません。</li>'
            }
        </ul>
    `;

    modal.classList.remove('hidden');
    modal.querySelector('.modal-close-btn').onclick = closeModal;
    modal.onclick = (event) => {
        if (event.target === modal) closeModal();
    };
    content.querySelector('.account-switcher-add-btn').onclick = () => {
        closeModal();
        goToLoginPage();
    };

    content.querySelectorAll('.account-switcher-item').forEach((item) => {
        const userId = Number(item.dataset.id);
        const automaticImposter = item.dataset.automaticImposter === 'true';
        item.onclick = async (event) => {
            if (event.target.closest('.switcher-delete-btn')) {
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
                    // 残っているアカウントがある場合は一覧の先頭（1番上）のアカウントへ
                    // 自動で切り替え、モーダルを再読み込みして最新の一覧を表示する。
                    setCurrentUser(null);
                    unsubscribeFromChanges();
                    window.location.hash = '#';
                    const {
                        data: remainingPayload,
                        error: remainingError,
                    } = await apiRequest('/server/auth/accounts');
                    const remainingAccounts =
                        !remainingError &&
                        Array.isArray(remainingPayload?.accounts)
                            ? remainingPayload.accounts
                            : getAccountList();
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
            if (userId === currentId) return;

            const { error: switchError } = await apiRequest(
                automaticImposter
                    ? `/server/auth/imposters/${encodeURIComponent(userId)}/switch`
                    : '/server/auth/accounts/switch',
                automaticImposter
                    ? { method: 'POST', body: {} }
                    : { method: 'POST', body: { user_id: userId } },
            );
            if (switchError) {
                await showAppAlert(
                    `アカウントの切替に失敗しました: ${switchError.message}`,
                );
                return;
            }
            closeModal();
            setCurrentUser(null);
            unsubscribeFromChanges();
            window.location.hash = '#';
            await checkSession();
        };
    });
}

export async function openLoginApprovalModal(requestData) {
    const modal = document.getElementById('login-approval-modal');
    const body = document.getElementById('login-approval-modal-body');
    if (!modal || !body) return;

    body.innerHTML = `
        <h3 id="login-approval-modal-title">新しい端末からのログイン確認</h3>
        <p class="settings-help-text">以下の端末からログインの許可がリクエストされています。</p>
        <div class="login-approval-details">
            <p><strong>IPアドレス:</strong> ${escapeHTML(requestData.ip || '不明')}</p>
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
            await apiRequest('/server/auth/login-approval/decide', {
                method: 'POST',
                body: { request_id: requestData.id, action },
            });
            modal.classList.add('hidden');
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

export async function checkSession({ route = true, onSessionReady = null } = {}) {
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

        const authUserId = session.user.id;
        let userData = session.user;
        try {
            const { data: fullUser, error: userError } = await api
                .from('user')
                .select('*')
                .eq('uuid', authUserId)
                .single();
            if (fullUser && !userError) {
                userData = fullUser;
            }
        } catch (_) {}

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
