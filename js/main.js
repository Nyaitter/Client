import { initApp } from './app.js';

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

    // 初期ローディング画面を描画した後に初期化を開始する。
    window.setTimeout(initApp, 0);
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
