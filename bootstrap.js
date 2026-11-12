(() => {
    'use strict';
    const lt = (key, params) => globalThis.NyaitterI18n?.t(key, params) ?? String(key || '');

    const config = globalThis.NyaitterClientConfig;
    if (!config) return;

    // 配信ベース配下 (任意のリバースプロキシ接頭辞) でもルート直下の静的アセットを壊さないよう、
    // ページの配信ベース (このスクリプト自身の位置) を基準に相対解決する。
    const pageBaseUrl = new URL('.', document.currentScript?.src || document.baseURI).href;

    function getNyaitterJsUrl() {
        return new URL('nap_modules/nyaitter/nyaitter.js/dist/nyaitter.js', pageBaseUrl).href;
    }

    function getNyaitterUiUrls() {
        return [new URL('nap_modules/nyaitter/nyaitterui/dist/nyaitter-ui.js', pageBaseUrl).href];
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(lt('bootstrap.load_failed', { src })));
            document.head.appendChild(script);
        });
    }

    // 候補を順に試し、最初に読み込めた URL を返す。
    function loadFirst(urls) {
        let index = 0;
        const attempt = () => {
            if (index >= urls.length) return Promise.reject(new Error(lt('bootstrap.no_url')));
            const url = urls[index++];
            return loadScript(url).then(() => url, attempt);
        };
        return attempt();
    }

    function getNyaitterUiCssUrls(scriptUrls) {
        return scriptUrls.map((url) => url.replace(/\.js(?=$|[?#])/, '.css'));
    }

    function loadStylesheet(url) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            link.setAttribute('data-nui-styles', '');
            link.onload = () => resolve();
            link.onerror = () => {
                link.remove();
                reject(new Error(lt('bootstrap.load_failed', { src: link.href })));
            };
            document.head.appendChild(link);
        });
    }

    // CSS は実際に読み込めた JS と同じ配布元/版から選ぶ。CSS失敗はアプリ起動を妨げない。
    function loadNyaitterUi() {
        const scriptUrls = getNyaitterUiUrls();
        return loadFirst(scriptUrls)
            .then((scriptUrl) => loadStylesheet(getNyaitterUiCssUrls([scriptUrl])[0]))
            .catch((error) => {
                console.warn('[nyaitter-ui]', error.message);
            });
    }

    config.ready
        .then(() => loadScript(getNyaitterJsUrl()))
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
