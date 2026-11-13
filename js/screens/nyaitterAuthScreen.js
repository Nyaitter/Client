import { t } from '../modules/i18n.js';
import { DOM } from '../dom.js';
import { ICONS } from '../icons.js';
import { getCurrentUser } from '../state.js';
import { refreshAccountList, checkSession } from '../modules/auth.js';
import { apiRequest } from '../api.js';
import { escapeHTML, showLoading, getSafeHttpUrl, getUserIconUrl, formatNyaitterId } from '../utils/helpers.js';
import { showScreenCompat } from '../screenManager.js';

// 認証サーバーから返る遷移先をそのまま location に入れない。
// javascript: や資格情報付き URL を弾き、http(s) だけを許可する。
function getSafeRedirectUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const url = new URL(raw, window.location.origin);
        if (!['http:', 'https:'].includes(url.protocol)) return '';
        if (url.username || url.password) return '';
        return url.href;
    } catch (_) {
        return '';
    }
}

function getRequestIdFromLocation() {
    // Check search params in window.location.href or hash
    const fullUrl = new URL(window.location.href);
    let reqId = fullUrl.searchParams.get('request_id');
    if (reqId) return reqId;

    const hash = window.location.hash || '';
    const hashIndex = hash.indexOf('?');
    if (hashIndex !== -1) {
        const hashParams = new URLSearchParams(hash.substring(hashIndex + 1));
        reqId = hashParams.get('request_id');
        if (reqId) return reqId;
    }

    const slashMatch = hash.match(/^#nyaitter-auth\/([A-Za-z0-9_-]+)/);
    if (slashMatch) return slashMatch[1];

    return null;
}

export async function showNyaitterAuthScreen(showScreenFn) {
    DOM.pageHeader.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.8rem;">
            <h2 style="margin: 0; font-size: 1.25rem;">${t('nyauth.title')}</h2>
        </div>
    `;

    showScreenCompat('nyaitter-auth-screen', showScreenFn);

    const contentDiv = document.getElementById('nyaitter-auth-content') || DOM.mainContent;
    if (!contentDiv) return;

    contentDiv.innerHTML = '<div class="spinner" style="margin: 3rem auto;"></div>';
    showLoading(true);

    const requestId = getRequestIdFromLocation();
    if (!requestId) {
        showLoading(false);
        contentDiv.innerHTML = `
            <div class="nyauth-container nui-page" data-nui="page">
                <div class="nyauth-card nyauth-error-card nui-card nui-danger-card" data-nui="card">
                    <h3>${t('nyauth.invalid_request')}</h3>
                    <p class="settings-help-text nui-help-text">${t('nyauth.missing_request_id')}</p>
                    <a href="#" class="settings-primary-button nui-button" style="display:inline-block; margin-top:1rem; text-decoration:none;">${t('nyauth.back_home')}</a>
                </div>
            </div>
        `;
        return;
    }

    try {
        const response = await globalThis.NyaitterClientInstance.nyaitterAuth.getRequestResponse(requestId);
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success || !data.request) {
            throw new Error(data.error || t('nyauth.request_not_found'));
        }

        const authReq = data.request;
        const currentUser = getCurrentUser();
        const accounts = await refreshAccountList();

        // If user is not logged in, prompt for login
        if (!currentUser) {
            showLoading(false);
            contentDiv.innerHTML = `
                <div class="nyauth-container nui-page" data-nui="page">
                    <div class="nyauth-card nui-card" data-nui="card">
                        <div class="nyauth-app-header">
                            ${authReq.icon_url ? `<img src="${escapeHTML(getSafeHttpUrl(authReq.icon_url))}" class="nyauth-app-icon" alt="${escapeHTML(authReq.name)}">` : `<div class="nyauth-app-icon-placeholder">${ICONS.apps || '📱'}</div>`}
                            <div>
                                <h3 class="nyauth-app-title">${escapeHTML(authReq.name)}</h3>
                            </div>
                        </div>
                        <div class="nyauth-login-notice" style="margin: 1.5rem 0; padding: 1rem; background: color-mix(in srgb, var(--primary-color) 10%, transparent); border-radius: 8px;">
                            <p style="margin: 0 0 0.75rem 0;">${t('nyauth.login_to_connect')}</p>
                            <button type="button" id="nyauth-login-btn" class="settings-primary-button nui-button" style="width: 100%;">${t('nyauth.login_button')}</button>
                        </div>
                    </div>
                </div>
            `;
            document.getElementById('nyauth-login-btn')?.addEventListener('click', () => {
                if (typeof window.openNyaitterLoginModal === 'function') {
                    window.openNyaitterLoginModal();
                }
            });
            return;
        }

        if (accounts.length === 1 && authReq.can_pass_through) {
            const autoPassRes = await apiRequest('/server/auth/nyaitter-auth/auto-pass', {
                method: 'POST',
                body: { request_id: requestId },
            });
            const safeRedirect = getSafeRedirectUrl(autoPassRes.data?.redirect_uri);
            if (!autoPassRes.error && autoPassRes.data?.success && safeRedirect) {
                window.location.href = safeRedirect;
                return;
            }
        }

        // User is logged in: Render permission selection form & Account Selector
        const scopes = Array.isArray(authReq.scopes) ? authReq.scopes : [];
        const existingScopesSet = new Set(Array.isArray(authReq.existing_scopes) ? authReq.existing_scopes : []);
        const alreadyAuthorized = Boolean(authReq.already_authorized);

        let scopesHtml = scopes.map((s) => {
            const isRequired = Boolean(s.required);
            const isChecked = isRequired || (alreadyAuthorized ? existingScopesSet.has(s.scope) : true);
            const isContinuous = s.scope === 'continuous_access' || s.scope === 'offline_access';

            return `
                <label class="nyauth-scope-item ${isContinuous ? 'is-continuous' : ''}">
                    <input type="checkbox" name="nyauth_scope" value="${escapeHTML(s.scope)}" ${isChecked ? 'checked' : ''} ${isRequired ? 'disabled data-required="true"' : ''}>
                    <div class="nyauth-scope-info">
                        <div class="nyauth-scope-name">
                            <strong>${escapeHTML(s.name || s.scope)}</strong>
                            ${isRequired ? `<span class="nyauth-badge-required nui-badge nui-badge-danger">${t('nyauth.badge_required')}</span>` : ''}
                            ${isContinuous ? `<span class="nyauth-badge-continuous nui-badge">${t('nyauth.badge_continuous')}</span>` : ''}
                        </div>
                        ${s.description ? `<p class="nyauth-scope-desc">${escapeHTML(s.description)}</p>` : ''}
                    </div>
                </label>
            `;
        }).join('');

        // Build account selection section
        const hasMultipleAccounts = accounts.length > 1;
        let accountSectionHtml = '';
        if (hasMultipleAccounts) {
            accountSectionHtml = `
                <div class="nyauth-account-section">
                    <div class="nyauth-account-section-header">
                        <label class="settings-help-text nui-help-text" style="font-weight: 600; color: var(--text-color);">${t('nyauth.select_account')}</label>
                        <button type="button" id="nyauth-add-account-btn" class="settings-bot-secondary-button nui-button-secondary" style="font-size: 0.8rem; padding: 0.2rem 0.5rem;">${t('nyauth.add_account')}</button>
                    </div>
                    <div class="nyauth-account-list">
                        ${accounts.map((acc) => {
                            const isSelected = Number(acc.id) === Number(currentUser.id);
                            return `
                                <div class="nyauth-account-option ${isSelected ? 'selected' : ''}" data-account-id="${escapeHTML(String(acc.id))}" data-imposter="${acc.is_imposter ? 'true' : 'false'}">
                                    <img src="${escapeHTML(getUserIconUrl(acc))}" class="nyauth-account-avatar" alt="${escapeHTML(acc.name || '')}">
                                    <div class="nyauth-account-details">
                                        <div class="nyauth-account-name">
                                            <strong>${escapeHTML(acc.name || t('composer.account_unknown'))}</strong>
                                            ${acc.is_imposter ? `<span class="settings-session-current nui-badge" style="font-size:0.7rem; padding: 0.1rem 0.3rem;">${t('post.imposter_badge')}</span>` : ''}
                                        </div>
                                        <span class="nyauth-account-id">${formatNyaitterId(acc)}</span>
                                    </div>
                                    <div class="nyauth-account-radio">
                                        <input type="radio" name="nyauth_selected_account" value="${escapeHTML(String(acc.id))}" ${isSelected ? 'checked' : ''}>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        } else {
            accountSectionHtml = `
                <div class="nyauth-account-section">
                    <div class="nyauth-account-section-header">
                        <span class="settings-help-text nui-help-text" style="font-weight: 600; color: var(--text-color);">${t('nyauth.select_account')}</span>
                        <button type="button" id="nyauth-add-account-btn" class="settings-bot-secondary-button nui-button-secondary" style="font-size: 0.8rem; padding: 0.2rem 0.5rem;">${t('nyauth.add_account')}</button>
                    </div>
                    <div class="nyauth-account-option selected" style="cursor: default;">
                        <img src="${escapeHTML(getUserIconUrl(currentUser))}" class="nyauth-account-avatar" alt="${escapeHTML(currentUser.name || '')}">
                        <div class="nyauth-account-details">
                            <div class="nyauth-account-name">
                                <strong>${escapeHTML(currentUser.name || t('composer.account_unknown'))}</strong>
                            </div>
                            <span class="nyauth-account-id">${formatNyaitterId(currentUser)}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        contentDiv.innerHTML = `
            <div class="nyauth-container nui-page" data-nui="page">
                <div class="nyauth-card nui-card" data-nui="card">
                    <div class="nyauth-app-header">
                        ${authReq.icon_url ? `<img src="${escapeHTML(getSafeHttpUrl(authReq.icon_url))}" class="nyauth-app-icon" alt="${escapeHTML(authReq.name)}">` : `<div class="nyauth-app-icon-placeholder">${ICONS.apps || '📱'}</div>`}
                        <div style="flex: 1;">
                            <h3 class="nyauth-app-title">${escapeHTML(authReq.name)}</h3>
                            ${authReq.application_id ? `<small>ID: ${escapeHTML(authReq.application_id)}</small>` : ''}
                        </div>
                    </div>

                    ${alreadyAuthorized ? `
                        <div class="nyauth-already-authorized-badge">
                            <span>${t('nyauth.connected')}</span>
                        </div>
                    ` : ''}

                    <div class="nyauth-prompt-text">
                        <p>${t('nyauth.request_text', { name: escapeHTML(authReq.name) })}</p>
                    </div>

                    ${accountSectionHtml}

                    <p class="settings-help-text nui-help-text" style="margin-top: 1rem; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-color);">${t('nyauth.permissions_heading')}</p>
                    <div class="nyauth-scopes-list">
                        ${scopesHtml}
                    </div>

                    <div id="nyauth-error-msg" class="error-message nui-help-text hidden" style="margin-top: 1rem;"></div>

                    <div class="nyauth-actions nui-actions" style="margin-top: 1.5rem; display: flex; gap: 0.75rem; justify-content: flex-end;">
                        <button type="button" id="nyauth-deny-btn" class="login-secondary-button nui-button-secondary">${t('common.cancel')}</button>
                        <button type="button" id="nyauth-approve-btn" class="settings-primary-button nui-button">${t('nyauth.approve_button')}</button>
                    </div>
                </div>
            </div>
        `;

        // Account Switch Handlers
        document.querySelectorAll('.nyauth-account-option').forEach((opt) => {
            const accId = Number(opt.dataset.accountId);
            if (!accId || accId === Number(currentUser.id)) return;
            const isImposter = opt.dataset.imposter === 'true';

            opt.addEventListener('click', async () => {
                showLoading(true);
                try {
                    const { error: switchError } = await apiRequest(
                        isImposter
                            ? `/server/auth/imposters/${encodeURIComponent(accId)}/switch`
                            : '/server/auth/accounts/switch',
                        isImposter
                            ? { method: 'POST', body: {} }
                            : { method: 'POST', body: { user_id: accId } }
                    );
                    if (switchError) {
                        throw new Error(switchError.message || t('nyauth.switch_failed'));
                    }
                    await checkSession({ route: false, refreshAccounts: false });
                    // Reload auth screen for the newly switched user
                    await showNyaitterAuthScreen(showScreenFn);
                } catch (err) {
                    showLoading(false);
                    const errorMsgEl = document.getElementById('nyauth-error-msg');
                    if (errorMsgEl) {
                        errorMsgEl.textContent = err.message || t('nyauth.switch_failed');
                        errorMsgEl.classList.remove('hidden');
                    }
                }
            });
        });

        // Add Account Button Handler
        document.getElementById('nyauth-add-account-btn')?.addEventListener('click', () => {
            if (typeof window.openNyaitterLoginModal === 'function') {
                window.openNyaitterLoginModal();
            }
        });

        const approveBtn = document.getElementById('nyauth-approve-btn');
        const denyBtn = document.getElementById('nyauth-deny-btn');
        const errorMsg = document.getElementById('nyauth-error-msg');

        // Approve action
        approveBtn?.addEventListener('click', async () => {
            approveBtn.disabled = true;
            if (denyBtn) denyBtn.disabled = true;
            if (errorMsg) errorMsg.classList.add('hidden');
            showLoading(true);

            // Collect selected scopes
            const selectedScopes = [];
            document.querySelectorAll('input[name="nyauth_scope"]').forEach((cb) => {
                if (cb.checked || cb.dataset.required === 'true') {
                    selectedScopes.push(cb.value);
                }
            });

            try {
                const appRes = await globalThis.NyaitterClientInstance.nyaitterAuth.approveResponse({
                        request_id: requestId,
                        granted_scopes: selectedScopes,
                });
                const appData = await appRes.json().catch(() => ({}));
                if (!appRes.ok || !appData.success || !appData.redirect_uri) {
                    throw new Error(appData.error || t('nyauth.approve_failed'));
                }

                const safeRedirect = getSafeRedirectUrl(appData.redirect_uri);
                if (!safeRedirect) throw new Error(t('nyauth.invalid_redirect'));
                // Redirect to app's callback URL with code/token
                contentDiv.innerHTML = `
                    <div class="nyauth-container nui-page" data-nui="page">
                        <div class="nyauth-card nui-card" data-nui="card" style="text-align: center; padding: 3rem 1.5rem;">
                            <div class="spinner" style="margin: 0 auto 1.5rem;"></div>
                            <h3>${t('nyauth.connected_title')}</h3>
                            <p class="settings-help-text nui-help-text">${t('nyauth.redirecting')}</p>
                        </div>
                    </div>
                `;
                window.location.href = safeRedirect;
            } catch (err) {
                showLoading(false);
                approveBtn.disabled = false;
                if (denyBtn) denyBtn.disabled = false;
                if (errorMsg) {
                    errorMsg.textContent = err.message || t('nyauth.error_generic');
                    errorMsg.classList.remove('hidden');
                }
            }
        });

        // Deny action
        denyBtn?.addEventListener('click', async () => {
            denyBtn.disabled = true;
            if (approveBtn) approveBtn.disabled = true;
            showLoading(true);

            try {
                const denRes = await globalThis.NyaitterClientInstance.nyaitterAuth.denyResponse({ request_id: requestId });
                const denData = await denRes.json().catch(() => ({}));
                const safeRedirect = getSafeRedirectUrl(denData.redirect_uri);
                if (safeRedirect) {
                    window.location.href = safeRedirect;
                } else {
                    window.location.hash = '#';
                }
            } catch (_) {
                window.location.hash = '#';
            } finally {
                showLoading(false);
            }
        });

    } catch (err) {
        console.error('[nyaitter-auth] Error loading auth request:', err);
        contentDiv.innerHTML = `
            <div class="nyauth-container nui-page" data-nui="page">
                <div class="nyauth-card nyauth-error-card nui-card nui-danger-card" data-nui="card">
                    <h3>${t('nyauth.error_title')}</h3>
                    <p class="settings-help-text nui-help-text">${escapeHTML(err.message || t('nyauth.fetch_failed'))}</p>
                    <a href="#" class="settings-primary-button nui-button" style="display:inline-block; margin-top:1rem; text-decoration:none;">${t('nyauth.back_home')}</a>
                </div>
            </div>
        `;
    } finally {
        showLoading(false);
    }
}
