const MANIFEST_URL = new URL('../../manifest.json', import.meta.url).href;
const CACHE_NAME = 'nyaitter-client';
const VERSION_QUERY_TIMEOUT_MS = 2500;
const UPDATE_TIMEOUT_MS = 15000;
const SW_READY_TIMEOUT_MS = 5000;
const CACHE_RETRY_DELAY_MS = 800;
let bound = false;
let checkInFlight = null;

function serviceWorkerApiAvailable() {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !!navigator.serviceWorker;
}

async function isClientUpdateSupported() {
    if (!serviceWorkerApiAvailable()) return false;
    if (navigator.serviceWorker.controller) return true;
    // 対応環境でも登録前は controller が無いため、登録の有無で判定する。
    // Service Worker が無効化された環境 (block 等) では登録が存在しない。
    try {
        return !!(await navigator.serviceWorker.getRegistration());
    } catch (_) {
        return false;
    }
}

async function waitForServiceWorkerReady() {
    if (!serviceWorkerApiAvailable()) return null;
    try {
        return await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((resolve) => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS)),
        ]);
    } catch (_) {
        return null;
    }
}

function getRunningVersion() {
    const value = globalThis.NyaitterClientConfig?.clientVersion;
    return String(value || '').trim();
}

function askServiceWorker(message, timeoutMs = 8000) {
    return new Promise((resolve) => {
        const controller = navigator.serviceWorker?.controller;
        if (!controller) {
            resolve(null);
            return;
        }
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve(null), timeoutMs);
        channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            resolve(event.data || null);
        };
        try {
            controller.postMessage(message, [channel.port2]);
        } catch (_) {
            clearTimeout(timer);
            resolve(null);
        }
    });
}

async function getCachedVersion() {
    const fromWorker = await askServiceWorker(
        { type: 'nyaitter:client-version' },
        VERSION_QUERY_TIMEOUT_MS,
    );
    if (fromWorker && String(fromWorker.version || '').trim()) {
        return String(fromWorker.version).trim();
    }
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(MANIFEST_URL);
        if (!response) return '';
        const manifest = await response.json();
        return String(manifest?.client_version || '').trim();
    } catch (_) {
        return '';
    }
}

async function getNetworkVersion() {
    // SW が有効な間はページからの fetch がキャッシュ済みマニフェストを返してしまうため、
    // SW 自身にサーバー上のマニフェストを読ませる。SW 未制御なら直接取得する。
    const controller = navigator.serviceWorker?.controller;
    const fromWorker = await askServiceWorker(
        { type: 'nyaitter:client-latest' },
        VERSION_QUERY_TIMEOUT_MS,
    );
    if (fromWorker && String(fromWorker.version || '').trim()) {
        return { version: String(fromWorker.version).trim(), unknown: false };
    }
    if (controller) {
        // 古い SW が制御していると、ページからの fetch は (no-store でも) キャッシュ済みの
        // マニフェストを返すため最新判定に使えない。明示的に「不明」として扱う。
        return { version: '', unknown: true };
    }
    try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) return { version: '', unknown: false };
        const manifest = await response.json();
        return { version: String(manifest?.client_version || '').trim(), unknown: false };
    } catch (_) {
        return { version: '', unknown: false };
    }
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value || '—';
}

function setStatus(text) {
    setText('settings-client-status', text);
}

function setUpdateVisible(visible) {
    const button = document.getElementById('settings-client-update');
    // `hidden` 属性は .nui-button の display 指定に負けるため、共通の .hidden で切り替える。
    if (button) button.classList.toggle('hidden', !visible);
}

async function runClientVersionCheck({ announce = false } = {}) {
    const running = getRunningVersion();
    setText('settings-client-version', running);

    if (!(await isClientUpdateSupported())) {
        setText('settings-client-cached', '');
        setText('settings-client-latest', '');
        setStatus('この環境ではクライアントの更新に対応していません。');
        setUpdateVisible(false);
        return;
    }

    if (announce) setStatus('更新を確認しています…');

    const [initialCached, latest] = await Promise.all([getCachedVersion(), getNetworkVersion()]);
    let cached = initialCached;
    if (!cached && navigator.serviceWorker?.controller) {
        // install 直後は APP_SHELL のキャッシュがまだ揃っていないことがあるため、
        // controller がある場合に限り一度だけ待って再取得する（無限リトライはしない）。
        await new Promise((resolve) => setTimeout(resolve, CACHE_RETRY_DELAY_MS));
        cached = await getCachedVersion();
    }
    setText('settings-client-cached', cached);
    setText('settings-client-latest', latest.version);

    if (latest.unknown) {
        setStatus('サーバーのバージョンを確認できませんでした。');
        setUpdateVisible(true);
        return;
    }
    if (!latest.version) {
        setStatus('サーバーに接続できませんでした。オフラインの可能性があります。');
        setUpdateVisible(false);
        return;
    }
    if (!cached) {
        setStatus('このブラウザーにはまだクライアントが保存されていません。');
        setUpdateVisible(true);
        return;
    }
    if (cached !== latest.version) {
        setStatus(`新しいクライアントがあります（保存済み ${cached} → 最新 ${latest.version}）。`);
        setUpdateVisible(true);
        return;
    }
    setStatus('最新のクライアントを使用しています。');
    setUpdateVisible(false);
}

function checkClientVersion(options) {
    // 同時実行は1回にまとめ、連打による重複チェックを防ぐ。
    if (checkInFlight) return checkInFlight;
    checkInFlight = runClientVersionCheck(options).finally(() => {
        checkInFlight = null;
    });
    return checkInFlight;
}

export function bindClientSettings() {
    if (bound) return;
    bound = true;
    document.getElementById('settings-client-check')?.addEventListener('click', () => {
        void checkClientVersion({ announce: true });
    });
    // controller が無い状態で読み込まれた場合でも、SW が claim した時点で再確認する。
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
        void checkClientVersion();
    });
    document.getElementById('settings-client-update')?.addEventListener('click', async (event) => {
        if (!(await isClientUpdateSupported())) {
            // 非対応環境では再読み込みしても更新されないため、何もしない。
            setStatus('この環境ではクライアントの更新に対応していません。');
            setUpdateVisible(false);
            return;
        }

        const button = event.currentTarget;
        button.disabled = true;
        const checkButton = document.getElementById('settings-client-check');
        if (checkButton) checkButton.disabled = true;
        setStatus('更新しています…');

        const controller = navigator.serviceWorker?.controller;
        if (!controller) {
            // 初回起動などでまだ SW が有効でない場合は、登録が完了してから再試行する。
            // 登録が現れなければ再読み込みせず、無駄なリロードループを避ける。
            let ready = null;
            try {
                ready = await Promise.race([
                    navigator.serviceWorker.ready,
                    new Promise((resolve) => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS)),
                ]);
            } catch (_) {}
            if (ready) {
                setStatus('更新しました。再読み込みします…');
                window.setTimeout(() => window.location.reload(), 200);
                return;
            }
            setStatus('更新できませんでした。通信状態を確認して、もう一度お試しください。');
            button.disabled = false;
            if (checkButton) checkButton.disabled = false;
            return;
        }
        const result = await askServiceWorker({ type: 'nyaitter:client-update' }, UPDATE_TIMEOUT_MS);
        if (!result?.ok) {
            setStatus('更新できませんでした。通信状態を確認して、もう一度お試しください。');
            button.disabled = false;
            if (checkButton) checkButton.disabled = false;
            return;
        }
        setStatus('更新しました。再読み込みします…');
        window.setTimeout(() => window.location.reload(), 200);
    });
}

export async function loadClientSettings() {
    bindClientSettings();
    await globalThis.NyaitterClientConfig?.ready;
    // 初回は SW の install 完了前にキャッシュ確認が走り「未保存」と誤表示することがあるため、
    // 対応環境では ready を上限付きで待ってから最初の確認を行う。
    await waitForServiceWorkerReady();
    await checkClientVersion();
}
