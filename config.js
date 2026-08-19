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

    function userFileUrl(fileId = '') {
        const endpoint = normalizeUserFileEndpoint(CLIENT_CONFIG.userFileEndpoint);
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

        const configured = String(CLIENT_CONFIG.userFileEndpoint || '').trim();
        if (/^https?:\/\//i.test(configured)) return endpoint.href;
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
})();
