(() => {
    'use strict';

    const config = globalThis.NyaitterClientConfig;
    if (!config) return;

    // 配信ベース配下 (任意のリバースプロキシ接頭辞) でもルート直下の静的アセットを壊さないよう、
    // ページの配信ベース (このスクリプト自身の位置) を基準に相対解決する。
    const pageBaseUrl = new URL('.', document.currentScript?.src || document.baseURI).href;
    const localNyaitterUiUrl = new URL('nyaitter-ui/nyaitter-ui.js', pageBaseUrl).href;

    function getNyaitterJsUrl(value) {
        const source = String(value || '').trim();
        if (/^(?:https?:)?\/\//i.test(source)) return source;
        const version = source || 'latest';
        return `https://cdn.jsdelivr.net/npm/nyaitter.js@${encodeURIComponent(version)}/dist/nyaitter.js`;
    }

    // NyaitterUI は npm パッケージを CDN から読む。CDN に到達できない場合のみ、
    // 開発用に配信ベース配下 (nyaitter-ui/) のビルドへフォールバックする。
    function getNyaitterUiUrls(value) {
        const source = String(value || '').trim();
        if (/^(?:https?:)?\/\//i.test(source)) return [source, localNyaitterUiUrl];
        const version = source || 'latest';
        return [
            `https://cdn.jsdelivr.net/npm/nyaitter-ui@${encodeURIComponent(version)}/dist/nyaitter-ui.js`,
            localNyaitterUiUrl,
        ];
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`${src} の読み込みに失敗しました。`));
            document.head.appendChild(script);
        });
    }

    // 候補を順に試し、最初に読み込めた URL を返す。
    function loadFirst(urls) {
        let index = 0;
        const attempt = () => {
            if (index >= urls.length) return Promise.reject(new Error('読み込める URL がありませんでした。'));
            const url = urls[index++];
            return loadScript(url).then(() => url, attempt);
        };
        return attempt();
    }

    // NyaitterUI は無くてもページは動かす (スタイルが当たらないだけ)。
    function loadNyaitterUi() {
        return loadFirst(getNyaitterUiUrls(config.nyaitterUi))
            .then((url) => {
                const cssUrl = url.replace(/\.js(?=$|[?#])/, '.css');
                if (globalThis.NyaitterUI?.injectStyles) {
                    globalThis.NyaitterUI.injectStyles(cssUrl);
                    return;
                }
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = cssUrl;
                document.head.appendChild(link);
            })
            .catch((error) => {
                console.warn('[nyaitter-ui]', error.message);
            });
    }

    config.ready
        .then(() => loadScript(getNyaitterJsUrl(config.nyaitterJs)))
        .then(() => {
            const endpoint = new URL(config.apiEndpoint, window.location.href);
            const client = new globalThis.Nyaitter.NyaitterClient({
                baseUrl: `${endpoint.origin}${endpoint.pathname.replace(/\/+$/, '')}`,
            });
            globalThis.NyaitterClientInstance = client;
        })
        .then(() => loadNyaitterUi())
        .then(() => loadScript('./login.js'))
        .then(() => import('./js/main.js'))
        .catch((error) => {
            window.dispatchEvent(new CustomEvent('nyaitter-bootstrap-error', { detail: error }));
        });
})();
