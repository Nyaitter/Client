// タブバーの共通部品。
// クリックは安定した親要素への委譲で受けるため、タブバーを再描画しても切替が効く。
// 選択状態は active / is-active を同時に更新し、legacy / nui の両方で表示が一致する。

const boundKeys = new WeakMap();

function isBound(root, key) {
    const keys = boundKeys.get(root);
    return Boolean(keys && keys.has(key));
}

function markBound(root, key) {
    let keys = boundKeys.get(root);
    if (!keys) {
        keys = new Set();
        boundKeys.set(root, keys);
    }
    keys.add(key);
}

/** タブボタンからキーを取り出す。 */
export function getTabKey(button) {
    if (!button) return '';
    return (
        button.dataset.searchTab ||
        button.dataset.tab ||
        button.getAttribute('data-tab-key') ||
        ''
    );
}

/** コンテナ内で指定キーのタブだけを選択状態にする。 */
export function setActiveTab(container, key, options = {}) {
    if (!container) return;
    const {
        tabSelector = '.tab-button',
        activeClasses = ['active', 'is-active'],
        getKey = getTabKey,
    } = options;
    for (const button of container.querySelectorAll(tabSelector)) {
        const isActive = getKey(button) === key;
        for (const className of activeClasses) {
            button.classList.toggle(className, isActive);
        }
    }
}

/**
 * タブバーのクリックを親要素への委譲で束ねる。
 * @param {Element} root 再描画されない親要素（例: ページヘッダー）
 * @param {Object} options
 * @param {string} options.containerSelector タブバーのセレクタ
 * @param {string} [options.tabSelector]
 * @param {string[]} [options.activeClasses]
 * @param {(button: Element) => string} [options.getKey]
 * @param {(key: string, button: Element) => void} [options.onChange]
 * @returns {boolean} 新たに束ねたら true
 */
export function bindTabBar(root, options = {}) {
    const {
        containerSelector,
        tabSelector = '.tab-button',
        activeClasses = ['active', 'is-active'],
        getKey = getTabKey,
        onChange,
    } = options;
    if (!root || !containerSelector) return false;
    if (isBound(root, containerSelector)) return false;

    root.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest(tabSelector);
        if (!button) return;
        const container = button.closest(containerSelector);
        if (!container || !root.contains(container)) return;
        const key = getKey(button);
        if (!key) return;
        event.stopPropagation();
        setActiveTab(container, key, { tabSelector, activeClasses, getKey });
        onChange?.(key, button);
    });
    markBound(root, containerSelector);
    return true;
}
