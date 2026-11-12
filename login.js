function lt(key, params) {
  return globalThis.NyaitterI18n?.t(key, params) ?? String(key || '');
}

function setupLoginModal() {
  const { apiUrl } = globalThis.NyaitterClientConfig || {};
  if (!apiUrl) return;
  const AUTH_API = apiUrl('/server/auth');

  const loginModal = document.getElementById('login-modal');
  const loginTitle = document.getElementById('login-title');
  const loginBackBtn = document.getElementById('login-back-btn');
  const authProviderSelect = document.getElementById('auth-provider-select');
  const loginProviderButtons = document.getElementById('login-provider-buttons');

  // Scratch panel elements
  const authScratchPanel = document.getElementById('auth-scratch-panel');
  const authStep1 = document.getElementById('auth-step1');
  const authStep2 = document.getElementById('auth-step2');
  const profileLink = document.getElementById('pflink');
  const projLink = document.getElementById('projlink');
  const usernameInput = document.getElementById('username-input');
  const getCodeBtn = document.getElementById('get-code-btn');
  const verificationCodeElem = document.getElementById('verification-code');
  const verifyCommentBtn = document.getElementById('verify-comment-btn');

  // Email panel elements
  const authEmailPanel = document.getElementById('auth-email-panel');
  const authEmailStep1 = document.getElementById('auth-email-step1');
  const authEmailStep2 = document.getElementById('auth-email-step2');
  const authEmailStep3 = document.getElementById('auth-email-step3');
  const loginEmailInput = document.getElementById('login-email-input');
  const getEmailCodeBtn = document.getElementById('get-email-code-btn');
  const loginEmailCodeInput = document.getElementById('login-email-code-input');
  const loginEmailNameInput = document.getElementById('login-email-name-input');
  const verifyEmailCodeBtn = document.getElementById('verify-email-code-btn');
  const submitEmailSignupBtn = document.getElementById('submit-email-signup-btn');
  const resendEmailCodeBtn = document.getElementById('resend-email-code-btn');

  // Passkey panel elements
  const authPasskeyPanel = document.getElementById('auth-passkey-panel');
  const passkeySigninBtn = document.getElementById('passkey-signin-btn');

  // NyaitterAuth panel elements
  const authNyaitterPanel = document.getElementById('auth-nyaitter-panel');
  const loginNyaitterServerInput = document.getElementById('login-nyaitter-server-input');
  const nyaitterSigninBtn = document.getElementById('nyaitter-signin-btn');

  // Common elements
  const loadingOverlay = document.getElementById('login-loading-overlay') || document.getElementById('loading-overlay');
  const errorMessage = document.getElementById('error-message');
  const copyMessage = document.getElementById('copy-message');
  const loginApprovalWaitModal = document.getElementById('login-approval-wait-modal');
  const loginApprovalWaitTitle = document.getElementById('login-approval-wait-title');
  const loginApprovalWaitDescription = document.getElementById('login-approval-wait-description');
  const loginApprovalWaitProgressLabel = document.getElementById('login-approval-wait-progress-label');
  const loginApprovalWaitStatus = document.getElementById('login-approval-wait-status');
  const loginApprovalWaitCancelBtn = document.getElementById('login-approval-wait-cancel-btn');
  const loginApprovalRecoverySection = document.getElementById('login-approval-recovery-section');
  const accountRecoveryStartBtn = document.getElementById('account-recovery-start-btn');
  const accountRecoveryWaitStatus = document.getElementById('account-recovery-wait-status');
  const turnstileContainer = document.getElementById('login-turnstile-container');
  const turnstileWidget = document.getElementById('login-turnstile-widget');

  if (!loginModal || !authProviderSelect || !loginProviderButtons) {
    return;
  }

  let currentEmail = '';
  let scratchUsername = '';
  let activeApprovalWait = null;
  let loginModalReturnFocus = null;
  let loginModalOpening = false;

  // 連携モード（mode: 'link'）用の状態。通常ログイン時は常に 'login'。
  let loginModalMode = 'login';
  let linkProvider = null; // { name, displayName? }
  let linkOnSuccess = null;
  let providerListCache = [];

  const NYAITTER_LINK_INTENT_KEY = 'nyaitter_link_intent';
  const NYAITTER_LINK_INTENT_TTL_MS = 10 * 60 * 1000;

  const PROVIDER_DISPLAY_NAMES = {
    scratch: 'Scratch',
    email: lt('login.email.address'),
    passkey: lt('login.provider.passkey'),
    nyaitter: 'NyaitterAuth',
    nyaitterauth: 'NyaitterAuth',
    'nyaitter-auth': 'NyaitterAuth',
    google: 'Google',
    microsoft: 'Microsoft',
  };

  function normalizeLinkProvider(provider) {
    if (!provider) return null;
    if (typeof provider === 'string') return { name: provider };
    const name = provider.name || provider.provider || '';
    return { ...provider, name };
  }

  function resolveProviderDisplayName(name) {
    const key = String(name || '').toLowerCase();
    const found = providerListCache.find((p) => String(p?.name || '').toLowerCase() === key);
    return found?.displayName || PROVIDER_DISPLAY_NAMES[key] || name || '';
  }

  function readLinkIntent() {
    try {
      const raw = sessionStorage.getItem(NYAITTER_LINK_INTENT_KEY);
      if (!raw) return null;
      const intent = JSON.parse(raw);
      if (!intent || typeof intent !== 'object') return null;
      if (intent.at && Date.now() - Number(intent.at) > NYAITTER_LINK_INTENT_TTL_MS) {
        sessionStorage.removeItem(NYAITTER_LINK_INTENT_KEY);
        return null;
      }
      return intent;
    } catch (_) {
      return null;
    }
  }

  function writeLinkIntent(intent) {
    try {
      sessionStorage.setItem(NYAITTER_LINK_INTENT_KEY, JSON.stringify({ ...intent, at: Date.now() }));
    } catch (_) {}
  }

  function clearLinkIntent() {
    try {
      sessionStorage.removeItem(NYAITTER_LINK_INTENT_KEY);
    } catch (_) {}
  }

  // Cloudflare Turnstile
  let turnstileEnabled = false;
  let turnstileInitialized = false;
  let turnstileWidgetId = null;
  let turnstileToken = null;
  let turnstileRequiredForModal = false;

  function isTurnstileResolved() {
    if (!turnstileEnabled) return true;
    if (turnstileToken) return true;
    if (turnstileWidgetId != null && window.turnstile?.getResponse) {
      try {
        const resp = window.turnstile.getResponse(turnstileWidgetId);
        if (resp) {
          turnstileToken = resp;
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  function updateAuthButtonsState() {
    if (isTurnstileResolved()) {
      enableAuthActionButtons();
    } else {
      disableAuthActionButtons();
    }
  }

  function disableAuthActionButtons() {
    if (isTurnstileResolved()) {
      enableAuthActionButtons();
      return;
    }
    if (verifyCommentBtn) verifyCommentBtn.disabled = true;
    if (verifyEmailCodeBtn) verifyEmailCodeBtn.disabled = true;
    if (passkeySigninBtn) passkeySigninBtn.disabled = true;
    if (nyaitterSigninBtn) nyaitterSigninBtn.disabled = true;
  }

  function enableAuthActionButtons() {
    if (verifyCommentBtn) verifyCommentBtn.disabled = false;
    if (verifyEmailCodeBtn) verifyEmailCodeBtn.disabled = false;
    if (passkeySigninBtn) passkeySigninBtn.disabled = false;
    if (nyaitterSigninBtn) nyaitterSigninBtn.disabled = false;
  }

  function loadTurnstileScript() {
    return new Promise((resolve, reject) => {
      if (window.turnstile) {
        resolve();
        return;
      }
      const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(lt('settings.security.turnstile_failed'))), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(lt('settings.security.turnstile_failed')));
      document.head.appendChild(script);
    });
  }

  let detectTurnstilePromise = null;

  async function detectTurnstileRequirement() {
    if (!turnstileContainer || !turnstileWidget) return;
    if (detectTurnstilePromise) return detectTurnstilePromise;
    detectTurnstilePromise = (async () => {
      try {
        let data = globalThis.NyaitterServerStatus;
        if (!data && globalThis.__nyaitterStatusPromise) {
          const res = await globalThis.__nyaitterStatusPromise;
          data = res?.data;
        }
        if (!data) {
          const response = await globalThis.NyaitterClientInstance.system.getStatusResponse();
          data = await response.json().catch(() => ({}));
          if (response.ok && data) {
            globalThis.NyaitterServerStatus = data;
          }
        }
        const configuredTurnstileSiteKey = String(globalThis.NyaitterClientConfig?.turnstileSiteKey || '').trim();
        if (data?.turnstile?.enabled && configuredTurnstileSiteKey) {
          turnstileEnabled = true;
          // スクリプトを先行ロード
          void loadTurnstileScript().catch(() => {});
        }
      } catch (_) {}
    })();
    return detectTurnstilePromise;
  }

  async function setupTurnstile() {
    if (!turnstileEnabled || !turnstileContainer || !turnstileWidget) {
      enableAuthActionButtons();
      return;
    }
    if (!turnstileInitialized) {
      turnstileInitialized = true;
      try {
        await loadTurnstileScript();
      } catch (error) {
        turnstileEnabled = false;
        enableAuthActionButtons();
        return;
      }
    }
    if (turnstileWidgetId != null) {
      updateAuthButtonsState();
      return;
    }

    const configuredTurnstileSiteKey = String(globalThis.NyaitterClientConfig?.turnstileSiteKey || '').trim();
    if (!configuredTurnstileSiteKey) {
      enableAuthActionButtons();
      return;
    }

    const widgetId = window.turnstile.render(turnstileWidget, {
      sitekey: configuredTurnstileSiteKey,
      theme: 'auto',
      callback: (token) => {
        turnstileToken = token;
        enableAuthActionButtons();
        // Turnstile専用画面で完了したら本来の画面へ遷移
        if (turnstileRequiredForModal) {
          turnstileRequiredForModal = false;
          afterTurnstileResolved();
        }
      },
      'expired-callback': () => {
        turnstileToken = null;
        updateAuthButtonsState();
      },
      'error-callback': () => {
        turnstileToken = null;
        updateAuthButtonsState();
      },
    });
    turnstileWidgetId = widgetId;
    updateAuthButtonsState();
  }

  function mountTurnstile(beforeElement) {
    if (!turnstileEnabled || !turnstileContainer || !beforeElement) {
      enableAuthActionButtons();
      return;
    }
    if (beforeElement.parentNode && turnstileContainer.parentNode !== beforeElement.parentNode) {
      beforeElement.parentNode.insertBefore(turnstileContainer, beforeElement);
    }
    turnstileContainer.classList.remove('hidden');
    void setupTurnstile();
  }

  function hideTurnstile() {
    if (turnstileContainer) turnstileContainer.classList.add('hidden');
  }

  function resetTurnstile() {
    turnstileToken = null;
    if (turnstileWidgetId != null && window.turnstile) {
      try {
        window.turnstile.reset(turnstileWidgetId);
      } catch (_) {}
    }
    disableAuthActionButtons();
  }

  function showTurnstileInline(anchorElement, onSuccess) {
    if (!turnstileEnabled || !turnstileContainer || !anchorElement) {
      onSuccess?.();
      return;
    }
    if (anchorElement.parentNode && turnstileContainer.parentNode !== anchorElement.parentNode) {
      anchorElement.parentNode.insertBefore(turnstileContainer, anchorElement.nextSibling);
    }
    turnstileContainer.classList.remove('hidden');
    const prevCallback = window.turnstile?.render ? null : undefined;
    void setupTurnstile().then(() => {
      const checkToken = setInterval(() => {
        if (turnstileToken) {
          clearInterval(checkToken);
          turnstileContainer.classList.add('hidden');
          onSuccess?.();
        }
      }, 300);
    });
  }

  function showLoading(show) {
    if (loadingOverlay) loadingOverlay.classList.toggle('hidden', !show);
  }

  function showError(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.classList.remove('hidden');
    }
  }

  function hideMessages() {
    if (errorMessage) errorMessage.classList.add('hidden');
    if (copyMessage) copyMessage.classList.add('hidden');
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textArea = document.createElement('textarea');
    textArea.value = String(text);
    textArea.setAttribute('readonly', '');
    textArea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(textArea);
    textArea.select();
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    textArea.remove();
    if (!copied) throw new Error('Clipboard API is not available');
  }

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function formatRecoveryRemaining(waitUntil) {
    const remainMs = Math.max(0, new Date(waitUntil || 0).getTime() - Date.now());
    const hours = Math.max(1, Math.ceil(remainMs / 3600000));
    if (hours >= 48) return lt('login.duration_days', { days: Math.floor(hours / 24) });
    if (hours >= 24) return lt('login.duration_1day');
    return lt('login.duration_hours', { hours });
  }

  function updateRecoveryStatus(waitUntil) {
    if (!accountRecoveryWaitStatus) return;
    accountRecoveryWaitStatus.textContent = lt('login.recovery.remaining', { remaining: formatRecoveryRemaining(waitUntil) });
    accountRecoveryWaitStatus.classList.remove('hidden');
    if (loginApprovalWaitStatus) loginApprovalWaitStatus.textContent = lt('login.recovery.status_short');
  }

  async function postAuthJson(path, payload) {
    const response = await fetch(`${AUTH_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function startAccountRecoveryForWait(pendingLogin, waitState) {
    const approvalId = String(pendingLogin?.approval_id || '');
    const approvalToken = String(pendingLogin?.approval_token || '');
    const { response, data } = await postAuthJson('/account-recovery/start', {
      approval_id: approvalId,
      approval_token: approvalToken,
    });
    if (!response.ok || !data.success) {
      throw new Error(data.error || lt('login.recovery.failed'));
    }
    waitState.recovery = { id: String(data.recovery_id), token: String(data.recovery_token) };
    if (loginApprovalRecoverySection) loginApprovalRecoverySection.classList.add('hidden');
    if (accountRecoveryStartBtn) accountRecoveryStartBtn.disabled = true;
    updateRecoveryStatus(data.wait_until);
    return waitState.recovery;
  }

  async function pollRecoveryForWait(recovery) {
    const { response, data } = await postAuthJson(
      `/account-recovery/${encodeURIComponent(recovery.id)}/poll`,
      { recovery_token: recovery.token },
    );
    if (response.status === 202 && data.pending) {
      updateRecoveryStatus(data.wait_until);
      return null;
    }
    if (!response.ok || data.error || !data.success) {
      throw new Error(data.error || lt('login.recovery_confirm_failed'));
    }
    return data;
  }

  function showApprovalWait(pendingLogin) {
    const state = { cancelled: false, pendingLogin, recovery: null };
    activeApprovalWait = state;
    loginModal?.classList.add('hidden');
    showLoading(false);
    if (loginApprovalWaitTitle) loginApprovalWaitTitle.textContent = lt('login.approval.title');
    if (loginApprovalWaitDescription) loginApprovalWaitDescription.textContent = lt('login.approval.description');
    if (loginApprovalWaitProgressLabel) loginApprovalWaitProgressLabel.textContent = lt('login.approval.checking');
    if (loginApprovalWaitStatus) {
      loginApprovalWaitStatus.textContent = lt('login.approval.waiting');
      loginApprovalWaitStatus.classList.remove('hidden');
    }
    if (accountRecoveryWaitStatus) {
      accountRecoveryWaitStatus.textContent = '';
      accountRecoveryWaitStatus.classList.add('hidden');
    }
    if (loginApprovalRecoverySection) {
      const enabled = pendingLogin?.account_recovery_enabled !== false;
      loginApprovalRecoverySection.classList.toggle('hidden', !enabled);
    }
    if (accountRecoveryStartBtn) {
      accountRecoveryStartBtn.disabled = false;
      accountRecoveryStartBtn.textContent = lt('login.recovery.start');
    }
    loginApprovalWaitModal?.classList.remove('hidden');
    return state;
  }

  function closeApprovalWait({ restoreLogin = false } = {}) {
    loginApprovalWaitModal?.classList.add('hidden');
    if (restoreLogin) loginModal?.classList.remove('hidden');
  }

  function showRecoveryWait(data) {
    const state = {
      cancelled: false,
      pendingLogin: null,
      recovery: { id: String(data.recovery_id), token: String(data.recovery_token) },
    };
    activeApprovalWait = state;
    loginModal?.classList.add('hidden');
    showLoading(false);
    if (loginApprovalWaitTitle) loginApprovalWaitTitle.textContent = lt('login.recovery.title');
    if (loginApprovalWaitDescription) loginApprovalWaitDescription.textContent = lt('login.recovery.description');
    if (loginApprovalWaitProgressLabel) loginApprovalWaitProgressLabel.textContent = lt('login.recovery.waiting');
    if (loginApprovalWaitStatus) loginApprovalWaitStatus.classList.add('hidden');
    if (loginApprovalRecoverySection) loginApprovalRecoverySection.classList.add('hidden');
    updateRecoveryStatus(data.wait_until);
    loginApprovalWaitModal?.classList.remove('hidden');
    return state;
  }

  async function completeRecoveryWait(data) {
    const waitState = showRecoveryWait(data);
    let approved = false;
    try {
      while (!waitState.cancelled) {
        const recovered = await pollRecoveryForWait(waitState.recovery);
        if (recovered) {
          approved = true;
          return recovered;
        }
        if (waitState.cancelled) break;
        await wait(30000);
      }
      throw new Error(lt('login.cancelled'));
    } finally {
      const ownsWaitModal = activeApprovalWait === waitState;
      if (ownsWaitModal) {
        activeApprovalWait = null;
        closeApprovalWait({ restoreLogin: !approved });
      }
    }
  }

  function cancelApprovalWait() {
    if (!activeApprovalWait) return;
    activeApprovalWait.cancelled = true;
    closeApprovalWait({ restoreLogin: true });
    showError(lt('login.cancelled'));
  }

  async function completeApprovedLogin(pendingLogin) {
    if (pendingLogin?.recovery_waiting) return completeRecoveryWait(pendingLogin);
    const approvalId = String(pendingLogin?.approval_id || '');
    const approvalToken = String(pendingLogin?.approval_token || '');
    const expiresAt = new Date(pendingLogin?.expires_at || 0).getTime();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(approvalId) || !/^[A-Za-z0-9_-]{20,128}$/.test(approvalToken)) {
      throw new Error(lt('login.approval_invalid'));
    }
    const waitState = showApprovalWait(pendingLogin);
    let approved = false;
    try {
      while (!waitState.cancelled) {
        if (waitState.recovery) {
          await wait(30000);
          if (waitState.cancelled) break;
          const recovered = await pollRecoveryForWait(waitState.recovery);
          if (recovered) {
            approved = true;
            return recovered;
          }
          // 通常の承認が先に行われた場合に備え、有効期限内は承認も確認する。
          if (Date.now() < expiresAt) {
            try {
              const response = await globalThis.NyaitterClientInstance.auth.pollLoginApprovalResponse(approvalId, approvalToken);
              const data = await response.json().catch(() => ({}));
              if (response.ok && data.success && !data.pending) {
                approved = true;
                return data;
              }
            } catch (_) {
              // 承認期限切れなどは無視して復旧の待機を続ける。
            }
          }
          continue;
        }

        if (Date.now() >= expiresAt) {
          throw new Error(lt('login.approval_expired'));
        }
        await wait(2500);
        if (waitState.cancelled || waitState.recovery) continue;
        const response = await globalThis.NyaitterClientInstance.auth.pollLoginApprovalResponse(approvalId, approvalToken);
        const data = await response.json().catch(() => ({}));
        if (response.status === 202 && data.pending) {
          if (loginApprovalWaitStatus) loginApprovalWaitStatus.textContent = lt('login.approval.waiting_device');
          continue;
        }
        if (!response.ok || data.error || !data.success) {
          throw new Error(data.error || lt('login.request_denied'));
        }
        approved = true;
        return data;
      }
      throw new Error(lt('login.cancelled'));
    } finally {
      const ownsWaitModal = activeApprovalWait === waitState;
      if (ownsWaitModal) {
        activeApprovalWait = null;
        closeApprovalWait({ restoreLogin: !approved });
      }
    }
  }

  function clearLoginQuery() {
    const url = new URL(window.location.href);
    url.searchParams.delete('login');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  function hideAllPanels() {
    authProviderSelect?.classList.add('hidden');
    authScratchPanel?.classList.add('hidden');
    authEmailPanel?.classList.add('hidden');
    authPasskeyPanel?.classList.add('hidden');
    authNyaitterPanel?.classList.add('hidden');
  }

  function showProviderSelect() {
    hideAllPanels();
    hideTurnstile();
    authProviderSelect?.classList.remove('hidden');
    loginBackBtn?.classList.add('hidden');
    if (loginTitle) loginTitle.textContent = lt('login.title.select');
    hideMessages();
  }

  function showTurnstileOnlyScreen() {
    hideAllPanels();
    hideTurnstile();
    loginBackBtn?.classList.add('hidden');
    if (loginTitle) loginTitle.textContent = lt('login.title.challenge');
    hideMessages();
    mountTurnstile(authProviderSelect); // mount inside the provider select area
  }

  function resetLoginModal() {
    scratchUsername = '';
    currentEmail = '';
    turnstileToken = null;
    turnstileRequiredForModal = false;
    loginModalMode = 'login';
    linkProvider = null;
    linkOnSuccess = null;
    if (usernameInput) usernameInput.value = '';
    if (loginEmailInput) loginEmailInput.value = '';
    if (loginEmailCodeInput) loginEmailCodeInput.value = '';
    if (loginEmailNameInput) loginEmailNameInput.value = '';
    if (loginNyaitterServerInput) loginNyaitterServerInput.value = '';
    if (verificationCodeElem) verificationCodeElem.textContent = '';
    if (profileLink) profileLink.href = 'https://scratch.mit.edu/';

    authScratchPanel?.classList.add('hidden');
    authEmailPanel?.classList.add('hidden');
    authPasskeyPanel?.classList.add('hidden');
    authNyaitterPanel?.classList.add('hidden');

    authStep2?.classList.add('hidden');
    authStep1?.classList.remove('hidden');
    authEmailStep3?.classList.add('hidden');
    authEmailStep2?.classList.add('hidden');
    authEmailStep1?.classList.remove('hidden');

    showLoading(false);
    hideTurnstile();
    showProviderSelect();
  }

  function selectProvider(provider) {
    hideAllPanels();
    hideTurnstile();
    loginBackBtn?.classList.remove('hidden');
    loginBackBtn?.setAttribute('aria-label', lt('login.back_to_methods'));
    hideMessages();

    const name = String(provider?.name || '').toLowerCase();
    if (name === 'scratch') {
      if (loginTitle) loginTitle.textContent = lt('login.title.scratch');
      authScratchPanel?.classList.remove('hidden');
      authStep1?.classList.remove('hidden');
      authStep2?.classList.add('hidden');
      window.setTimeout(() => usernameInput?.focus(), 0);
    } else if (name === 'email') {
      if (loginTitle) loginTitle.textContent = lt('login.title.email');
      authEmailPanel?.classList.remove('hidden');
      authEmailStep1?.classList.remove('hidden');
      authEmailStep2?.classList.add('hidden');
      authEmailStep3?.classList.add('hidden');
      window.setTimeout(() => loginEmailInput?.focus(), 0);
    } else if (name === 'passkey') {
      if (loginTitle) loginTitle.textContent = lt('login.title.passkey');
      authPasskeyPanel?.classList.remove('hidden');
    } else if (name === 'nyaitter' || name === 'nyaitterauth' || name === 'nyaitter-auth') {
      if (loginTitle) loginTitle.textContent = lt('login.title.nyaitter');
      authNyaitterPanel?.classList.remove('hidden');
      window.setTimeout(() => loginNyaitterServerInput?.focus(), 0);
    } else if (name === 'google' || name === 'microsoft') {
      if (loginTitle) loginTitle.textContent = lt('login.title.provider', { name: provider?.displayName || name });
      void startOAuthRedirect(provider);
    } else {
      if (loginTitle) loginTitle.textContent = lt('login.title.provider', { name: provider?.displayName || name });
    }

    if (loginModalMode === 'link') {
      const displayName = provider?.displayName || resolveProviderDisplayName(name) || name;
      if (loginTitle) loginTitle.textContent = lt('login.title.link', { name: displayName });
      loginBackBtn?.classList.remove('hidden');
      loginBackBtn?.setAttribute('aria-label', lt('login.link_cancel'));
    }
  }

  async function startOAuthRedirect(provider) {
    const name = String(provider?.name || '').toLowerCase();
    if (name !== 'google' && name !== 'microsoft') return;

    showLoading(true);
    hideMessages();
    try {
      const isLink = loginModalMode === 'link';
      const path = isLink
        ? `/link/${encodeURIComponent(name)}/initiate`
        : `/${encodeURIComponent(name)}/initiate`;
      const { response, data } = await postAuthJson(path, {
        turnstile_token: turnstileEnabled ? turnstileToken : undefined,
      });
      if (!response.ok || data.error || !data.auth_url) {
        if (response.status === 403 || data.code === 'turnstile_required') {
          resetTurnstile();
          showTurnstileInline(loginBackBtn || authProviderSelect, () => startOAuthRedirect(provider));
          showLoading(false);
          return;
        }
        throw new Error(data.error || lt('login.auth_start_failed'));
      }
      if (isLink) {
        writeLinkIntent({
          provider: name,
          displayName: provider?.displayName || resolveProviderDisplayName(name),
        });
      }
      window.location.href = data.auth_url;
    } catch (error) {
      showLoading(false);
      showError(error.message || lt('login.auth_start_failed'));
    }
  }

  function afterTurnstileResolved() {
    if (loginModalMode === 'link') {
      enterLinkProvider();
    } else {
      showProviderSelect();
    }
  }

  function enterLinkProvider() {
    if (!linkProvider) {
      showProviderSelect();
      return;
    }
    selectProvider(linkProvider);
  }

  async function renderProviderButtons() {
    loginProviderButtons.replaceChildren();
    let providers = [];
    try {
      const response = await globalThis.NyaitterClientInstance.auth.getProvidersResponse();
      const data = await response.json().catch(() => ({}));
      providers = Array.isArray(data?.providers) ? data.providers : [];
    } catch (_) {
      providers = [];
    }

    if (providers.length === 0) {
      providers = [{ name: 'scratch', displayName: 'Scratch' }];
    }

    providerListCache = providers;

    providers.forEach((provider) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'login-provider-btn';

      const labelSpan = document.createElement('span');
      labelSpan.textContent = lt('login.provider_button', { name: provider.displayName || provider.name });

      btn.appendChild(labelSpan);
      btn.addEventListener('click', () => selectProvider(provider));
      loginProviderButtons.appendChild(btn);
    });
  }

  async function openLoginModal({ reset = true, mode = 'login', provider = null, onSuccess = null } = {}) {
    if (!loginModal || loginModalOpening) return;
    loginModalOpening = true;
    if (loginModal.classList.contains('hidden')) loginModalReturnFocus = document.activeElement;
    try {
      if (reset) resetLoginModal();
      else hideMessages();

      // resetLoginModal が連携状態を初期化するため、モード確定は reset の後に行う。
      loginModalMode = mode === 'link' ? 'link' : 'login';
      linkProvider = loginModalMode === 'link' ? normalizeLinkProvider(provider) : null;
      linkOnSuccess = loginModalMode === 'link' && typeof onSuccess === 'function' ? onSuccess : null;

      // Turnstileの要件を検出してスクリプトを先行ロード
      await detectTurnstileRequirement();

      await renderProviderButtons();

      // Turnstileが必要で未解決の場合は先にチャレンジ画面を表示
      turnstileRequiredForModal = Boolean(turnstileEnabled && !isTurnstileResolved());
      if (turnstileRequiredForModal) {
        showTurnstileOnlyScreen();
      } else if (loginModalMode === 'link') {
        enterLinkProvider();
      } else {
        showProviderSelect();
      }

      loginModal.classList.remove('hidden');
      loginModal.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        if (loginModal.classList.contains('hidden')) return;
        (loginModal.querySelector('.login-provider-btn:not(:disabled)') || loginModal.querySelector('.modal-close-btn'))?.focus();
      });
    } finally {
      loginModalOpening = false;
    }
  }

  function closeLoginModal() {
    if (!loginModal) return;
    resetLoginModal();
    loginModal.classList.add('hidden');
    loginModal.setAttribute('aria-hidden', 'true');
    if (loginModalReturnFocus?.isConnected) loginModalReturnFocus.focus();
    loginModalReturnFocus = null;
    if (new URL(window.location.href).searchParams.get('login') === '1') clearLoginQuery();
  }

  window.openNyaitterLoginModal = openLoginModal;
  loginApprovalWaitCancelBtn?.addEventListener('click', cancelApprovalWait);
  accountRecoveryStartBtn?.addEventListener('click', async () => {
    const waitState = activeApprovalWait;
    if (!waitState || waitState.recovery || accountRecoveryStartBtn.disabled) return;
    accountRecoveryStartBtn.disabled = true;
    accountRecoveryStartBtn.textContent = lt('login.recovery.starting');
    try {
      await startAccountRecoveryForWait(waitState.pendingLogin, waitState);
    } catch (error) {
      accountRecoveryStartBtn.disabled = false;
      accountRecoveryStartBtn.textContent = lt('login.recovery.start');
      if (accountRecoveryWaitStatus) {
        accountRecoveryWaitStatus.textContent = error.message || lt('login.recovery.failed');
        accountRecoveryWaitStatus.classList.remove('hidden');
      }
    }
  });
  loginBackBtn?.addEventListener('click', () => {
    if (loginModalMode === 'link') {
      closeLoginModal();
      return;
    }
    showProviderSelect();
  });

  if (loginModal) {
    loginModal.querySelector('.modal-close-btn')?.addEventListener('click', closeLoginModal);
    loginModal.addEventListener('click', (event) => {
      if (event.target === loginModal) closeLoginModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !loginModal.classList.contains('hidden') && !loadingOverlay?.classList.contains('hidden')) return;
      if (event.key === 'Escape' && !loginModal.classList.contains('hidden')) closeLoginModal();
    });
  }

  function finishLogin() {
    try {
      localStorage.removeItem('nyaitter_session_token');
    } catch (_) {}

    const url = new URL(window.location.href);
    url.searchParams.delete('login');
    const pathname = url.pathname === '/login' ? '/' : url.pathname;
    const destination = `${pathname}${url.search}${url.hash}`;

    if (window.history.replaceState) {
      window.history.replaceState({}, '', destination);
    }

    loginModal?.classList.add('hidden');
    showLoading(false);

    if (typeof window.NyaitterOnLoginSuccess === 'function') {
      window.NyaitterOnLoginSuccess();
    } else {
      window.dispatchEvent(new CustomEvent('nyaitter:login-success'));
    }
  }

  function showLinkCompletionAlert(message) {
    if (typeof globalThis.showAppAlert === 'function') {
      try {
        return globalThis.showAppAlert(message);
      } catch (_) {}
    }
    if (typeof window.alert === 'function') return window.alert(message);
    return undefined;
  }

  function finishLink(providerOverride = null) {
    const provider = providerOverride || linkProvider;
    const onSuccess = linkOnSuccess;
    const name = provider?.name || provider?.provider || '';
    const key = String(name || '').toLowerCase();
    const displayName = provider?.displayName || resolveProviderDisplayName(name) || name || lt('login.provider_fallback');

    clearLinkIntent();
    resetLoginModal();
    loginModal?.classList.add('hidden');
    loginModal.setAttribute('aria-hidden', 'true');
    showLoading(false);
    if (loginModalReturnFocus?.isConnected) {
      try { loginModalReturnFocus.focus(); } catch (_) {}
    }
    loginModalReturnFocus = null;

    void showLinkCompletionAlert(lt('login.link_completed', { name: displayName }));
    try {
      onSuccess?.();
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('nyaitter:link-success', { detail: { provider: key } }));
    } catch (_) {}
  }

  // --- Scratch Flow Handlers ---
  getCodeBtn?.addEventListener('click', async () => {
    const loginInput = usernameInput?.value.trim();
    if (!loginInput) {
      showError(lt('login.scratch_username_required'));
      return;
    }

    showLoading(true);
    hideMessages();
    try {
      scratchUsername = loginInput;
      let data;
      if (loginModalMode === 'link') {
        const initRes = await postAuthJson('/link/scratch/initiate', { username: scratchUsername });
        if (!initRes.response.ok || initRes.data.error) {
          throw new Error(initRes.data.error || lt('login.code_generate_failed'));
        }
        data = initRes.data;
      } else {
        const response = await globalThis.NyaitterClientInstance.auth.generateScratchResponse(scratchUsername);
        data = await response.json().catch(() => ({}));
        if (!response.ok || data.error) {
          throw new Error(data.error || lt('login.code_generate_failed'));
        }
      }

      if (verificationCodeElem) verificationCodeElem.textContent = data.code;
      if (profileLink) profileLink.href = `https://scratch.mit.edu/users/${encodeURIComponent(scratchUsername)}/#comments`;
      authStep1?.classList.add('hidden');
      authStep2?.classList.remove('hidden');
    } catch (error) {
      showError(error.message);
    } finally {
      showLoading(false);
    }
  });

  usernameInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      getCodeBtn?.click();
    }
  });

  verificationCodeElem?.addEventListener('click', () => {
    copyTextToClipboard(verificationCodeElem.textContent).then(() => {
      copyMessage?.classList.remove('hidden');
      errorMessage?.classList.add('hidden');
      window.setTimeout(() => copyMessage?.classList.add('hidden'), 2000);
    }).catch(() => showError(lt('login.code_copy_failed')));
  });

  verifyCommentBtn?.addEventListener('click', async () => {
    const attemptVerify = async () => {
      showLoading(true);
      hideMessages();
      try {
        if (loginModalMode === 'link') {
          const { response, data } = await postAuthJson('/link/scratch/verify', {
            username: scratchUsername,
            code: verificationCodeElem?.textContent,
            turnstile_token: turnstileEnabled ? turnstileToken : undefined,
          });
          if (!response.ok || data.error) {
            if (response.status === 403 || data.code === 'turnstile_required') {
              resetTurnstile();
              showTurnstileInline(verifyCommentBtn, attemptVerify);
              return;
            }
            throw new Error(data.error || lt('login.link_failed'));
          }
          resetTurnstile();
          if (!data.success) throw new Error(lt('login.link_failed'));
          finishLink();
          return;
        }
        const response = await globalThis.NyaitterClientInstance.auth.verifyScratchResponse({
            type: 'verifyComment',
            username: scratchUsername,
            code: verificationCodeElem?.textContent,
            turnstile_token: turnstileEnabled ? turnstileToken : undefined,
        });
        let data = await response.json().catch(() => ({}));
        if (!response.ok || data.error) {
          if (response.status === 403 || data.code === 'turnstile_required') {
            resetTurnstile();
            showTurnstileInline(verifyCommentBtn, attemptVerify);
            return;
          }
          throw new Error(data.error || lt('login.auth_failed'));
        }
        resetTurnstile();
        if (data.approval_required || data.recovery_waiting) data = await completeApprovedLogin(data);
        if (!data.success) throw new Error(lt('login.session_failed'));
        finishLogin();
      } catch (error) {
        showError(error.message);
      } finally {
        showLoading(false);
      }
    };
    await attemptVerify();
  });

  // --- Email Flow Handlers ---
  async function requestEmailCode() {
    const email = loginEmailInput?.value.trim();
    if (!email) {
      showError(lt('login.email.instruction'));
      return;
    }

    showLoading(true);
    hideMessages();
    try {
      currentEmail = email;
      if (loginModalMode === 'link') {
        const { response, data } = await postAuthJson('/link/email/initiate', { email });
        if (!response.ok || data.error) {
          throw new Error(data.error || lt('login.code_send_failed'));
        }
      } else {
        const response = await globalThis.NyaitterClientInstance.auth.initiateEmailResponse(currentEmail);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.error) {
          throw new Error(data.error || lt('login.code_send_failed'));
        }
      }

      authEmailStep1?.classList.add('hidden');
      authEmailStep2?.classList.remove('hidden');
      window.setTimeout(() => loginEmailCodeInput?.focus(), 0);
    } catch (error) {
      showError(error.message);
    } finally {
      showLoading(false);
    }
  }

  getEmailCodeBtn?.addEventListener('click', requestEmailCode);
  resendEmailCodeBtn?.addEventListener('click', requestEmailCode);

  loginEmailInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      getEmailCodeBtn?.click();
    }
  });

  verifyEmailCodeBtn?.addEventListener('click', async () => {
    const code = loginEmailCodeInput?.value.trim();
    if (!code) {
      showError(lt('login.code_required'));
      return;
    }

    const attemptVerify = async () => {
      showLoading(true);
      hideMessages();
      try {
        if (loginModalMode === 'link') {
          const { response, data } = await postAuthJson('/link/email/verify', {
            email: currentEmail,
            code,
            turnstile_token: turnstileEnabled ? turnstileToken : undefined,
          });
          if (!response.ok || data.error) {
            if (response.status === 403 || data.code === 'turnstile_required') {
              resetTurnstile();
              showTurnstileInline(verifyEmailCodeBtn, attemptVerify);
              return;
            }
            throw new Error(data.error || lt('login.link_failed'));
          }
          resetTurnstile();
          if (!data.success) throw new Error(lt('login.link_failed'));
          finishLink();
          return;
        }
        const response = await globalThis.NyaitterClientInstance.auth.verifyEmailResponse({
            email: currentEmail,
            code,
            turnstile_token: turnstileEnabled ? turnstileToken : undefined,
        });
        let data = await response.json().catch(() => ({}));
        if (!response.ok || data.error) {
          if (response.status === 403 || data.code === 'turnstile_required') {
            resetTurnstile();
            showTurnstileInline(verifyEmailCodeBtn, attemptVerify);
            return;
          }
          if (data.code === 'username_required') {
            hideMessages();
            if (loginTitle) loginTitle.textContent = lt('login.title.username');
            authEmailStep2?.classList.add('hidden');
            authEmailStep3?.classList.remove('hidden');
            hideTurnstile();
            window.setTimeout(() => loginEmailNameInput?.focus(), 0);
            return;
          }
          throw new Error(data.error || lt('login.auth_failed'));
        }
        resetTurnstile();
        if (data.approval_required || data.recovery_waiting) data = await completeApprovedLogin(data);
        if (!data.success) throw new Error(lt('login.session_failed'));
        finishLogin();
      } catch (error) {
        showError(error.message);
      } finally {
        showLoading(false);
      }
    };
    await attemptVerify();
  });

  async function submitEmailSignup() {
    const code = loginEmailCodeInput?.value.trim();
    const name = loginEmailNameInput?.value.trim();
    if (!name) {
      showError(lt('login.username_required'));
      loginEmailNameInput?.focus();
      return;
    }

    const attemptSignup = async () => {
      showLoading(true);
      hideMessages();
      try {
        const response = await globalThis.NyaitterClientInstance.auth.verifyEmailResponse({
            email: currentEmail,
            code,
            name,
            turnstile_token: turnstileEnabled ? turnstileToken : undefined,
        });
        let data = await response.json().catch(() => ({}));
        if (!response.ok || data.error) {
          if (response.status === 403 || data.code === 'turnstile_required') {
            resetTurnstile();
            showTurnstileInline(submitEmailSignupBtn, attemptSignup);
            return;
          }
          throw new Error(data.error || lt('login.register_failed'));
        }
        if (data.approval_required || data.recovery_waiting) data = await completeApprovedLogin(data);
        if (!data.success) throw new Error(lt('login.session_failed'));
        finishLogin();
      } catch (error) {
        showError(error.message);
      } finally {
        showLoading(false);
      }
    };
    await attemptSignup();
  }

  submitEmailSignupBtn?.addEventListener('click', submitEmailSignup);

  loginEmailCodeInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      verifyEmailCodeBtn?.click();
    }
  });

  loginEmailNameInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitEmailSignup();
    }
  });

  // --- Passkey Flow Handlers ---
  function base64urlToUint8Array(base64url) {
    let base64 = String(base64url || '').replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function bufferToBase64url(buffer) {
    if (!buffer) return null;
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  function getEffectiveRpId(serverRpId) {
    const host = window.location.hostname;
    if (!host) return undefined;
    // IPアドレス直アクセスの場合は WebAuthn 仕様上 rpId を渡さない
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':')) {
      return undefined;
    }
    if (serverRpId && serverRpId !== 'localhost' && (host === serverRpId || host.endsWith('.' + serverRpId))) {
      return serverRpId;
    }
    return host;
  }

  passkeySigninBtn?.addEventListener('click', async () => {
    if (!window.PublicKeyCredential) {
      showError(lt('login.passkey_unsupported'));
      return;
    }

    const attemptPasskey = async () => {
      showLoading(true);
      hideMessages();
      try {
        if (loginModalMode === 'link') {
          // Step 1: サーバーからチャレンジを取得
          const initRes = await postAuthJson('/link/passkey/initiate', {
            turnstile_token: turnstileEnabled ? turnstileToken : undefined,
          });
          const initData = initRes.data || {};
          if (!initRes.response.ok || initData.error) {
            if (initRes.response.status === 403 || initData.code === 'turnstile_required') {
              resetTurnstile();
              showTurnstileInline(passkeySigninBtn, attemptPasskey);
              return;
            }
            throw new Error(initData.error || lt('login.passkey_link_start_failed'));
          }

          // 連携先アカウントの表示名（user.id は常駐キーの識別子に使われるだけで認証には影響しない）
          let userName = 'Nyaitter';
          let userId = 'nyaitter-user';
          try {
            const me = await globalThis.NyaitterClientInstance.auth.getMe();
            const user = me?.user || me || {};
            if (user.name) userName = String(user.name);
            if (user.id != null) userId = String(user.id);
            else if (user.nyaitter_id != null) userId = String(user.nyaitter_id);
          } catch (_) {}

          // Step 2: WebAuthn API で新しいパスキーを作成
          const challengeBytes = base64urlToUint8Array(initData.challenge);
          const rpId = getEffectiveRpId(initData.rpId);
          showLoading(false); // ブラウザのパスキーダイアログを表示する前にローディングを非表示に

          let credential;
          try {
            credential = await navigator.credentials.create({
              publicKey: {
                challenge: challengeBytes,
                rp: { name: initData.rpName || 'Nyaitter', ...(rpId ? { id: rpId } : {}) },
                user: {
                  id: new TextEncoder().encode(userId),
                  name: userName,
                  displayName: userName,
                },
                pubKeyCredParams: [
                  { type: 'public-key', alg: -7 },
                  { type: 'public-key', alg: -257 },
                ],
                timeout: initData.timeout || 60000,
                authenticatorSelection: {
                  userVerification: initData.userVerification || 'preferred',
                  residentKey: 'preferred',
                },
                attestation: 'none',
                extensions: { credProps: true },
              },
            });
          } catch (webAuthnError) {
            if (webAuthnError.name === 'NotAllowedError') {
              throw new Error(lt('login.passkey_create_cancelled'));
            }
            throw new Error(lt('login.passkey_create_failed', { message: webAuthnError.message }));
          }

          if (!credential) {
            throw new Error(lt('login.passkey_create_cancelled'));
          }

          showLoading(true);

          // Step 3: credential をサーバーに送信して連携
          const verifyRes = await postAuthJson('/link/passkey/verify', {
            credentialId: credential.id,
            rawId: bufferToBase64url(credential.rawId),
            response: {
              clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
              attestationObject: bufferToBase64url(credential.response.attestationObject),
            },
            type: credential.type,
            name: userName,
            turnstile_token: turnstileEnabled ? turnstileToken : undefined,
          });
          if (!verifyRes.response.ok || verifyRes.data.error) {
            if (verifyRes.response.status === 403 || verifyRes.data.code === 'turnstile_required') {
              resetTurnstile();
              showTurnstileInline(passkeySigninBtn, attemptPasskey);
              return;
            }
            throw new Error(verifyRes.data.error || lt('login.passkey_link_failed'));
          }
          resetTurnstile();
          if (!verifyRes.data.success) throw new Error(lt('login.passkey_link_failed'));
          finishLink();
          return;
        }

        // Step 1: サーバーからチャレンジを取得
        const initiateResponse = await globalThis.NyaitterClientInstance.auth.initiatePasskeyResponse({
            turnstile_token: turnstileEnabled ? turnstileToken : undefined,
        });
        const initiateData = await initiateResponse.json().catch(() => ({}));
        if (!initiateResponse.ok || initiateData.error) {
          if (initiateResponse.status === 403 || initiateData.code === 'turnstile_required') {
            resetTurnstile();
            showTurnstileInline(passkeySigninBtn, attemptPasskey);
            return;
          }
          throw new Error(initiateData.error || lt('login.passkey_auth_start_failed'));
        }

        // Step 2: WebAuthn API でパスキーウィンドウを表示して認証
        const challengeBytes = base64urlToUint8Array(initiateData.challenge);
        showLoading(false); // ブラウザのパスキーダイアログを表示する前にローディングを非表示に

        const rpId = getEffectiveRpId(initiateData.rpId);

        let credential;
        try {
          credential = await navigator.credentials.get({
            publicKey: {
              challenge: challengeBytes,
              ...(rpId ? { rpId } : {}),
              timeout: initiateData.timeout || 60000,
              userVerification: initiateData.userVerification || 'preferred',
            },
          });
        } catch (webAuthnError) {
          if (webAuthnError.name === 'NotAllowedError') {
            throw new Error(lt('login.passkey_auth_cancelled'));
          }
          throw new Error(lt('login.passkey_auth_failed_msg', { message: webAuthnError.message }));
        }

        if (!credential) {
          throw new Error(lt('login.passkey_auth_cancelled'));
        }

        showLoading(true);

        // Step 3: credential をサーバーに送信して検証
        const verifyPayload = {
          credentialId: credential.id,
          rawId: bufferToBase64url(credential.rawId),
          response: {
            clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
            authenticatorData: bufferToBase64url(credential.response.authenticatorData),
            signature: bufferToBase64url(credential.response.signature),
            userHandle: credential.response.userHandle ? bufferToBase64url(credential.response.userHandle) : null,
          },
          type: credential.type,
        };

        const verifyResponse = await globalThis.NyaitterClientInstance.auth.verifyPasskeyResponse(verifyPayload);
        let data = await verifyResponse.json().catch(() => ({}));
        if (!verifyResponse.ok || data.error) {
          if (verifyResponse.status === 403 || data.code === 'turnstile_required') {
            resetTurnstile();
            showTurnstileInline(passkeySigninBtn, attemptPasskey);
            return;
          }
          throw new Error(data.error || lt('login.passkey_auth_failed'));
        }
        if (data.approval_required || data.recovery_waiting) data = await completeApprovedLogin(data);
        if (!data.success) throw new Error(lt('login.session_failed'));
        finishLogin();
      } catch (error) {
        showError(error.message);
      } finally {
        showLoading(false);
      }
    };
    await attemptPasskey();
  });

  // --- NyaitterAuth Flow Handlers ---
  nyaitterSigninBtn?.addEventListener('click', async () => {
    const serverUrl = (loginNyaitterServerInput?.value || '').trim();
    if (!serverUrl) {
      showError(lt('login.server_url_required'));
      return;
    }

    const attemptNyaitter = async () => {
      showLoading(true);
      hideMessages();
      try {
        if (loginModalMode === 'link') {
          const { response, data } = await postAuthJson('/link/nyaitter/initiate', {
            serverUrl,
            turnstile_token: turnstileEnabled ? turnstileToken : undefined,
          });
          if (!response.ok || data.error || !data.auth_url) {
            if (response.status === 403 || data.code === 'turnstile_required') {
              resetTurnstile();
              showTurnstileInline(nyaitterSigninBtn, attemptNyaitter);
              return;
            }
            throw new Error(data.error || lt('login.nyaitterauth_link_start_failed'));
          }
          // リダイレクトを跨いで連携意図を復元できるよう sessionStorage に保持する。
          writeLinkIntent({
            provider: 'nyaitter',
            serverUrl: data.server_url || serverUrl,
            displayName: resolveProviderDisplayName('nyaitter'),
          });
          window.location.href = data.auth_url;
          return;
        }

        const initiateRes = await globalThis.NyaitterClientInstance.auth.initiateNyaitterResponse({
            serverUrl,
            turnstile_token: turnstileEnabled ? turnstileToken : undefined,
        });
        const initiateData = await initiateRes.json().catch(() => ({}));
        if (!initiateRes.ok || initiateData.error || !initiateData.auth_url) {
          if (initiateRes.status === 403 || initiateData.code === 'turnstile_required') {
            resetTurnstile();
            showTurnstileInline(nyaitterSigninBtn, attemptNyaitter);
            return;
          }
          throw new Error(initiateData.error || lt('login.nyaitterauth_auth_start_failed'));
        }

        // Redirect to authorization URL
        window.location.href = initiateData.auth_url;
      } catch (error) {
        showError(error.message);
        showLoading(false);
      }
    };
    await attemptNyaitter();
  });

  // Handle OAuth redirect callbacks (Google / Microsoft).
  function clearOAuthCallbackQuery() {
    const url = new URL(window.location.href);
    ['oauth', 'code', 'state', 'error', 'error_description', 'error_uri', 'session_state'].forEach((key) => {
      url.searchParams.delete(key);
    });
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  function promptOAuthUsername() {
    const message = lt('login.username_prompt');
    if (typeof globalThis.showAppPrompt === 'function') {
      return Promise.resolve(globalThis.showAppPrompt(message, ''));
    }
    return Promise.resolve(window.prompt(message, ''));
  }

  async function processOAuthCallback(fullUrl, provider) {
    const code = fullUrl.searchParams.get('code') || '';
    const state = fullUrl.searchParams.get('state') || '';
    const oauthError = fullUrl.searchParams.get('error');
    const linkIntent = readLinkIntent();
    const isLink = Boolean(linkIntent && String(linkIntent.provider || '').toLowerCase() === provider);

    if (!code || oauthError) {
      const message = oauthError
        ? lt('login.auth_cancelled_or_error')
        : lt('login.auth_code_missing');
      clearOAuthCallbackQuery();
      if (isLink) clearLinkIntent();
      showLoading(false);
      await openLoginModal();
      showError(message);
      return true;
    }

    showLoading(true);
    try {
      if (isLink) {
        const { response, data } = await postAuthJson(`/link/${encodeURIComponent(provider)}/verify`, { code, state });
        if (!response.ok || data.error) {
          throw new Error(data.error || lt('login.link_failed'));
        }
        if (!data.success) throw new Error(lt('login.link_failed'));
        clearOAuthCallbackQuery();
        window.location.hash = '#';
        finishLink({
          name: provider,
          displayName: linkIntent.displayName || resolveProviderDisplayName(provider),
        });
        return true;
      }

      const { response, data } = await postAuthJson(`/${encodeURIComponent(provider)}/verify`, { code, state });
      let result = data;
      let ok = response.ok;
      let pendingToken = data?.code === 'username_required' ? data.pending_token : null;
      for (let attempt = 0; pendingToken && attempt < 3; attempt += 1) {
        const name = await promptOAuthUsername();
        if (name == null) throw new Error(lt('login.username_setup_cancelled'));
        const retry = await postAuthJson(`/${encodeURIComponent(provider)}/verify`, {
          pending_token: pendingToken,
          name: String(name).trim(),
        });
        result = retry.data;
        ok = retry.response.ok;
        pendingToken = retry.data?.code === 'username_required' ? retry.data.pending_token : null;
      }
      if (!ok || result.error) {
        throw new Error(result.error || lt('login.auth_failed'));
      }
      if (result.approval_required || result.recovery_waiting) result = await completeApprovedLogin(result);
      if (!result.success) throw new Error(lt('login.session_failed'));

      clearOAuthCallbackQuery();
      window.location.hash = '#';
      finishLogin();
      return true;
    } catch (error) {
      showLoading(false);
      clearOAuthCallbackQuery();
      if (isLink) clearLinkIntent();
      await openLoginModal();
      showError(error.message || lt('login.process_failed'));
      return true;
    }
  }

  // Handle login callback parameters.
  async function processLoginCallback() {
    const fullUrl = new URL(window.location.href);
    let oauthProvider = String(fullUrl.searchParams.get('oauth') || '').toLowerCase();
    if (oauthProvider !== 'google' && oauthProvider !== 'microsoft') {
      const statePrefix = String(fullUrl.searchParams.get('state') || '').split('.')[0].toLowerCase();
      oauthProvider = statePrefix === 'google' || statePrefix === 'microsoft' ? statePrefix : '';
    }
    if (oauthProvider === 'google' || oauthProvider === 'microsoft') {
      return await processOAuthCallback(fullUrl, oauthProvider);
    }

    let token = fullUrl.searchParams.get('token') || fullUrl.searchParams.get('code');
    let provider = fullUrl.searchParams.get('provider') || 'nyaitter';
    let serverUrl = fullUrl.searchParams.get('server_url') || '';

    const hash = window.location.hash || '';
    if (hash.includes('login-callback') || hash.includes('token=') || hash.includes('code=')) {
      const qIndex = hash.indexOf('?');
      if (qIndex !== -1) {
        const hashParams = new URLSearchParams(hash.substring(qIndex + 1));
        token = token || hashParams.get('token') || hashParams.get('code');
        provider = hashParams.get('provider') || provider;
        serverUrl = hashParams.get('server_url') || serverUrl;
      }
    }

    if (!token) {
      // コード無しでログインコールバックへ戻った場合は連携が中断されたとみなし、意図を破棄する。
      if (hash.includes('login-callback') && readLinkIntent()) clearLinkIntent();
      return false;
    }

    const linkIntent = readLinkIntent();
    if (linkIntent) {
      showLoading(true);
      try {
        const targetServerUrl = linkIntent.serverUrl || serverUrl || '';
        const { response, data } = await postAuthJson('/link/nyaitter/verify', {
          code: token,
          serverUrl: targetServerUrl || undefined,
        });
        if (!response.ok || data.error) {
          throw new Error(data.error || lt('login.link_failed'));
        }
        if (!data.success) throw new Error(lt('login.link_failed'));

        window.location.hash = '#';
        finishLink({
          name: linkIntent.provider || 'nyaitter',
          displayName: linkIntent.displayName || resolveProviderDisplayName('nyaitter'),
        });
        return true;
      } catch (error) {
        showLoading(false);
        clearLinkIntent();
        await openLoginModal();
        showError(error.message || lt('login.link_process_failed'));
        return true;
      }
    }

    showLoading(true);
    try {
      const verifyRes = await globalThis.NyaitterClientInstance.auth.verifyProviderResponse(provider, {
          code: token,
          serverUrl: serverUrl || undefined,
      });
      let data = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || data.error) {
        throw new Error(data.error || lt('login.auth_failed'));
      }
      if (data.approval_required || data.recovery_waiting) data = await completeApprovedLogin(data);
      if (!data.success) throw new Error(lt('login.session_failed'));

      // Clear callback url params
      window.location.hash = '#';
      finishLogin();
      return true;
    } catch (error) {
      showLoading(false);
      await openLoginModal();
      showError(error.message || lt('login.process_failed'));
      return true;
    }
  }

  void (async () => {
    const handled = await processLoginCallback();
    if (!handled && new URL(window.location.href).searchParams.get('login') === '1') {
      openLoginModal();
    }
  })();
}

globalThis.initNyaitterLoginModal = setupLoginModal;
if (document.readyState !== 'loading') {
  setupLoginModal();
} else {
  document.addEventListener('DOMContentLoaded', setupLoginModal, { once: true });
}
