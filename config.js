/*
 * NyaitterClientのAPIエンドポイント設定
 */
(() => {
    'use strict';

    const CLIENT_CONFIG = { apiEndpoint: '/server' };
    let manifestConfig = {};

    const manifestReady = (async () => {
        try {
            const response = await fetch('./manifest.json', { credentials: 'same-origin' });
            if (!response.ok) return;
            const manifest = await response.json();
            const clientConfig = manifest?.client_config && typeof manifest.client_config === 'object'
                ? manifest.client_config
                : {};
            const apiUrl = manifest?.api_url ?? clientConfig.api_endpoint;
            manifestConfig = apiUrl === undefined
                ? clientConfig
                : { ...clientConfig, api_endpoint: apiUrl };
        } catch (_) {
            // マニフェストがない環境でも config.js の設定で起動する。
        }
    })();

    const getConfig = (name, fallback) => {
        const status = globalThis.NyaitterServerStatus?.client_config;
        return status?.[name] ?? manifestConfig?.[name] ?? CLIENT_CONFIG?.[name] ?? fallback;
    };

    function normalizeEndpoint(value) {
        const endpoint = String(value || '').trim() || '/server';
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

    function getUserFileEndpoint() {
        const configuredEndpoint = getConfig('user_file_endpoint', null);
        if (configuredEndpoint) return String(configuredEndpoint).trim();

        const apiEndpoint = normalizeEndpoint(getConfig('api_endpoint', CLIENT_CONFIG.apiEndpoint));
        const basePath = apiEndpoint.pathname.replace(/\/+$/, '');
        apiEndpoint.pathname = `${basePath}/uploads`.replace(/\/{2,}/g, '/');
        apiEndpoint.search = '';
        apiEndpoint.hash = '';
        const configuredApiEndpoint = String(getConfig('api_endpoint', CLIENT_CONFIG.apiEndpoint) || '').trim();
        return /^https?:\/\//i.test(configuredApiEndpoint)
            ? apiEndpoint.href
            : apiEndpoint.pathname;
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
        const endpoint = normalizeEndpoint(getConfig('api_endpoint', CLIENT_CONFIG.apiEndpoint));
        const request = new URL(String(path || '/'), endpoint.origin);
        const normalizedPath = request.pathname.startsWith('/server')
            ? request.pathname.slice('/server'.length)
            : request.pathname;
        const basePath = endpoint.pathname.replace(/\/+$/, '');
        const targetPath = `${basePath}/${normalizedPath.replace(/^\/+/, '')}`.replace(
            /\/{2,}/g,
            '/',
        );

        endpoint.pathname = targetPath || '/';
        endpoint.search = request.search;
        endpoint.hash = request.hash;

        const configured = String(getConfig('api_endpoint', CLIENT_CONFIG.apiEndpoint) || '').trim();
        if (/^https?:\/\//i.test(configured)) return endpoint.href;
        return `${endpoint.pathname}${endpoint.search}${endpoint.hash}`;
    }

    function apiServerUrl(path = '/') {
        const endpoint = normalizeEndpoint(getConfig('api_endpoint', CLIENT_CONFIG.apiEndpoint));
        const url = new URL(String(path || '/'), endpoint.origin);
        const configured = String(getConfig('api_endpoint', CLIENT_CONFIG.apiEndpoint) || '').trim();
        if (/^https?:\/\//i.test(configured)) return url.href;
        return `${url.pathname}${url.search}${url.hash}`;
    }

    function apiWebSocketUrl(path = '/realtime') {
        const endpoint = normalizeEndpoint(getConfig('api_endpoint', CLIENT_CONFIG.apiEndpoint));
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
        apiServerUrl,
        userFileUrl,
        apiWebSocketUrl,
    };
    Object.defineProperties(clientConfig, {
        apiEndpoint: { get: () => getConfig('api_endpoint', CLIENT_CONFIG.apiEndpoint) },
        nyaitterJs: { get: () => getConfig('nyaitter_js', '0.1.3') },
        userFileEndpoint: { get: () => getConfig('user_file_endpoint', null) },
        postShareUrl: { get: () => getConfig('post_share_url', null) },
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
