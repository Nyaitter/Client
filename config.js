/*
 * NyaitterClientのAPIエンドポイント設定
 */
(() => {
    'use strict';

    let manifestConfig = {};

    // このスクリプト自身の位置を配信ベースとする。API 設定が得られない場合は
    // その配下の server/ を既定にし、任意のサブパス配下でも成立させる。
    const pageBaseUrl = (() => {
        const scriptUrl =
            typeof document !== 'undefined' ? document.currentScript?.src : undefined;
        const base = scriptUrl || (typeof self !== 'undefined' ? self.location?.href : undefined);
        return base ? new URL('.', base).href : null;
    })();
    const defaultApiEndpoint = pageBaseUrl ? new URL('server', pageBaseUrl).href : null;

    const manifestReady = (async () => {
        try {
            const response = await fetch('./manifest.json', { credentials: 'same-origin' });
            if (!response.ok) return;
            const manifest = await response.json();
            manifestConfig = manifest && typeof manifest === 'object' ? manifest : {};
        } catch (_) {
            // マニフェストがない環境でも他の設定源で起動する。
        }
    })();

    // api_url (クライアント自身の設定) をサーバーの client_config.api_endpoint より優先し、
    // 未設定ならサーバー設定、それも無ければ配信ベース配下の server/ を使う。
    const getConfig = (name, fallback) => {
        const status = globalThis.NyaitterServerStatus?.client_config;
        const manifestName = name === 'api_endpoint' ? 'api_url' : name;
        if (name === 'api_endpoint') {
            const manifestApiUrl = String(manifestConfig?.[manifestName] ?? '').trim();
            if (manifestApiUrl) return manifestApiUrl;
            return status?.api_endpoint ?? fallback ?? defaultApiEndpoint;
        }
        return status?.[name] ?? manifestConfig?.[manifestName] ?? fallback;
    };

    function normalizeEndpoint(value) {
        const endpoint = String(value || '').trim();
        if (!endpoint) throw new Error('api_endpoint is not configured');
        const url = new URL(endpoint, globalThis.location.href);
        if (!/^https?:$/.test(url.protocol)) {
            throw new Error('apiEndpoint must use an HTTP(S) URL or a relative path');
        }
        return url;
    }

    function normalizeUserFileEndpoint(value) {
        const endpoint = String(value || '').trim();
        if (!endpoint) return null;
        const url = new URL(endpoint, globalThis.location.href);
        if (!/^https?:$/.test(url.protocol)) {
            throw new Error('userFileEndpoint must use an HTTP(S) URL or a relative path');
        }
        return url;
    }

    // ユーザーファイルのエンドポイントは、配信ベースが何であっても標準の相対解決で
    // 成立させる。特定のパス形状 (リバースプロキシ接頭辞) を判定・逆算しない。
    // 優先順位: クライアント自身の設定 (manifest.user_file_endpoint) →
    // サーバー/設定値 (user_file_endpoint) → 既定 (API ベース配下の uploads)。
    // 値が絶対 URL ならそのまま、相対/ルート相対なら apiUrl() と同じ規則で解決する。
    function getUserFileEndpoint() {
        const resolveEndpoint = (value) => {
            const endpoint = String(value ?? '').trim();
            if (!endpoint) return null;
            if (/^https?:\/\//i.test(endpoint)) return endpoint;
            return apiUrl(endpoint);
        };

        const manifestEndpoint = resolveEndpoint(manifestConfig?.user_file_endpoint);
        if (manifestEndpoint) return manifestEndpoint;

        const configuredEndpoint = resolveEndpoint(getConfig('user_file_endpoint', null));
        if (configuredEndpoint) return configuredEndpoint;

        // 既定は API ベース配下の uploads。
        return apiUrl('/uploads');
    }

    function userFileUrl(fileId = '') {
        const configuredEndpoint = getUserFileEndpoint();
        const endpoint = normalizeUserFileEndpoint(configuredEndpoint);
        if (!endpoint) return null;
        const encodedKey = String(fileId || '')
            .split('/')
            .filter(Boolean)
            .map((segment) => encodeURIComponent(segment))
            .join('/');
        if (!encodedKey) return null;

        const basePath = endpoint.pathname.replace(/\/+$/, '');
        endpoint.pathname = `${basePath}/${encodedKey}`.replace(/\/{2,}/g, '/');
        endpoint.search = '';
        endpoint.hash = '';

        if (/^https?:\/\//i.test(configuredEndpoint)) return endpoint.href;
        return endpoint.pathname;
    }

    function apiUrl(path = '') {
        const endpoint = normalizeEndpoint(getConfig('api_endpoint'));
        const request = new URL(String(path || '/'), endpoint.origin);
        const basePath = endpoint.pathname.replace(/\/+$/, '');
        let normalizedPath = request.pathname;
        for (const prefix of ['/server', basePath]) {
            if (prefix && (normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`))) {
                normalizedPath = normalizedPath.slice(prefix.length) || '/';
            }
        }
        const targetPath = `${basePath}/${normalizedPath.replace(/^\/+/, '')}`.replace(
            /\/{2,}/g,
            '/',
        );

        endpoint.pathname = targetPath || '/';
        endpoint.search = request.search;
        endpoint.hash = request.hash;

        const configured = String(getConfig('api_endpoint') || '').trim();
        if (/^https?:\/\//i.test(configured)) return endpoint.href;
        return `${endpoint.pathname}${endpoint.search}${endpoint.hash}`;
    }

    function apiWebSocketUrl(path = '/realtime') {
        const endpoint = normalizeEndpoint(getConfig('api_endpoint'));
        endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
        const basePath = endpoint.pathname.replace(/\/+$/, '');
        endpoint.pathname = `${basePath}/${String(path).replace(/^\/+/, '')}`.replace(
            /\/{2,}/g,
            '/',
        );
        endpoint.search = '';
        endpoint.hash = '';
        return endpoint.href;
    }

    const clientConfig = {
        ready: manifestReady,
        apiUrl,
        userFileUrl,
        apiWebSocketUrl,
    };
    Object.defineProperties(clientConfig, {
        apiEndpoint: { get: () => getConfig('api_endpoint') },
        clientVersion: { get: () => String(getConfig('client_version', '') || '').trim() },
        nyaitterJs: { get: () => getConfig('nyaitter_js', 'latest') },
        nyaitterUi: { get: () => getConfig('nyaitter_ui', '') },
        userFileEndpoint: { get: () => getUserFileEndpoint() },
        shareUrl: { get: () => getConfig('share_url', null) },
        postShareUrl: { get: () => getConfig('post_share_url', null) },
        advertising: {
            get: () => {
                const config = manifestConfig?.advertising;
                return config && typeof config === 'object' ? config : null;
            },
        },
        turnstileSiteKey: { get: () => String(getConfig('turnstile_site_key', '') || '').trim() },
        resourceLinks: { get: () => Object.freeze([...(getConfig('resource_links', []) || [])]) },
        widgetLinks: { get: () => Object.freeze([...(getConfig('widget_links', []) || [])]) },
    });
    globalThis.NyaitterClientConfig = Object.freeze(clientConfig);

    function installGetCodeButtonFailureRecovery() {
        const getCodeButton = document.getElementById('get-code-btn');
        const errorMessage = document.getElementById('error-message');
        if (!getCodeButton || !errorMessage) return;

        const restoreAfterVisibleError = () => {
            if (errorMessage.classList.contains('hidden')) return;
            // login.jsの取得処理がfinallyを終えた後に復元する。Turnstileが必要な場合も、
            // 次回クリック時の既存検証でトークン未完了を拒否するため認証要件は維持される。
            window.setTimeout(() => {
                if (!errorMessage.classList.contains('hidden')) {
                    getCodeButton.disabled = false;
                }
            }, 0);
        };

        new MutationObserver(restoreAfterVisibleError).observe(errorMessage, {
            attributes: true,
            attributeFilter: ['class'],
            childList: true,
            characterData: true,
            subtree: true,
        });
    }

    function installLoginApprovalFailureReset() {
        const loginModal = document.getElementById('login-modal');
        const approvalWaitModal = document.getElementById('login-approval-wait-modal');
        const authStep1 = document.getElementById('auth-step1');
        const authStep2 = document.getElementById('auth-step2');
        const usernameInput = document.getElementById('username-input');
        const verificationCode = document.getElementById('verification-code');
        const profileLink = document.getElementById('pflink');
        const copyMessage = document.getElementById('copy-message');
        if (!loginModal || !approvalWaitModal || !authStep1 || !authStep2 || !usernameInput) return;

        let wasWaitingForApproval = false;
        const resetLoginFlow = () => {
            usernameInput.value = '';
            if (verificationCode) verificationCode.textContent = '';
            if (profileLink) profileLink.href = 'https://scratch.mit.edu/';
            copyMessage?.classList.add('hidden');
            authStep2.classList.add('hidden');
            authStep1.classList.remove('hidden');
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            window.setTimeout(() => usernameInput.focus(), 0);
        };

        const observer = new MutationObserver(() => {
            const waitingForApproval = !approvalWaitModal.classList.contains('hidden');
            const returnedToLogin = !loginModal.classList.contains('hidden');
            if (wasWaitingForApproval && !waitingForApproval && returnedToLogin) {
                // Defer until the login flow has shown its failure message.
                window.setTimeout(resetLoginFlow, 0);
            }
            wasWaitingForApproval = waitingForApproval;
        });
        observer.observe(approvalWaitModal, { attributes: true, attributeFilter: ['class'] });
    }

    // config.jsはService Workerからも読み込まれるため、DOMを持つ画面環境だけで
    // ログインモーダルの初期化を登録する。
    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            installGetCodeButtonFailureRecovery();
            installLoginApprovalFailureReset();
        }, { once: true });
    }
})();
