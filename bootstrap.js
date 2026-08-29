(() => {
    'use strict';

    const config = globalThis.NyaitterClientConfig;
    if (!config) return;

    function getNyaitterJsUrl(value) {
        const source = String(value || '').trim();
        if (/^(?:https?:)?\/\//i.test(source)) return source;
        const version = source || 'latest';
        return `https://cdn.jsdelivr.net/npm/nyaitter.js@${encodeURIComponent(version)}/dist/nyaitter.js`;
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

    config.ready
        .then(() => loadScript(getNyaitterJsUrl(config.nyaitterJs)))
        .then(() => {
            const endpoint = new URL(config.apiEndpoint, window.location.href);
            const client = new globalThis.Nyaitter.NyaitterClient({
                baseUrl: `${endpoint.origin}${endpoint.pathname.replace(/\/+$/, '')}`,
            });
            globalThis.NyaitterClientInstance = client;
        })
        .then(() => loadScript('./login.js'))
        .then(() => import('./js/main.js'))
        .catch((error) => {
            window.dispatchEvent(new CustomEvent('nyaitter-bootstrap-error', { detail: error }));
        });
})();
