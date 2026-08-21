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
  const loginEmailInput = document.getElementById('login-email-input');
  const getEmailCodeBtn = document.getElementById('get-email-code-btn');
  const loginEmailCodeInput = document.getElementById('login-email-code-input');
  const verifyEmailCodeBtn = document.getElementById('verify-email-code-btn');
  const resendEmailCodeBtn = document.getElementById('resend-email-code-btn');

  // Passkey panel elements
  const authPasskeyPanel = document.getElementById('auth-passkey-panel');
  const passkeySigninBtn = document.getElementById('passkey-signin-btn');

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

  function disableGetCodeButton() {
    if (getCodeBtn) getCodeBtn.disabled = true;
  }

  function enableGetCodeButton() {
    if (getCodeBtn) getCodeBtn.disabled = false;
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

  async function detectTurnstileRequirement() {
    if (!configuredTurnstileSiteKey || !turnstileContainer || !turnstileWidget) return;
    try {
      const response = await fetch(apiUrl('/server/status'), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.turnstile?.enabled) {
        turnstileEnabled = true;
      }
    } catch (_) {}
  }

  async function setupTurnstile() {
    if (!turnstileEnabled || !turnstileContainer || !turnstileWidget) return;
    if (!turnstileInitialized) {
      turnstileInitialized = true;
      try {
        await loadTurnstileScript();
      } catch (error) {
        turnstileEnabled = false;
        enableGetCodeButton();
        return;
      }
    }
    if (turnstileWidgetId != null) return;

    turnstileContainer.classList.remove('hidden');
    disableGetCodeButton();
    turnstileWidgetId = window.turnstile.render(turnstileWidget, {
      sitekey: configuredTurnstileSiteKey,
      theme: 'auto',
      callback: (token) => {
        turnstileToken = token;
        enableGetCodeButton();
      },
      'expired-callback': () => {
        turnstileToken = null;
        disableGetCodeButton();
      },
      'error-callback': () => {
        turnstileToken = null;
        disableGetCodeButton();
      },
    });
  }

  function resetTurnstile() {
    turnstileToken = null;
    if (turnstileWidgetId != null && window.turnstile) {
      try {
        window.turnstile.reset(turnstileWidgetId);
      } catch (_) {}
    }
    disableGetCodeButton();
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
  }

  function showProviderSelect() {
    hideAllPanels();
    authProviderSelect?.classList.remove('hidden');
    loginBackBtn?.classList.add('hidden');
    if (loginTitle) loginTitle.textContent = 'ログイン方法を選択';
    hideMessages();
  }

  function resetLoginModal() {
    scratchUsername = '';
    currentEmail = '';
    if (usernameInput) usernameInput.value = '';
    if (loginEmailInput) loginEmailInput.value = '';
    if (loginEmailCodeInput) loginEmailCodeInput.value = '';
    if (verificationCodeElem) verificationCodeElem.textContent = '';
    if (profileLink) profileLink.href = 'https://scratch.mit.edu/';

    authStep2?.classList.add('hidden');
    authStep1?.classList.remove('hidden');
    authEmailStep2?.classList.add('hidden');
    authEmailStep1?.classList.remove('hidden');

    showProviderSelect();
  }

  function selectProvider(provider) {
    hideAllPanels();
    loginBackBtn?.classList.remove('hidden');
    hideMessages();

    const name = String(provider?.name || '').toLowerCase();
    if (name === 'scratch') {
      if (loginTitle) loginTitle.textContent = 'Scratchでログイン';
      authScratchPanel?.classList.remove('hidden');
      authStep1?.classList.remove('hidden');
      authStep2?.classList.add('hidden');
      if (turnstileEnabled) void setupTurnstile();
      window.setTimeout(() => usernameInput?.focus(), 0);
    } else if (name === 'email') {
      if (loginTitle) loginTitle.textContent = 'メールアドレスでログイン';
      authEmailPanel?.classList.remove('hidden');
      authEmailStep1?.classList.remove('hidden');
      authEmailStep2?.classList.add('hidden');
      window.setTimeout(() => loginEmailInput?.focus(), 0);
    } else if (name === 'passkey') {
      if (loginTitle) loginTitle.textContent = 'パスキーでログイン';
      authPasskeyPanel?.classList.remove('hidden');
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
    if (turnstileEnabled && !turnstileToken) {
      showError('認証チャレンジを完了してください。');
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
          turnstile_token: turnstileEnabled ? turnstileToken : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        if (response.status === 403) resetTurnstile();
        throw new Error(data.error || 'コードの生成に失敗しました。');
      }
      resetTurnstile();

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
    }).catch(() => showError('認証コードをコピーできませんでした。手動でコピーしてください。'));
  });

  verifyCommentBtn?.addEventListener('click', async () => {
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
        }),
      });
      let data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || '認証に失敗しました。');
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
        body: JSON.stringify({ email: currentEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        throw new Error(data.error || '認証コードの送信に失敗しました。');
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
      showError('認証コードを入力してください。');
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
        }),
      });
      let data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || '認証に失敗しました。');
      if (data.approval_required) data = await completeApprovedLogin(data);
      if (!data.success) throw new Error('セッションの設定に失敗しました。');
      finishLogin();
    } catch (error) {
      showError(error.message);
    } finally {
      showLoading(false);
    }
  });

  loginEmailCodeInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      verifyEmailCodeBtn?.click();
    }
  });

  // --- Passkey Flow Handlers ---
  passkeySigninBtn?.addEventListener('click', async () => {
    showLoading(true);
    hideMessages();
    try {
      const credentialId = `passkey_${Date.now()}`;
      const response = await fetch(`${AUTH_API}/passkey/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ credentialId }),
      });
      let data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || 'パスキー認証に失敗しました。');
      if (data.approval_required) data = await completeApprovedLogin(data);
      if (!data.success) throw new Error('セッションの設定に失敗しました。');
      finishLogin();
    } catch (error) {
      showError(error.message);
    } finally {
      showLoading(false);
    }
  });

  void detectTurnstileRequirement().then(() => {
    if (new URL(window.location.href).searchParams.get('login') === '1') openLoginModal();
  });
});
