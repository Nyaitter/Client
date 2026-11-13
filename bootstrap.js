(() => {
    'use strict';
    const lt = (key, params) => globalThis.NyaitterI18n?.t(key, params) ?? String(key || '');

    const config = globalThis.NyaitterClientConfig;
    if (!config) return;

    // 配信ベース配下 (任意のリバースプロキシ接頭辞) でもルート直下の静的アセットを壊さないよう、
    // ページの配信ベース (このスクリプト自身の位置) を基準に相対解決する。
    const pageBaseUrl = new URL('.', document.currentScript?.src || document.baseURI).href;

    // アプリのスタイルシート。index.html には含めず、起動時にここから読み込む。
    // 版のキャッシュが有効なときは Service Worker がその版のものを返す。
    const APP_STYLESHEETS = [
        'css/variables.css',
        'css/core.css',
        'css/components.css',
        'css/timeline.css',
        'css/markdownFeature.css',
        'css/interaction.css',
        'css/social.css',
        'css/callFeature.css',
        'css/settings.css',
        'css/misc.css',
        'css/adaptive.css',
        'css/rankAvatar.css',
    ];

    const RELOAD_GUARD_KEY = 'nyaitter-client-boot-reloaded';
    const ALWAYS_LATEST_KEY = 'nyaitter-always-latest';
    const SW_READY_TIMEOUT_MS = 10000;

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

    function loadAppStylesheets() {
        for (const path of APP_STYLESHEETS) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = new URL(path, pageBaseUrl).href;
            document.head.appendChild(link);
        }
    }

    function setBootStatus(text) {
        const element = document.getElementById('boot-status');
        if (element) element.textContent = text || '';
    }

    function setBootProgress(fraction) {
        const wrap = document.getElementById('boot-progress');
        const bar = document.getElementById('boot-progress-bar');
        if (!wrap || !bar) return;
        if (fraction == null) {
            wrap.hidden = true;
            return;
        }
        wrap.hidden = false;
        const clamped = Math.min(1, Math.max(0, fraction || 0));
        bar.style.width = `${Math.round(clamped * 100)}%`;
    }

    function guardGet(key) {
        try {
            return window.sessionStorage.getItem(key);
        } catch (_) {
            return null;
        }
    }

    function guardSet(key, value) {
        try {
            window.sessionStorage.setItem(key, value);
        } catch (_) {}
    }

    // 再読み込み後のナビゲーションを Service Worker が受け持てるよう、先に登録して有効化を待つ。
    function registerShellServiceWorker() {
        if (!('serviceWorker' in navigator)) return Promise.resolve(null);
        let pending;
        try {
            pending = navigator.serviceWorker.register(new URL('sw.js', pageBaseUrl).href, { scope: pageBaseUrl });
        } catch (_) {
            return Promise.resolve(null);
        }
        return pending.then((registration) => {
            if (!registration || registration.active) return registration;
            const worker = registration.installing || registration.waiting;
            if (!worker) return registration;
            return new Promise((resolve) => {
                const timer = setTimeout(() => resolve(registration), SW_READY_TIMEOUT_MS);
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'activated') {
                        clearTimeout(timer);
                        resolve(registration);
                    }
                });
            });
        }).catch(() => null);
    }

    // 起動できる版がキャッシュにあるかを確認し、無ければ最新の正式版を取得して格納する。
    // 'fetched' と 'reloading' のときは読み直す。'failed' のときは版を取得できなかった。
    function alwaysUseLatest() {
        try {
            return window.localStorage.getItem(ALWAYS_LATEST_KEY) !== '0';
        } catch (_) {
            return true;
        }
    }

    async function fetchLatestAndStore(page) {
        const PHASE_COUNT = 3;
        let phaseIndex = 0;
        let lastSizeLabel = '';
        const setOverall = (fraction) => {
            const clamped = Math.min(1, Math.max(0, fraction || 0));
            setBootProgress((phaseIndex + clamped) / PHASE_COUNT);
        };
        try {
            setBootStatus(lt('settings.client.downloading'));
            setBootProgress(0);
            const result = await page.fetchLatest({
                onProgress: (progress) => {
                    if (progress.phase === 'unpack') {
                        phaseIndex = 1;
                        setBootStatus(lt('settings.client.unpacking'));
                        setOverall(progress.total ? progress.fetched / progress.total : 0);
                        return;
                    }
                    phaseIndex = 0;
                    if (progress.bytesTotal) {
                        const label = `${(progress.bytes / 1048576).toFixed(1)} MB / ${(progress.bytesTotal / 1048576).toFixed(1)} MB`;
                        if (label !== lastSizeLabel) {
                            lastSizeLabel = label;
                            setBootStatus(lt('settings.client.downloading_size', { size: label }));
                        }
                        setOverall(progress.bytes / progress.bytesTotal);
                    } else if (progress.bytes) {
                        const label = `${(progress.bytes / 1048576).toFixed(1)} MB`;
                        if (label !== lastSizeLabel) {
                            lastSizeLabel = label;
                            setBootStatus(lt('settings.client.downloading_size', { size: label }));
                        }
                    } else if (progress.total) {
                        setBootStatus(lt('settings.client.downloading'));
                        setOverall((progress.fetched + progress.cached) / progress.total);
                    }
                },
            });
            phaseIndex = 2;
            setBootStatus(lt('settings.client.saving'));
            await page.store(result, {
                onProgress: ({ done, total }) => {
                    if (total) setOverall(done / total);
                },
            });
            setBootProgress(1);
            await page.activate(result.versionId);
            return true;
        } catch (_) {
            setBootStatus('');
            setBootProgress(null);
            return false;
        }
    }

    async function ensureStoredVersion() {
        const source = String(config.clientNap || '').trim();
        if (!source) return 'failed';
        if (typeof caches === 'undefined') return 'failed';
        let page;
        try {
            const mod = await import(new URL('nap_modules/nyaitter/nap/client/nap-page.js', pageBaseUrl).href);
            page = mod.createNapPage({ source });
        } catch (_) {
            return 'failed';
        }
        let stored = [];
        try {
            stored = await page.storedVersions();
        } catch (_) {
            return 'failed';
        }
        if (stored.length) {
            if (alwaysUseLatest()) {
                let entries = null;
                try {
                    entries = await page.versions();
                } catch (_) {
                    entries = null;
                }
                if (entries) {
                    const formal = entries.filter((entry) => !entry.tag);
                    const latestFormal = formal.length ? formal[formal.length - 1] : null;
                    const storedFormal = formal.some((entry) => stored.includes(entry.id));
                    if (latestFormal && storedFormal && !stored.includes(latestFormal.id)) {
                        await registerShellServiceWorker();
                        if (await fetchLatestAndStore(page)) return 'fetched';
                        setBootStatus('');
                    }
                }
            }
            // 格納済みの版があっても、このページが Service Worker に制御されていないと
            // 版からは配信されない。登録して一度だけ読み直す。
            if (!navigator.serviceWorker?.controller && guardGet(RELOAD_GUARD_KEY) !== '1') {
                guardSet(RELOAD_GUARD_KEY, '1');
                await registerShellServiceWorker();
                return 'reloading';
            }
            return 'ready';
        }
        await registerShellServiceWorker();
        if (await fetchLatestAndStore(page)) return 'fetched';
        return 'failed';
    }

    function showBootFailure() {
        setBootProgress(null);
        setBootStatus(lt('error.connection.body'));
        const button = document.getElementById('boot-retry-btn');
        if (button) {
            button.hidden = false;
            button.addEventListener('click', () => window.location.reload(), { once: true });
        }
    }

    function startApp() {
        loadAppStylesheets();
        return loadScript(getNyaitterJsUrl())
            .then(() => {
                const endpoint = new URL(config.apiEndpoint, window.location.href);
                const client = new globalThis.Nyaitter.NyaitterClient({
                    baseUrl: `${endpoint.origin}${endpoint.pathname.replace(/\/+$/, '')}`,
                });
                globalThis.NyaitterClientInstance = client;
            })
            .then(() => loadNyaitterUi())
            .then(() => loadScript('./login.js'))
            .then(() => import('./js/main.js'));
    }

    config.ready
        .then(() => globalThis.NyaitterI18n?.ready)
        .then(() => ensureStoredVersion())
        .then((mode) => {
            if (mode === 'fetched' || mode === 'reloading') {
                window.location.reload();
                return new Promise(() => {});
            }
            if (mode === 'failed') {
                showBootFailure();
                return new Promise(() => {});
            }
            return startApp();
        })
        .catch((error) => {
            window.dispatchEvent(new CustomEvent('nyaitter-bootstrap-error', { detail: error }));
        });
})();
