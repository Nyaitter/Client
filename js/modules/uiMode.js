// NyaitterUI と LegacyUI を設定で切り替える状態管理。
// 実効モードを document.documentElement の data-nyaitter-ui に反映し、
// NyaitterUI 付属スタイルと data-nui マークアップ層を有効/無効にする。
//
// 永続化はサーバー（user.settings.ui_mode）に一本化する。localStorage は使わない。
// 優先順位: ユーザー設定 > サーバー既定 (client_config.ui.uiMode) > 'nui'。

const UI_MODES = Object.freeze(['nui', 'legacy']);
const DEFAULT_UI_MODE = 'nui';

// NyaitterUI.enhance が data-nui から付与するクラス。
// legacy では data-nui を残したまま、このクラスだけを外す。
const NUI_CLASS_BY_KIND = Object.freeze({
    page: 'nui-page',
    'page-heading': 'nui-page-heading',
    section: 'nui-section',
    card: 'nui-card',
    list: 'nui-list',
    'list-item': 'nui-list-item',
    nav: 'nui-nav',
    'nav-item': 'nui-nav-item',
    split: 'nui-split',
    toolbar: 'nui-toolbar',
    tabs: 'nui-tabs',
    form: 'nui-form',
    field: 'nui-field',
    heading: 'nui-heading',
    badge: 'nui-badge',
    avatar: 'nui-avatar',
    icon: 'nui-icon',
    button: 'nui-button',
    'button-secondary': 'nui-button-secondary',
    'button-danger': 'nui-button-danger',
    'empty-text': 'nui-empty-text',
});

const NUI_STYLE_SELECTOR =
    'link[rel="stylesheet"][data-nui-styles], link[rel="stylesheet"][href*="nyaitter-ui"]';

let activeMode = null;
// ユーザー設定 (user.settings.ui_mode) による明示選択。未設定なら null。
let userMode = null;
// サーバー既定 (client_config.ui.uiMode)。未取得なら null。
let serverDefaultMode = null;
let headObserver = null;
const listeners = new Set();

function normalizeUiMode(value) {
    return UI_MODES.includes(value) ? value : null;
}

// 優先順位: ユーザー設定 > サーバー既定 > 'nui'
function desiredMode() {
    return userMode || serverDefaultMode || DEFAULT_UI_MODE;
}

function getNyaitterUI() {
    return typeof globalThis !== 'undefined' ? globalThis.NyaitterUI : undefined;
}

function eachNuiStyleLink(callback) {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    for (const link of document.querySelectorAll(NUI_STYLE_SELECTOR)) callback(link);
}

function setNuiStylesEnabled(enabled) {
    eachNuiStyleLink((link) => {
        link.disabled = !enabled;
    });
}

// 起動後に注入される NyaitterUI スタイルにも現在のモードを適用する。
function ensureHeadObserver() {
    if (headObserver || typeof document === 'undefined') return;
    if (typeof MutationObserver === 'undefined') return;
    if (!document.head) return;
    headObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches?.(NUI_STYLE_SELECTOR)) node.disabled = activeMode !== 'nui';
                for (const link of node.querySelectorAll?.(NUI_STYLE_SELECTOR) || []) {
                    link.disabled = activeMode !== 'nui';
                }
            }
        }
    });
    headObserver.observe(document.head, { childList: true, subtree: true });
}

function downgradeNuiClasses(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    for (const element of root.querySelectorAll('[data-nui]')) {
        const className = NUI_CLASS_BY_KIND[element.dataset?.nui];
        if (className) element.classList.remove(className);
    }
}

function applyUiMode(mode) {
    if (typeof document === 'undefined') return;
    if (document.documentElement) {
        document.documentElement.dataset.nyaitterUi = mode;
    }
    const api = getNyaitterUI();
    if (mode === 'nui') {
        setNuiStylesEnabled(true);
        api?.enhance?.(document);
        api?.start?.();
        return;
    }
    api?.stop?.();
    setNuiStylesEnabled(false);
    downgradeNuiClasses(document);
}

function notify(mode) {
    for (const listener of [...listeners]) {
        try {
            listener(mode);
        } catch (error) {
            console.error('[ui-mode] listener failed:', error);
        }
    }
}

// 現在の優先順位から実効モードを算出し、DOM へ反映する。
function commit() {
    const mode = desiredMode();
    const previous = activeMode;
    activeMode = mode;
    applyUiMode(mode);
    if (previous !== mode) notify(mode);
    return mode;
}

/** 現在の実効モードを返す。未初期化でもユーザー設定/サーバー既定/既定値を返す。 */
export function getUiMode() {
    return activeMode || desiredMode();
}

/** モード変更を購読する。解除関数を返す。 */
export function onUiModeChange(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * モードをユーザーの明示選択として設定し、DOM へ即時反映する。
 * 永続化は行わない（設定画面の保存経路が settings.ui_mode を保存する）。
 */
export function setUiMode(mode) {
    const normalized = normalizeUiMode(mode);
    if (!normalized) return getUiMode();
    userMode = normalized;
    return commit();
}

/** 起動時に呼ぶ。保存済みの選択は無いため、まず既定値 (nui) で即時反映する。 */
export function initUiMode() {
    ensureHeadObserver();
    return commit();
}

/**
 * サーバー既定 (client_config.ui.uiMode) を保持する。
 * ユーザー設定があればそちらが優先される。
 */
export function applyServerUiMode(serverDefault) {
    serverDefaultMode = normalizeUiMode(serverDefault);
    return commit();
}

/**
 * アカウント設定 (user.settings.ui_mode) を反映する。ユーザーの明示選択として扱う。
 * 未設定 (null/undefined) ならユーザー設定を解除し、サーバー既定へフォールバックする。
 */
export function applyUserUiMode(userSetting) {
    userMode = normalizeUiMode(userSetting);
    return commit();
}
