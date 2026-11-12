import { initApp } from './app.js';
import { i18nReady } from './modules/i18n.js';
import { startNetworkUsageMeter } from './modules/networkUsage.js';
import { initUiMode } from './modules/uiMode.js';

startNetworkUsageMeter();
initUiMode();

function showInitialLoadingScreen() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (!loadingOverlay) return;

    loadingOverlay.classList.remove('hidden');
    loadingOverlay.setAttribute('aria-hidden', 'false');
    loadingOverlay.setAttribute('aria-busy', 'true');
}

function startApp() {
    // 認証状態の取得より前にローディング画面を確実に描画する。
    showInitialLoadingScreen();

    // 言語パックの読み込みを待ってから初期化する（待ち上限を超えたらそのまま起動する）。
    const i18nTimeout = new Promise((resolve) => window.setTimeout(resolve, 3000));
    Promise.race([i18nReady, i18nTimeout]).then(() => window.setTimeout(initApp, 0));
}

let started = false;
const startWhenReady = () => {
    if (started) return;
    started = true;
    startApp();
};

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startWhenReady, { once: true });
    window.addEventListener('load', startWhenReady, { once: true });
    window.setTimeout(startWhenReady, 0);
} else {
    startWhenReady();
}
