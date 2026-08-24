document.addEventListener('DOMContentLoaded', () => {
  const { apiUrl, turnstileSiteKey } = globalThis.NyaitterClientConfig;
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
  const loginApprovalWaitStatus = document.getElementById('login-approval-wait-status');
  const loginApprovalWaitCancelBtn = document.getElementById('login-approval-wait-cancel-btn');
  const turnstileContainer = document.getElementById('login-turnstile-container');
  const turnstileWidget = document.getElementById('login-turnstile-widget');

  if (!loginModal || !authProviderSelect || !loginProviderButtons) {
    return;
  }

  let currentEmail = '';
  let scratchUsername = '';
  let activeApprovalWait = null;
  let cachedProviders = [];

  // Cloudflare Turnstile
  const configuredTurnstileSiteKey = String(turnstileSiteKey || '').trim();
  let turnstileEnabled = false;
  let turnstileInitialized = false;
  let turnstileWidgetId = null;
  let turnstileToken = null;

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
        existing.addEventListener('error', () => reject(new Error('Turnstileの読み込みに失敗しました。')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Turnstileの読み込みに失敗しました。'));
      document.head.appendChild(script);
    });
  }

  let detectTurnstilePromise = null;

  async function detectTurnstileRequirement() {
    if (!configuredTurnstileSiteKey || !turnstileContainer || !turnstileWidget) return;
    if (detectTurnstilePromise) return detectTurnstilePromise;
    detectTurnstilePromise = (async () => {
      try {
        let data = globalThis.NyaitterServerStatus;
        if (!data && globalThis.__nyaitterStatusPromise) {
          const res = await globalThis.__nyaitterStatusPromise;
          data = res?.data;
        }
        if (!data) {
          const response = await fetch(apiUrl('/server/api/status'), {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          });
          data = await response.json().catch(() => ({}));
          if (response.ok && data) {
            globalThis.NyaitterServerStatus = data;
          }
        }
        if (data?.turnstile?.enabled) {
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

    const widgetId = window.turnstile.render(turnstileWidget, {
      sitekey: configuredTurnstileSiteKey,
      theme: 'auto',
      callback: (token) => {
        turnstileToken = token;
        enableAuthActionButtons();
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

  function showApprovalWait() {
    const state = { cancelled: false };
    activeApprovalWait = state;
    loginModal?.classList.add('hidden');
    showLoading(false);
    if (loginApprovalWaitStatus) loginApprovalWaitStatus.textContent = '許可を待機しています…';
    loginApprovalWaitModal?.classList.remove('hidden');
    return state;
  }

  function closeApprovalWait({ restoreLogin = false } = {}) {
    loginApprovalWaitModal?.classList.add('hidden');
    if (restoreLogin) loginModal?.classList.remove('hidden');
  }

  function cancelApprovalWait() {
    if (!activeApprovalWait) return;
    activeApprovalWait.cancelled = true;
    closeApprovalWait({ restoreLogin: true });
    showError('ログインをキャンセルしました。');
  }

  async function completeApprovedLogin(pendingLogin) {
    const approvalId = String(pendingLogin?.approval_id || '');
    const approvalToken = String(pendingLogin?.approval_token || '');
    const expiresAt = new Date(pendingLogin?.expires_at || 0).getTime();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(approvalId) || !/^[A-Za-z0-9_-]{20,128}$/.test(approvalToken)) {
      throw new Error('ログイン承認情報が無効です。最初からやり直してください。');
    }
    const waitState = showApprovalWait();
    let approved = false;
    try {
      while (Date.now() < expiresAt) {
        if (waitState.cancelled) throw new Error('ログインをキャンセルしました。');
        await wait(2500);
        if (waitState.cancelled) throw new Error('ログインをキャンセルしました。');
        const response = await fetch(`${AUTH_API}/login-approvals/${encodeURIComponent(approvalId)}/poll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ approval_token: approvalToken }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 202 && data.pending) {
          if (loginApprovalWaitStatus) loginApprovalWaitStatus.textContent = 'ログイン済み端末での許可を待っています…';
          continue;
        }
        if (!response.ok || data.error || !data.success) {
          throw new Error(data.error || 'ログイン要求は許可されませんでした。');
        }
        approved = true;
        return data;
      }
      throw new Error('ログイン承認の有効期限が切れました。最初からやり直してください。');
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
    if (loginTitle) loginTitle.textContent = 'ログイン方法を選択';
    hideMessages();
  }

  function resetLoginModal() {
    scratchUsername = '';
    currentEmail = '';
    turnstileToken = null;
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
    hideMessages();

    const name = String(provider?.name || '').toLowerCase();
    if (name === 'scratch') {
      if (loginTitle) loginTitle.textContent = 'Scratchでログイン';
      authScratchPanel?.classList.remove('hidden');
      authStep1?.classList.remove('hidden');
      authStep2?.classList.add('hidden');
      window.setTimeout(() => usernameInput?.focus(), 0);
    } else if (name === 'email') {
      if (loginTitle) loginTitle.textContent = 'メールアドレスでログイン';
      authEmailPanel?.classList.remove('hidden');
      authEmailStep1?.classList.remove('hidden');
      authEmailStep2?.classList.add('hidden');
      authEmailStep3?.classList.add('hidden');
      window.setTimeout(() => loginEmailInput?.focus(), 0);
    } else if (name === 'passkey') {
      if (loginTitle) loginTitle.textContent = 'パスキーでログイン';
      authPasskeyPanel?.classList.remove('hidden');
      mountTurnstile(passkeySigninBtn);
    } else if (name === 'nyaitter' || name === 'nyaitterauth' || name === 'nyaitter-auth') {
      if (loginTitle) loginTitle.textContent = 'Nyaitterでログイン';
      authNyaitterPanel?.classList.remove('hidden');
      mountTurnstile(nyaitterSigninBtn);
      window.setTimeout(() => loginNyaitterServerInput?.focus(), 0);
    } else {
      if (loginTitle) loginTitle.textContent = `${provider?.displayName || name}でログイン`;
    }
  }

  async function renderProviderButtons() {
    loginProviderButtons.replaceChildren();
    try {
      const response = await fetch(`${AUTH_API}/providers`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      cachedProviders = Array.isArray(data?.providers) ? data.providers : [];
    } catch (_) {
      cachedProviders = [];
    }

    if (cachedProviders.length === 0) {
      cachedProviders = [{ name: 'scratch', displayName: 'Scratch' }];
    }

    cachedProviders.forEach((provider) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'login-provider-btn';

      const labelSpan = document.createElement('span');
      labelSpan.textContent = `${provider.displayName || provider.name}でログイン`;

      btn.appendChild(labelSpan);
      btn.addEventListener('click', () => selectProvider(provider));
      loginProviderButtons.appendChild(btn);
    });
  }

  async function openLoginModal({ reset = true } = {}) {
    if (!loginModal) return;
    if (reset) resetLoginModal();
    else hideMessages();

    // Turnstileの要件を検出してスクリプトを先行ロード
    void detectTurnstileRequirement();

    await renderProviderButtons();
    loginModal.classList.remove('hidden');
  }

  function closeLoginModal() {
    if (!loginModal) return;
    resetLoginModal();
    loginModal.classList.add('hidden');
    if (new URL(window.location.href).searchParams.get('login') === '1') clearLoginQuery();
  }

  window.openNyaitterLoginModal = openLoginModal;
  loginApprovalWaitCancelBtn?.addEventListener('click', cancelApprovalWait);
  loginBackBtn?.addEventListener('click', showProviderSelect);

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

  // --- Scratch Flow Handlers ---
  getCodeBtn?.addEventListener('click', async () => {
    const loginInput = usernameInput?.value.trim();
    if (!loginInput) {
      showError('Scratchユーザー名を入力してください。');
      return;
    }

    showLoading(true);
    hideMessages();
    try {
      scratchUsername = loginInput;
      const response = await fetch(`${AUTH_API}/scratch/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'generateCode',
          username: scratchUsername,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.error || 'コードの生成に失敗しました。');
      }

      if (verificationCodeElem) verificationCodeElem.textContent = data.code;
      if (profileLink) profileLink.href = `https://scratch.mit.edu/users/${encodeURIComponent(scratchUsername)}/#comments`;
      authStep1?.classList.add('hidden');
      authStep2?.classList.remove('hidden');
      mountTurnstile(verifyCommentBtn);
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
    }).catch(() => showError('認証コードをコピーできませんでした。手動でコピーしてください。'));
  });

  verifyCommentBtn?.addEventListener('click', async () => {
    if (turnstileEnabled && !turnstileToken) {
      showError('認証チャレンジを完了してください。');
      return;
    }

    showLoading(true);
    hideMessages();
    try {
      const response = await fetch(`${AUTH_API}/scratch/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'verifyComment',
          username: scratchUsername,
          code: verificationCodeElem?.textContent,
          turnstile_token: turnstileEnabled ? turnstileToken : undefined,
        }),
      });
      let data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        if (response.status === 403 || data.code === 'turnstile_required') resetTurnstile();
        throw new Error(data.error || '認証に失敗しました。');
      }
      resetTurnstile();
      if (data.approval_required) data = await completeApprovedLogin(data);
      if (!data.success) throw new Error('セッションの設定に失敗しました。');
      finishLogin();
    } catch (error) {
      showError(error.message);
    } finally {
      showLoading(false);
    }
  });

  // --- Email Flow Handlers ---
  async function requestEmailCode() {
    const email = loginEmailInput?.value.trim();
    if (!email) {
      showError('メールアドレスを入力してください。');
      return;
    }

    showLoading(true);
    hideMessages();
    try {
      currentEmail = email;
      const response = await fetch(`${AUTH_API}/email/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: currentEmail,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.error || '認証コードの送信に失敗しました。');
      }

      authEmailStep1?.classList.add('hidden');
      authEmailStep2?.classList.remove('hidden');
      mountTurnstile(verifyEmailCodeBtn);
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
      showError('認証コードを入力してください。');
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      showError('認証チャレンジを完了してください。');
      return;
    }

    showLoading(true);
    hideMessages();
    try {
      const response = await fetch(`${AUTH_API}/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: currentEmail,
          code,
          turnstile_token: turnstileEnabled ? turnstileToken : undefined,
        }),
      });
      let data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        if (response.status === 403 || data.code === 'turnstile_required') resetTurnstile();
        if (data.code === 'username_required') {
          hideMessages();
          if (loginTitle) loginTitle.textContent = 'ユーザー名の設定';
          authEmailStep2?.classList.add('hidden');
          authEmailStep3?.classList.remove('hidden');
          hideTurnstile();
          window.setTimeout(() => loginEmailNameInput?.focus(), 0);
          return;
        }
        throw new Error(data.error || '認証に失敗しました。');
      }
      resetTurnstile();
      if (data.approval_required) data = await completeApprovedLogin(data);
      if (!data.success) throw new Error('セッションの設定に失敗しました。');
      finishLogin();
    } catch (error) {
      showError(error.message);
    } finally {
      showLoading(false);
    }
  });

  async function submitEmailSignup() {
    const code = loginEmailCodeInput?.value.trim();
    const name = loginEmailNameInput?.value.trim();
    if (!name) {
      showError('ユーザー名を入力してください。');
      loginEmailNameInput?.focus();
      return;
    }

    showLoading(true);
    hideMessages();
    try {
      const response = await fetch(`${AUTH_API}/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: currentEmail,
          code,
          name,
        }),
      });
      let data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.error || '登録に失敗しました。');
      }
      if (data.approval_required) data = await completeApprovedLogin(data);
      if (!data.success) throw new Error('セッションの設定に失敗しました。');
      finishLogin();
    } catch (error) {
      showError(error.message);
    } finally {
      showLoading(false);
    }
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
      showError('このブラウザはパスキー認証に対応していません。');
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      showError('認証チャレンジを完了してください。');
      return;
    }

    showLoading(true);
    hideMessages();
    try {
      // Step 1: サーバーからチャレンジを取得
      const initiateResponse = await fetch(`${AUTH_API}/passkey/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          turnstile_token: turnstileEnabled ? turnstileToken : undefined,
        }),
      });
      const initiateData = await initiateResponse.json().catch(() => ({}));
      if (!initiateResponse.ok || initiateData.error) {
        if (initiateResponse.status === 403 || initiateData.code === 'turnstile_required') resetTurnstile();
        throw new Error(initiateData.error || 'パスキー認証の開始に失敗しました。');
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
          throw new Error('パスキー認証がキャンセルされました。');
        }
        throw new Error(`パスキー認証に失敗しました: ${webAuthnError.message}`);
      }

      if (!credential) {
        throw new Error('パスキー認証がキャンセルされました。');
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

      const verifyResponse = await fetch(`${AUTH_API}/passkey/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(verifyPayload),
      });
      let data = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok || data.error) throw new Error(data.error || 'パスキー認証に失敗しました。');
      if (data.approval_required) data = await completeApprovedLogin(data);
      if (!data.success) throw new Error('セッションの設定に失敗しました。');
      finishLogin();
    } catch (error) {
      showError(error.message);
    } finally {
      showLoading(false);
    }
  });

  // --- NyaitterAuth Flow Handlers ---
  nyaitterSigninBtn?.addEventListener('click', async () => {
    const serverUrl = (loginNyaitterServerInput?.value || '').trim();
    if (!serverUrl) {
      showError('NyaitterサーバーURLを入力してください。');
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      showError('認証チャレンジを完了してください。');
      return;
    }

    showLoading(true);
    hideMessages();
    try {
      const initiateRes = await fetch(`${AUTH_API}/nyaitter/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          serverUrl,
          turnstile_token: turnstileEnabled ? turnstileToken : undefined,
        }),
      });
      const initiateData = await initiateRes.json().catch(() => ({}));
      if (!initiateRes.ok || initiateData.error || !initiateData.auth_url) {
        if (initiateRes.status === 403 || initiateData.code === 'turnstile_required') resetTurnstile();
        throw new Error(initiateData.error || 'NyaitterAuth認証の開始に失敗しました。');
      }

      // Redirect to authorization URL
      window.location.href = initiateData.auth_url;
    } catch (error) {
      showError(error.message);
      showLoading(false);
    }
  });

  // Handle #login-callback / ?token=... / ?code=...
  async function processLoginCallback() {
    const fullUrl = new URL(window.location.href);
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

    if (!token) return false;

    showLoading(true);
    try {
      const verifyRes = await fetch(`${AUTH_API}/${encodeURIComponent(provider)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          code: token,
          serverUrl: serverUrl || undefined,
        }),
      });
      let data = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || data.error) {
        throw new Error(data.error || '認証に失敗しました。');
      }
      if (data.approval_required) data = await completeApprovedLogin(data);
      if (!data.success) throw new Error('セッションの設定に失敗しました。');

      // Clear callback url params
      window.location.hash = '#';
      finishLogin();
      return true;
    } catch (error) {
      showLoading(false);
      await openLoginModal();
      showError(error.message || 'ログイン処理に失敗しました。');
      return true;
    }
  }

  void (async () => {
    const handled = await processLoginCallback();
    if (!handled && new URL(window.location.href).searchParams.get('login') === '1') {
      openLoginModal();
    }
  })();
});
