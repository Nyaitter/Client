/*
 * NyaitterClientの公開設定
 *
 * apiEndpoint には、相対パス（例: "/server"）または絶対URL
 * （例: "https://api.example.com/server"）を指定できます。
 * userFileEndpoint には、ユーザーファイルを配信する相対パスまたは絶対URLを指定できます。
 * resourceLinks と widgetLinks の url にはHTTPS URLまたはアプリ内ハッシュURLを指定します。
 */
(() => {
    'use strict';

    const CLIENT_CONFIG = {
        // Nyaitter ServerのAPIルート。静的サイトと同一オリジンで配信する場合は変更不要です。
        apiEndpoint: 'https://api.nyaitter.jp/',

        // ユーザーファイルの公開URLです。R2の公開ドメインなどを使う場合に指定します。
        // 例: '/uploads'、'https://media.example.com'
        // 空文字列の場合、ClientはユーザーファイルのURLを生成しません。
        userFileEndpoint: 'https://files.nyaitter.jp/',

        // 設定画面の「リンク」に表示するリソースです。
        resourceLinks: [
            {
                name: 'Nyaitter(Github)',
                url: 'https://github.com/Nyaitter',
            },
            {
                name: 'サーバー(Github)',
                url: 'https://github.com/nyantorusabu/Server',
            },
            {
                name: 'クライアント(Github)',
                url: 'https://github.com/nyantorusabu/Client',
            },
        ],

        // 右サイドバーに表示するリンクです。
        widgetLinks: [
            {
                name: 'GitHub',
                url: 'https://github.com/Nyaitter',
            },
        ],

        // Cloudflare Turnstileのサイトキーです（例: '0x4AAAAA...'）。
        // 空文字列ならログインモーダルのTurnstileチャレンジは表示されません。
        // サーバー側（TURNSTILE_SECRET_KEY または turnstile.secret）でも設定されている場合のみ、
        // ログインモーダルの認証コード取得にチャレンジ完了が必須になります。
        turnstileSiteKey: '',
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
        if (CLIENT_CONFIG.userFileEndpoint !== null && CLIENT_CONFIG.userFileEndpoint !== undefined) {
            return String(CLIENT_CONFIG.userFileEndpoint).trim();
        }

        const apiEndpoint = normalizeEndpoint(CLIENT_CONFIG.apiEndpoint);
        const basePath = apiEndpoint.pathname.replace(/\/+$/, '');
        apiEndpoint.pathname = `${basePath}/uploads`.replace(/\/{2,}/g, '/');
        apiEndpoint.search = '';
        apiEndpoint.hash = '';
        const configuredApiEndpoint = String(CLIENT_CONFIG.apiEndpoint || '').trim();
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
        const endpoint = normalizeEndpoint(CLIENT_CONFIG.apiEndpoint);
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

        const configured = String(CLIENT_CONFIG.apiEndpoint || '').trim();
        if (/^https?:\/\//i.test(configured)) return endpoint.href;
        return `${endpoint.pathname}${endpoint.search}${endpoint.hash}`;
    }

    function apiServerUrl(path = '/') {
        const endpoint = normalizeEndpoint(CLIENT_CONFIG.apiEndpoint);
        const url = new URL(String(path || '/'), endpoint.origin);
        const configured = String(CLIENT_CONFIG.apiEndpoint || '').trim();
        if (/^https?:\/\//i.test(configured)) return url.href;
        return `${url.pathname}${url.search}${url.hash}`;
    }

    function apiWebSocketUrl(path = '/realtime') {
        const endpoint = normalizeEndpoint(CLIENT_CONFIG.apiEndpoint);
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

    globalThis.NyaitterClientConfig = Object.freeze({
        apiEndpoint: CLIENT_CONFIG.apiEndpoint,
        userFileEndpoint: CLIENT_CONFIG.userFileEndpoint,
        turnstileSiteKey: String(CLIENT_CONFIG.turnstileSiteKey || '').trim(),
        resourceLinks: Object.freeze([...CLIENT_CONFIG.resourceLinks]),
        widgetLinks: Object.freeze([...CLIENT_CONFIG.widgetLinks]),
        apiUrl,
        apiServerUrl,
        userFileUrl,
        apiWebSocketUrl,
    });

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
