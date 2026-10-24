import { DOM } from '../dom.js';
import { api, apiRequest } from '../api.js';
import {
    getCurrentUser,
    setCurrentUser,
    getNewIconDataUrl,
    setNewIconDataUrl,
    getResetIconToDefault,
    setResetIconToDefault,
    getNewHeaderDataUrl,
    setNewHeaderDataUrl,
    getResetHeaderToDefault,
    setResetHeaderToDefault,
    getSettingsSaveInFlight,
    setSettingsSaveInFlight,
    getSettingsSaveQueued,
    setSettingsSaveQueued,
    getPublicProfileCache,
    getAllUsersCache,
} from '../state.js';
import {
    cacheUser,
    invalidateTimelinePageCache,
    invalidateDmCaches,
    invalidateCachesAfterUserIdReassignment,
} from '../modules/cache.js';
import {
    applyInterfaceTheme,
    applyColorTheme,
    normalizeColorTheme,
    getSafeColorPalette,
    getCustomColorsFromInputs,
    HEX_COLOR_PATTERN,
} from '../modules/theme.js';
import {
    togglePushSubscription,
    loadPushSettingsState,
} from '../modules/pwa.js';
import {
    updateAccountData,
    openAccountSwitcherModal,
    handleLogout,
    checkSession,
} from '../modules/auth.js';
import { updateNavAndSidebars } from '../modules/sidebar.js';
import { applyDataSaverRealtimePreference, unsubscribeFromChanges } from '../modules/realtime.js';
import { refreshMarkdownContentEditors } from '../modules/editor.js';
import { router } from '../router.js';
import {
    getSettingsGroupFromHash,
    normalizeDmInvitation,
    SETTINGS_GROUP_DETAILS,
} from './settings/config.js';
import { readSettingsForm } from './settings/formModel.js';
import { rebuildSettings, bindSettingsDiscovery, showSettingsSaveStatus, bindSettingsNetworkUsage } from './settings/redesign.js';
import { ALL_HOME_TABS, DEFAULT_HOME_TABS, getSavedHomeTabs } from './settings/homeTabs.js';
import {
    ALL_SIDEBAR_ITEMS,
    SIDEBAR_ITEM_KEYS,
    DEFAULT_SIDEBAR,
    getSavedSideMenu,
    writeSideMenuMirror,
} from '../modules/sidebarItems.js';
import { getActiveScreenContext, showScreenCompat } from '../screenManager.js';
import { uploadFileViaEdgeFunction, deleteFilesViaEdgeFunction } from '../modules/posts.js';
import {
    escapeHTML,
    getUserIconUrl,
    getUserHeaderImageUrl,
    getSafeHttpUrl,
    copyTextToClipboard,
    formatSecurityTimestamp,
    formatNyaitterId,
    normalizePostTimestampFormat,
    applyServerInputLimits,
    showLoading,
    showAppAlert,
    showAppConfirm,
} from '../utils/helpers.js';
import { getUiMode, setUiMode, applyUserUiMode } from '../modules/uiMode.js';
import { loadClientSettings } from '../modules/clientVersion.js';

// login.js（クラシックスクリプト）からもアプリ共通ダイアログを利用できるように橋渡しする。
if (typeof globalThis.showAppAlert !== 'function') {
    globalThis.showAppAlert = showAppAlert;
}

let linkSuccessListenerBound = false;

const { apiUrl, turnstileSiteKey } = globalThis.NyaitterClientConfig || {};

function loadTurnstileScript() {
    return new Promise((resolve, reject) => {
        if (window.turnstile) {
            resolve();
            return;
        }
        const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('Turnstileの読み込みに失敗しました。')), { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Turnstileの読み込みに失敗しました。'));
        document.head.appendChild(script);
    });
}

function getTurnstileSiteKey() {
    return String(
        turnstileSiteKey ||
        globalThis.NyaitterClientConfig?.turnstileSiteKey ||
        globalThis.NyaitterServerStatus?.turnstile?.sitekey ||
        globalThis.NyaitterServerStatus?.turnstile?.siteKey ||
        ''
    ).trim();
}

async function requestTurnstileTokenModal() {
    const siteKey = getTurnstileSiteKey();
    if (!siteKey) return null;

    try {
        await loadTurnstileScript();
    } catch (e) {
        console.error('Turnstile load error:', e);
        return null;
    }

    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
            <div class="modal-content nui-modal" style="max-width: 360px; padding: 1.5rem; text-align: center;">
                <button type="button" class="modal-close-btn" aria-label="閉じる">×</button>
                <h3 style="margin-top: 0; margin-bottom: 0.5rem; font-size: 1.1rem;">セキュリティ確認</h3>
                <p class="settings-help-text nui-help-text" style="margin-bottom: 1.25rem;">続行するには認証を完了してください。</p>
                <div id="settings-turnstile-container" style="display: flex; justify-content: center; min-height: 65px;"></div>
            </div>
        `;
        document.body.appendChild(modal);

        let resolved = false;
        const cleanup = (token = null) => {
            if (resolved) return;
            resolved = true;
            modal.remove();
            resolve(token);
        };

        modal.querySelector('.modal-close-btn')?.addEventListener('click', () => cleanup(null));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cleanup(null);
        });

        const container = modal.querySelector('#settings-turnstile-container');
        try {
            window.turnstile.render(container, {
                sitekey: siteKey,
                theme: 'auto',
                callback: (token) => {
                    // チャレンジ成功時に自動でクローズ
                    cleanup(token);
                },
                'expired-callback': () => {},
                'error-callback': () => cleanup(null),
            });
        } catch (err) {
            console.error('Turnstile render error:', err);
            cleanup(null);
        }
    });
}

export function saveHomeTabs(tabs) {
    const validKeys = ALL_HOME_TABS.map((t) => t.key);
    const sanitized = (Array.isArray(tabs) ? tabs : [])
        .filter((k) => validKeys.includes(k));
    const finalTabs = sanitized.length > 0 ? sanitized : [...DEFAULT_HOME_TABS];

    const user = getCurrentUser();
    const userId = user?.id ?? 'guest';
    try {
        localStorage.setItem(`nyaitter_home_tabs_${userId}`, JSON.stringify(finalTabs));
    } catch (_) {}

    if (user) {
        if (!user.settings) user.settings = {};
        user.settings.home_tabs = finalTabs;
        requestSettingsSave();
    }
}

export function saveSideMenu(outlet, zones) {
    if (outlet !== 'pc' && outlet !== 'mobile') return;

    // 不明キーと重複を落とし、同じキーが両ゾーンにあればbar側を優先する
    const seen = new Set();
    const pickKeys = (keys) => (Array.isArray(keys) ? keys : []).filter((key) => {
        if (!SIDEBAR_ITEM_KEYS.includes(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const bar = pickKeys(zones?.bar);
    const more = pickKeys(zones?.more);

    // どちらのゾーンにも無い項目はバー末尾に補完し、項目を落とさない
    SIDEBAR_ITEM_KEYS.forEach((key) => {
        if (seen.has(key)) return;
        seen.add(key);
        bar.push(key);
    });

    const next = { ...getSavedSideMenu(), [outlet]: { bar, more } };

    const user = getCurrentUser();
    const userId = user?.id ?? 'guest';
    writeSideMenuMirror(userId, next);

    if (user) {
        if (!user.settings) user.settings = {};
        user.settings.side_menu = next;
        requestSettingsSave();
    }
}

export function imageDataUrlToFile(dataUrl) {
    const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(
        String(dataUrl || ''),
    );
    if (!match) {
        throw new Error('画像の形式が正しくありません。');
    }

    const mimeType = match[1].toLowerCase();
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    const extension = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
    }[mimeType] || 'png';
    return new File([bytes], `upload.${extension}`, { type: mimeType });
}

export function requestSettingsSave(
    form = document.getElementById('settings-form'),
    context = getActiveScreenContext(),
) {
    if (!getCurrentUser() || !form) return;
    if (getSettingsSaveInFlight()) {
        setSettingsSaveQueued(true);
        return;
    }
    void saveSettings(form, context);
}

export async function saveSettings(form, context = getActiveScreenContext()) {
    if (!getCurrentUser() || !form) return;
    if (!form.reportValidity()) return;

    setSettingsSaveInFlight(true);
    showSettingsSaveStatus(form, 'saving');

    try {
        const updatedData = readSettingsForm(form, getCurrentUser().settings || {});
        if (!updatedData.name) throw new Error('ユーザー名は必須です。');

        const previousStoredFileIds = new Set();
        const uploadedFileIds = [];
        const previousStoredIconId =
            typeof getCurrentUser().icon_data === 'string' &&
            !getCurrentUser().icon_data.startsWith('data:image')
                ? getCurrentUser().icon_data
                : null;
        const previousStoredHeaderId =
            typeof getCurrentUser().header_image === 'string' &&
            !getCurrentUser().header_image.startsWith('data:image')
                ? getCurrentUser().header_image
                : null;

        try {
            if (getResetIconToDefault()) {
                updatedData.icon_data = null;
                if (previousStoredIconId) previousStoredFileIds.add(previousStoredIconId);
            } else if (getNewIconDataUrl()) {
                const fileId = await uploadFileViaEdgeFunction(
                    imageDataUrlToFile(getNewIconDataUrl()),
                    { replaceId: previousStoredIconId },
                );
                if (!previousStoredIconId) uploadedFileIds.push(fileId);
                updatedData.icon_data = fileId;
            }
            if (getResetHeaderToDefault()) {
                updatedData.header_image = null;
                if (previousStoredHeaderId) previousStoredFileIds.add(previousStoredHeaderId);
            } else if (getNewHeaderDataUrl()) {
                const fileId = await uploadFileViaEdgeFunction(
                    imageDataUrlToFile(getNewHeaderDataUrl()),
                    { replaceId: previousStoredHeaderId },
                );
                if (!previousStoredHeaderId) uploadedFileIds.push(fileId);
                updatedData.header_image = fileId;
            }
        } catch (error) {
            if (uploadedFileIds.length > 0) await deleteFilesViaEdgeFunction(uploadedFileIds);
            throw error;
        }

        let data;
        try {
            const response = await api
                .from('user')
                .update(updatedData)
                .select()
                .single();
            data = response.data;
            if (response.error) throw response.error;
        } catch (error) {
            if (uploadedFileIds.length > 0) await deleteFilesViaEdgeFunction(uploadedFileIds);
            throw error;
        }
        if (previousStoredFileIds.size > 0) {
            await deleteFilesViaEdgeFunction([...previousStoredFileIds]);
        }

        if (!data || typeof data !== 'object') {
            throw new Error('サーバーから更新後の設定を取得できませんでした。');
        }
        if (context?.signal?.aborted) return;
        const updatedUser = {
            ...getCurrentUser(),
            ...data,
            settings: {
                ...(getCurrentUser().settings || {}),
                ...(data.settings || {}),
            },
        };
        setCurrentUser(updatedUser);
        cacheUser(updatedUser);
        getPublicProfileCache().delete(Number(updatedUser.id));
        updateAccountData(updatedUser);
        applyInterfaceTheme(updatedUser.settings?.theme || 'light');
        applyColorTheme(updatedUser.settings || {});
        applyUserUiMode(updatedUser.settings?.ui_mode);
        applyDataSaverRealtimePreference();
        refreshMarkdownContentEditors();
        await updateNavAndSidebars();
        setNewIconDataUrl(null);
        setResetIconToDefault(false);
        setNewHeaderDataUrl(null);
        setResetHeaderToDefault(false);
        showSettingsSaveStatus(form, 'saved');
    } catch (error) {
        if (context?.signal?.aborted) return;
        console.error('設定の自動保存に失敗:', error);
        showSettingsSaveStatus(form, 'error');
    } finally {
        setSettingsSaveInFlight(false);
        if (getSettingsSaveQueued() && !context?.signal?.aborted) {
            setSettingsSaveQueued(false);
            requestSettingsSave(form, context);
        } else if (context?.signal?.aborted) {
            setSettingsSaveQueued(false);
        }
    }
}

export async function showSettingsScreen(
    initialGroup = getSettingsGroupFromHash(),
    showScreenFn = null,
    context = {},
) {
    // 呼び出し元によっては { group } 形式で渡される。
    if (initialGroup && typeof initialGroup === 'object') {
        initialGroup = initialGroup.group || getSettingsGroupFromHash();
    }
    if (!getCurrentUser()) {
        window.location.hash = '#';
        return;
    }
    DOM.pageHeader.innerHTML = `<h2 id="page-title">設定</h2>`;
    showScreenCompat('settings-screen', showScreenFn);
    const settingsScreenContext = getActiveScreenContext();

    const bottomNav = document.getElementById('left-nav');
    const updateSettingsInset = () => {
        const inset = bottomNav && getComputedStyle(bottomNav).position === 'fixed'
            ? bottomNav.offsetHeight : 0;
        DOM.mainContent.style.setProperty('--settings-bottom-inset', `${inset}px`);
    };
    const bottomNavObserver = bottomNav && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateSettingsInset) : null;
    bottomNavObserver?.observe(bottomNav);
    window.addEventListener('resize', updateSettingsInset, { passive: true });
    updateSettingsInset();
    settingsScreenContext?.addCleanup(() => {
        bottomNavObserver?.disconnect();
        window.removeEventListener('resize', updateSettingsInset);
        DOM.mainContent.style.removeProperty('--settings-bottom-inset');
    });

    setNewIconDataUrl(null);
    setResetIconToDefault(false);
    setNewHeaderDataUrl(null);
    setResetHeaderToDefault(false);

    document.getElementById('settings-screen').innerHTML = `
        <div class="settings-layout nui-split" data-nui="split">
            <nav class="settings-group-list nui-nav" aria-label="設定グループ" data-nui="nav">
                <a href="#settings/profile" class="settings-group-button nui-nav-item" data-nui="nav-item" data-settings-group="profile">プロフィール</a>
                <a href="#settings/home" class="settings-group-button nui-nav-item" data-nui="nav-item" data-settings-group="home">ホーム</a>
                <a href="#settings/privacy" class="settings-group-button nui-nav-item" data-nui="nav-item" data-settings-group="privacy">プライバシーとセキュリティ</a>
                <a href="#settings/ui" class="settings-group-button nui-nav-item" data-nui="nav-item" data-settings-group="ui">UI / フォント</a>
                <a href="#settings/notifications" class="settings-group-button nui-nav-item" data-nui="nav-item" data-settings-group="notifications">通知</a>
                <a href="#settings/storage" class="settings-group-button nui-nav-item" data-nui="nav-item" data-settings-group="storage">ストレージ</a>
                <a href="#settings/apps" class="settings-group-button nui-nav-item" data-nui="nav-item" data-settings-group="apps">連携アプリ</a>
                <a href="#settings/api" class="settings-group-button nui-nav-item" data-nui="nav-item" data-settings-group="api">API / Bot</a>
                <a href="#settings/imposter" class="settings-group-button nui-nav-item" data-nui="nav-item" data-settings-group="imposter">インポスター</a>
                <a href="#settings/resources" class="settings-group-button nui-nav-item" data-nui="nav-item" data-settings-group="resources">リソース</a>
            </nav>
            <form id="settings-form" class="settings-detail nui-form" data-nui="form">
                <div class="settings-detail-heading nui-section-heading">
                    <h3 id="settings-group-title" class="nui-section-title">プロフィール</h3>
                    <p id="settings-group-description" class="settings-group-description nui-help-text">プロフィールに表示される情報と画像を設定します。</p>
                </div>
                <section class="nui-section settings-group-panel" data-settings-panel="home" hidden>
                    <div class="home-tabs-customizer">
                        <div class="home-tabs-section nui-card" data-nui="card">
                            <h4 class="home-tabs-section-title nui-section-title">利用可能なタブ</h4>
                            <p class="settings-help-text nui-help-text">下側の有効なタブにドラッグするか、「＋」ボタンを押して追加できます。</p>
                            <div id="home-tabs-available-list" class="home-tabs-list home-tabs-available-list nui-list" data-nui="list" data-zone="available"></div>
                        </div>

                        <div class="home-tabs-divider">
                            <span class="home-tabs-divider-icon">⇅</span>
                        </div>

                        <div class="home-tabs-section nui-card" data-nui="card">
                            <h4 class="home-tabs-section-title nui-section-title">有効なタブ</h4>
                            <p class="settings-help-text nui-help-text">ドラッグして並び替えたり、「×」ボタンで削除できます。</p>
                            <div id="home-tabs-active-list" class="home-tabs-list home-tabs-active-list nui-list" data-nui="list" data-zone="active"></div>
                        </div>
                        <button type="button" id="reset-home-tabs-btn" class="settings-secondary-button nui-button-secondary" style="align-self: flex-start;">デフォルトの並び順に戻す</button>
                    </div>
                </section>
                <section class="nui-section settings-group-panel" data-settings-panel="menu" hidden>
                    <div class="side-menu-outlet-tabs nui-tabs" role="tablist" aria-label="メニューの種類の選択" data-nui="tabs">
                        <button type="button" role="tab" id="side-menu-tab-pc" class="side-menu-outlet-tab nui-tab" data-outlet="pc" aria-selected="true" aria-controls="side-menu-pc-bar side-menu-pc-more">PC / タブレット</button>
                        <button type="button" role="tab" id="side-menu-tab-mobile" class="side-menu-outlet-tab nui-tab" data-outlet="mobile" aria-selected="false" tabindex="-1" aria-controls="side-menu-mobile-bar side-menu-mobile-more">モバイル（画面下部のバー）</button>
                    </div>
                    <div class="side-menu-customizer">
                        <div class="side-menu-zone nui-section" id="side-menu-pc-bar" data-outlet="pc" data-zone="bar">
                            <h4 class="side-menu-zone-title nui-section-title">バーに表示</h4>
                            <p class="settings-help-text nui-help-text">ドラッグするか↑↓ボタンで、メニューに並ぶ順番を変えられます。</p>
                            <div class="side-menu-list nui-list" data-nui="list" data-zone="bar"></div>
                        </div>
                        <div class="side-menu-zone nui-section" id="side-menu-pc-more" data-outlet="pc" data-zone="more">
                            <h4 class="side-menu-zone-title nui-section-title">その他に移動</h4>
                            <p class="settings-help-text nui-help-text">ここへ移した項目はメニューから消えず、「その他」ボタンから開けます。</p>
                            <div class="side-menu-list nui-list" data-nui="list" data-zone="more"></div>
                        </div>
                        <div class="side-menu-zone nui-section" id="side-menu-mobile-bar" data-outlet="mobile" data-zone="bar" hidden>
                            <h4 class="side-menu-zone-title nui-section-title">バーに表示</h4>
                            <p class="settings-help-text nui-help-text">ドラッグするか↑↓ボタンで、画面下部のバーに並ぶ順番を変えられます。</p>
                            <div class="side-menu-list nui-list" data-nui="list" data-zone="bar"></div>
                        </div>
                        <div class="side-menu-zone nui-section" id="side-menu-mobile-more" data-outlet="mobile" data-zone="more" hidden>
                            <h4 class="side-menu-zone-title nui-section-title">その他に移動</h4>
                            <p class="settings-help-text nui-help-text">ここへ移した項目はドロワーを開くと「その他」から使えます。</p>
                            <div class="side-menu-list nui-list" data-nui="list" data-zone="more"></div>
                        </div>
                        <button type="button" id="side-menu-reset-btn" class="settings-secondary-button nui-button-secondary" style="align-self: flex-start;">デフォルトの並び順に戻す</button>
                    </div>
                </section>
                <section class="nui-section settings-group-panel" data-settings-panel="profile">
                    <label for="setting-username">ユーザー名</label>
                    <input type="text" id="setting-username" class="nui-input" required data-server-input-limit="user_name_length" value="${escapeHTML(getCurrentUser().name)}">
                    <label for="setting-icon-input">アイコン</label>
                    <div class="setting-icon-container nui-row">
                        <img id="setting-icon-preview" src="${getUserIconUrl(getCurrentUser())}" alt="アイコンのプレビュー" title="クリックしてファイルを選択">
                        <button type="button" id="reset-icon-btn" class="nui-button-secondary">デフォルトに戻す</button>
                    </div>
                    <input type="file" id="setting-icon-input" accept="image/*" class="hidden">
                    <label for="setting-header-input">ヘッダー画像</label>
                    <div class="setting-header-container nui-row">
                        <div id="setting-header-preview" class="setting-header-preview ${getUserHeaderImageUrl(getCurrentUser()) ? '' : 'is-empty'}" title="クリックしてファイルを選択">
                            ${getUserHeaderImageUrl(getCurrentUser()) ? `<img src="${escapeHTML(getUserHeaderImageUrl(getCurrentUser()))}" alt="ヘッダー画像のプレビュー">` : '<span>ヘッダー画像を選択</span>'}
                        </div>
                        <button type="button" id="reset-header-btn" class="nui-button-secondary">ヘッダー画像を削除</button>
                    </div>
                    <input type="file" id="setting-header-input" accept="image/*" class="hidden">
                    <label for="setting-me">自己紹介</label>
                    <textarea id="setting-me" class="nui-input" data-server-input-limit="profile_bio_length">${escapeHTML(getCurrentUser().me || '')}</textarea>
                </section>
                <section class="nui-section settings-group-panel" data-settings-panel="privacy" hidden>
                    <fieldset class="nui-card"><legend>公開設定</legend>
                        <label><input type="checkbox" id="setting-show-like" ${getCurrentUser().settings?.show_like ? 'checked' : ''}> いいねしたポストを公開する</label>
                        <label><input type="checkbox" id="setting-show-follow" ${getCurrentUser().settings?.show_follow ? 'checked' : ''}> フォローしている人を公開する</label>
                        <label><input type="checkbox" id="setting-show-follower" ${(getCurrentUser().settings?.show_follower ?? true) ? 'checked' : ''}> フォロワーリストを公開する</label>
                        <label><input type="checkbox" id="setting-show-star" ${getCurrentUser().settings?.show_star ? 'checked' : ''}> お気に入りを公開する</label>
                        <label><input type="checkbox" id="setting-show-scid" ${getCurrentUser().settings?.show_scid ? 'checked' : ''}> Scratchアカウント名を公開する</label>
                        <label><input type="checkbox" id="setting-lock" ${getCurrentUser().settings?.lock ? 'checked' : ''}> ポストを非公開にする</label>
                    </fieldset>
                    <fieldset class="nui-card settings-ng-words"><legend>ミュート・フィルター</legend>
                        <label for="setting-ng-words">NGワード</label>
                        <textarea id="setting-ng-words" placeholder="改行またはカンマ区切りで入力">${escapeHTML(Array.isArray(getCurrentUser().settings?.ng_words) ? getCurrentUser().settings.ng_words.join('\n') : (getCurrentUser().settings?.ng_words || ''))}</textarea>
                        <p class="settings-help-text nui-help-text">設定したワードが含まれるポストを検索から除外します。</p>
                    </fieldset>
                    <fieldset class="nui-card settings-dm-privacy"><legend>ダイレクトメッセージ</legend>
                        <label for="setting-dm-invitation">DMの招待</label>
                        <select id="setting-dm-invitation" class="settings-select nui-input">
                            <option value="always" ${(getCurrentUser().settings?.dm_invitation === 'always' || getCurrentUser().settings?.dm_invitation === 'allow') ? 'selected' : ''}>常に許可</option>
                            <option value="require_approval" ${(getCurrentUser().settings?.dm_invitation === 'require_approval' || !getCurrentUser().settings?.dm_invitation || getCurrentUser().settings?.dm_invitation === 'approval') ? 'selected' : ''}>承認が必要</option>
                            <option value="deny" ${(getCurrentUser().settings?.dm_invitation === 'deny' || getCurrentUser().settings?.dm_invitation === 'reject') ? 'selected' : ''}>常に拒否</option>
                        </select>
                        <p class="settings-help-text nui-help-text">他のユーザーからDMに招待されたときの動作を設定します。</p>
                    </fieldset>
                    ${Boolean(getCurrentUser()?.is_imposter || getCurrentUser()?.auth_provider === 'imposter' || getCurrentUser()?.settings?.imposter?.parent_id) ? '' : `
                    <fieldset class="nui-card settings-login-security"><legend>ログインのセーフティ</legend>
                        <label><input type="checkbox" id="setting-reject-unknown-login" ${(getCurrentUser().settings?.reject_unknown_login ?? false) ? 'checked' : ''}> 不明な場所からのログインを拒否</label>
                        <p class="settings-help-text nui-help-text">有効にすると、初めて利用するIPアドレスからのログインには、ログイン済み端末での許可が必要です。</p>
                    </fieldset>
                    <section class="nui-section settings-auth-providers" aria-labelledby="settings-auth-providers-title">
                        <h4 class="nui-section-title" id="settings-auth-providers-title">認証プロバイダー連携</h4>
                        <p class="settings-help-text nui-help-text">アカウントに紐づけるログイン方法を管理します。連携したすべての方法で同一アカウントにログインできます。</p>
                        <div id="settings-auth-providers-list" class="settings-auth-providers-list nui-list nui-list--flush" aria-live="polite"></div>
                    </section>
                    `}
                    <section class="nui-section settings-verification-application" aria-labelledby="settings-verification-title">
                        <h4 class="nui-section-title" id="settings-verification-title">認証</h4>
                        <p class="settings-help-text nui-help-text">認証済みアカウントにはプロフィール上で認証バッジが表示されます。申請は担当管理者が審査します。</p>
                        <button type="button" id="open-verification-application-btn" class="settings-bot-secondary-button nui-button-secondary" ${getCurrentUser().verify ? 'disabled' : ''}>${getCurrentUser().verify ? '認証済み' : '認証を申請する'}</button>
                        <p id="verification-application-status" class="settings-help-text hidden" role="status"></p>
                    </section>
                    ${Boolean(getCurrentUser()?.is_imposter || getCurrentUser()?.auth_provider === 'imposter' || getCurrentUser()?.settings?.imposter?.parent_id) ? '' : `
                    <section class="nui-section settings-sessions" aria-labelledby="settings-sessions-title">
                        <h4 class="nui-section-title" id="settings-sessions-title">セッション</h4>
                        <p class="settings-help-text nui-help-text">有効なログイン端末を管理できます。IPアドレスは安全のため一部のみ表示されます。</p>
                        <div id="settings-sessions-list" class="settings-sessions-list nui-list nui-list--flush" aria-live="polite"></div>
                    </section>
                    <section class="nui-section settings-blocked-ips" aria-labelledby="settings-blocked-ips-title">
                        <h4 class="nui-section-title" id="settings-blocked-ips-title">ブロックしたIPアドレス</h4>
                        <p class="settings-help-text nui-help-text">アカウントアクセスの復旧でブロックしたIPです。ブロックしたIPからのログインは恒久的に拒否されます。</p>
                        <div id="settings-blocked-ips-list" class="settings-sessions-list nui-list nui-list--flush" aria-live="polite"></div>
                    </section>
                    `}
                    <div class="settings-danger-zone nui-card nui-danger-card" data-nui="card"></div>
                </section>
                <section class="nui-section settings-group-panel" data-settings-panel="ui" hidden>
                    <label for="setting-post-timestamp-format">ポスト日時の表示</label>
                    <select id="setting-post-timestamp-format" class="settings-select nui-input">
                        <option value="relative">相対</option>
                        <option value="relative_detailed">相対</option>
                        <option value="absolute_24">絶対</option>
                        <option value="absolute_12">絶対</option>
                    </select>
                    <p class="settings-help-text nui-help-text">プロフィールの参加日時には適用されません。</p>
                    <label for="setting-emoji-kind">絵文字のフォント</label>
                    <select id="setting-emoji-kind" class="settings-select nui-input">
                        <option value="twemoji">Twemoji</option>
                        <option value="emojione">Emoji One</option>
                        <option value="default">デフォルト</option>
                    </select>
                    <label for="setting-content-editor">コンテンツエディタ</label>
                    <select id="setting-content-editor" class="settings-select nui-input">
                        <option value="textarea">Textarea</option>
                        <option value="nyaitter">Nyaitterエディタ</option>
                    </select>
                    <p class="settings-help-text nui-help-text">Textareaはブラウザ標準の入力欄です。NyaitterエディタはMarkdownとカスタム絵文字を入力中に表示します。</p>
                    <fieldset class="nui-card settings-data-saver"><legend>通信量</legend>
                        <label><input type="checkbox" id="setting-data-saver" ${getCurrentUser().settings?.data_saver ? 'checked' : ''}> データセーバーを有効にする</label>
                        <p class="settings-help-text nui-help-text">画像は低画質プレビューで表示し、開いた時だけ元の画質を取得します。リアルタイム接続を停止し、一覧の一度の取得件数も減らします。</p>
                    </fieldset>
                    <label for="setting-theme">テーマ</label>
                    <select id="setting-theme" class="settings-select nui-input">
                        <option value="auto">端末設定</option>
                        <option value="light">ライト</option>
                        <option value="dark">ダーク</option>
                    </select>
                    <label for="setting-ui-mode">表示UI</label>
                    <select id="setting-ui-mode" class="settings-select nui-input">
                        <option value="nui">NyaitterUI</option>
                        <option value="legacy">LegacyUI</option>
                    </select>
                    <p class="settings-help-text nui-help-text">画面のデザインを選びます。変更するとすぐに反映されます。</p>
                    <label for="setting-color-theme">カラーテーマ</label>
                    <select id="setting-color-theme" class="settings-select nui-input">
                        <option value="nyaitter">Nyaitter</option>
                        <option value="nyax">NyaX</option>
                        <option value="custom">カスタム</option>
                    </select>
                    <p class="settings-help-text nui-help-text">アクセントカラーと選択状態の配色を変更します。</p>
                    <section id="settings-custom-colors" class="settings-custom-colors" hidden aria-labelledby="settings-custom-colors-title">
                        <h4 class="nui-section-title" id="settings-custom-colors-title">カスタムカラー</h4>
                        <p class="settings-help-text nui-help-text">各色はカラーピッカーまたは16進数カラーコードで指定できます。</p>
                        <div class="settings-color-grid">
                            <label class="settings-color-field">メインカラー
                                <span class="settings-color-control"><input type="color" id="setting-color-primary-picker" data-color-key="primary_color"><input type="text" id="setting-color-primary" data-color-key="primary_color" class="settings-color-code" maxlength="7"></span>
                            </label>
                            <label class="settings-color-field">ホバー時のメインカラー
                                <span class="settings-color-control"><input type="color" id="setting-color-primary-hover-picker" data-color-key="primary_hover_color"><input type="text" id="setting-color-primary-hover" data-color-key="primary_hover_color" class="settings-color-code" maxlength="7"></span>
                            </label>
                            <label class="settings-color-field">ライトモードの淡色
                                <span class="settings-color-control"><input type="color" id="setting-color-light-primary-picker" data-color-key="light_primary_color"><input type="text" id="setting-color-light-primary" data-color-key="light_primary_color" class="settings-color-code" maxlength="7"></span>
                            </label>
                            <label class="settings-color-field">ダークモードの淡色
                                <span class="settings-color-control"><input type="color" id="setting-color-dark-light-primary-picker" data-color-key="dark_light_primary_color"><input type="text" id="setting-color-dark-light-primary" data-color-key="dark_light_primary_color" class="settings-color-code" maxlength="7"></span>
                            </label>
                        </div>
                    </section>
                </section>
                <section class="nui-section settings-group-panel" data-settings-panel="notifications" hidden>
                    <section class="nui-section settings-push-notifications" aria-labelledby="push-notification-title">
                        <h4 class="nui-section-title" id="push-notification-title">プッシュ通知</h4>
                        <p id="push-notification-status" role="status">通知の状態を確認しています</p>
                        <button type="button" id="push-notification-action" class="settings-primary-button nui-button" disabled>読み込み中</button>
                        <p class="settings-help-text nui-help-text">通知はこの端末・ブラウザごとに設定されます。HTTPS対応のブラウザで利用できます。</p>
                    </section>
                </section>
                <section class="nui-section settings-group-panel" data-settings-panel="imposter" hidden>
                    <section class="nui-section settings-imposter" aria-labelledby="settings-imposter-title">
                        <h4 class="nui-section-title" id="settings-imposter-title">インポスター</h4>
                        <p class="settings-help-text nui-help-text">1つのNyaitterIDから複数作成可能な偽のNyaitterIdです。</p>
                        <div id="settings-imposter-create" class="settings-bot-create-container">
                            <label for="settings-imposter-name" style="font-weight: 600; font-size: 0.9rem;">新しいインポスターの表示名</label>
                            <div class="settings-bot-create-form">
                                <input type="search" id="settings-imposter-name" placeholder="表示名" maxlength="50" autocomplete="off">
                                <button type="button" id="settings-imposter-create-btn" class="settings-primary-button nui-button">作成</button>
                            </div>
                            <p id="settings-imposter-limit" class="settings-help-text nui-help-text" role="status">インポスターを読み込んでいます</p>
                        </div>
                        <div id="settings-imposter-list" class="settings-sessions-list nui-list nui-list--flush" aria-live="polite"></div>
                    </section>
                </section>
                <section class="nui-section settings-group-panel" data-settings-panel="storage" hidden>
                    <section class="nui-section settings-storage" aria-labelledby="settings-storage-title">
                        <div class="settings-storage-heading">
                            <div>
                                <h4 class="nui-section-title" id="settings-storage-title">保存済みファイル</h4>
                                <p id="settings-storage-summary" class="settings-help-text nui-help-text" role="status">ストレージ使用量を読み込んでいます</p>
                            </div>
                            <button type="button" id="settings-storage-refresh-btn" class="settings-bot-secondary-button nui-button-secondary">更新</button>
                        </div>
                        <div class="settings-storage-progress" aria-hidden="true"><div id="settings-storage-progress-value" class="settings-storage-progress-value"></div></div>
                        <div id="settings-storage-files" class="settings-sessions-list nui-list nui-list--flush" aria-live="polite"></div>
                    </section>
                </section>
                <section class="nui-section settings-group-panel" data-settings-panel="api" hidden>
                    <div class="settings-bot-section">
                        <h4 class="nui-section-title" id="settings-bot-title">APIキー</h4>
                        <p class="settings-help-text nui-help-text">プログラムやスクリプトからNyaitter APIを操作するためのAPIキーを生成・管理できます。</p>
                        <div class="settings-bot-create-container">
                            <label for="setting-bot-token-name" style="font-weight: 600; font-size: 0.9rem;">新しいAPIキーの名前</label>
                            <div class="settings-bot-create-form">
                                <input type="text" id="setting-bot-token-name" placeholder="例: 投稿Bot, 自動通知スクリプト" maxlength="50" autocomplete="off">
                                <button type="button" id="setting-bot-token-create-btn" class="nui-button">APIキーを生成</button>
                            </div>
                        </div>
                        <div id="settings-bot-token-newly-created" class="settings-bot-new-key-box" hidden>
                            <div class="settings-bot-new-key-header">
                                <strong>APIキーが生成されました</strong>
                                <p class="settings-bot-new-key-warning">このキーは一度しか表示されません。安全な場所にコピーして保存してください。</p>
                            </div>
                            <div class="settings-bot-new-key-display">
                                <input type="text" id="settings-bot-new-key-value" readonly spellcheck="false" autocomplete="off">
                                <button type="button" id="settings-bot-copy-key-btn" class="settings-bot-copy-button">コピー</button>
                            </div>
                            <div style="margin-top: 0.5rem; text-align: right;">
                                <button type="button" id="settings-bot-close-new-key-btn" class="settings-bot-secondary-button nui-button-secondary">完了</button>
                            </div>
                        </div>
                        <div class="settings-bot-list-section">
                            <h4 style="margin-top: 1.5rem; font-size: 1rem;">生成済みのAPIキー</h4>
                            <div id="settings-bot-tokens-list" class="settings-sessions-list nui-list nui-list--flush" aria-live="polite"></div>
                        </div>
                    </div>
                </section>
                <section class="nui-section settings-group-panel" data-settings-panel="apps" hidden>
                    <section class="nui-section settings-authorized-apps" aria-labelledby="settings-authorized-apps-title">
                        <h4 class="nui-section-title" id="settings-authorized-apps-title">連携中のアプリケーション</h4>
                        <p class="settings-help-text nui-help-text">NyaitterAuthでアクセスを許可したアプリケーションの一覧です。権限の変更や連携の解除が行えます。</p>
                        <div id="settings-authorized-apps-list" class="settings-sessions-list nui-list nui-list--flush" aria-live="polite"></div>
                    </section>
                </section>
                <section class="nui-section settings-group-panel" data-settings-panel="resources" hidden>
                    <section class="nui-section settings-resource-links" aria-labelledby="settings-resource-links-title">
                        <h4 class="nui-section-title" id="settings-resource-links-title">リンク</h4>
                        <div id="settings-resource-links" class="settings-sessions-list nui-list nui-list--flush"></div>
                    </section>
                </section>
                <section class="nui-section settings-group-panel" data-settings-panel="client" hidden>
                    <section class="nui-section settings-client" aria-labelledby="settings-client-title">
                        <h4 class="nui-section-title" id="settings-client-title">クライアント</h4>
                        <p class="settings-help-text nui-help-text">この端末に保存されているクライアントの状態です。更新するとキャッシュを保存し直して最新版を読み込みます。</p>
                        <dl class="settings-client-versions settings-sessions-list nui-list nui-list--flush">
                            <div class="settings-client-version-row nui-list-item" data-nui="list-item">
                                <dt>実行中</dt>
                                <dd id="settings-client-version">—</dd>
                            </div>
                            <div class="settings-client-version-row nui-list-item" data-nui="list-item">
                                <dt>キャッシュ済み</dt>
                                <dd id="settings-client-cached">—</dd>
                            </div>
                            <div class="settings-client-version-row nui-list-item" data-nui="list-item">
                                <dt>サーバー</dt>
                                <dd id="settings-client-latest">—</dd>
                            </div>
                        </dl>
                        <p id="settings-client-status" class="settings-help-text nui-help-text" role="status" aria-live="polite"></p>
                        <div class="settings-client-actions">
                            <button type="button" id="settings-client-check" class="settings-secondary-button nui-button-secondary">更新を確認</button>
                            <button type="button" id="settings-client-update" class="settings-primary-button nui-button hidden">今すぐ更新</button>
                        </div>
                    </section>
                </section>
            </form>
            <div id="verification-application-modal" class="modal-overlay hidden" role="dialog" aria-modal="true">
                <section class="modal-content verification-application-modal-content nui-modal" data-nui="modal">
                    <button type="button" class="modal-close-btn" data-action="close-verification-application">×</button>
                    <h3 class="nui-modal-title">認証を申請する</h3>
                    <p class="settings-help-text nui-help-text">申請内容は担当管理者が確認します。審査が完了すると通知でお知らせします。</p>
                    <div class="verification-application-actions nui-actions" style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button type="button" class="login-secondary-button nui-button-secondary" data-action="close-verification-application">キャンセル</button>
                        <button type="button" id="submit-verification-application-btn" class="settings-primary-button nui-button">申請する</button>
                    </div>
                </section>
            </div>
            <div id="edit-app-scopes-modal" class="modal-overlay hidden" role="dialog" aria-modal="true">
                <section class="modal-content nui-modal" data-nui="modal" style="max-width: 520px;">
                    <button type="button" class="modal-close-btn">×</button>
                    <h3 id="edit-app-scopes-title" class="nui-modal-title">権限を変更</h3>
                    <p class="settings-help-text nui-help-text">このアプリケーションに許可する権限を選択してください。</p>
                    <div id="edit-app-scopes-container" style="margin: 1.25rem 0; max-height: 340px; overflow-y: auto;"></div>
                    <div class="nui-actions" style="margin-top: 1.25rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button type="button" id="edit-app-scopes-cancel-btn" class="login-secondary-button nui-button-secondary">キャンセル</button>
                        <button type="button" id="edit-app-scopes-save-btn" class="settings-primary-button nui-button">保存する</button>
                    </div>
                </section>
            </div>
        </div>
    `;

    const dmInvitationSelect = document.getElementById('setting-dm-invitation');
    if (dmInvitationSelect) {
        dmInvitationSelect.value = normalizeDmInvitation(getCurrentUser().settings?.dm_invitation);
    }
    document.getElementById('setting-post-timestamp-format').value =
        normalizePostTimestampFormat(getCurrentUser().settings?.post_timestamp_format);
    document.getElementById('setting-emoji-kind').value =
        getCurrentUser().settings?.emoji || 'twemoji';
    document.getElementById('setting-content-editor').value =
        getCurrentUser().settings?.content_editor === 'textarea' ? 'textarea' : 'nyaitter';
    document.getElementById('setting-theme').value =
        getCurrentUser().settings?.theme || 'light';
    const uiModeSelect = document.getElementById('setting-ui-mode');
    if (uiModeSelect) uiModeSelect.value = getUiMode();

    const colorThemeSelect = document.getElementById('setting-color-theme');
    const customColorsSection = document.getElementById('settings-custom-colors');
    const savedColorTheme = normalizeColorTheme(getCurrentUser().settings?.color_theme);
    const savedCustomColors = getSafeColorPalette('custom', getCurrentUser().settings?.custom_colors);
    colorThemeSelect.value = savedColorTheme;

    document.querySelectorAll('.settings-color-code[data-color-key]').forEach((codeInput) => {
        const colorKey = codeInput.dataset.colorKey;
        const colorPicker = document.getElementById(`${codeInput.id}-picker`);
        const color = savedCustomColors[colorKey];
        codeInput.value = color;
        if (colorPicker) colorPicker.value = color;
    });

    const updateColorThemeSettingsUi = () => {
        const isCustom = colorThemeSelect.value === 'custom';
        customColorsSection.hidden = !isCustom;
        document.querySelectorAll('#settings-custom-colors input').forEach((input) => {
            input.disabled = !isCustom;
        });
        applyColorTheme({
            color_theme: colorThemeSelect.value,
            custom_colors: getCustomColorsFromInputs(document),
        });
    };

    // カラーピッカーはドラッグ中に input が連続発火するため、保存は束ねる。
    let colorPickerSaveTimer;
    document.querySelectorAll('.settings-color-code[data-color-key]').forEach((codeInput) => {
        const colorPicker = document.getElementById(`${codeInput.id}-picker`);
        colorPicker?.addEventListener('input', () => {
            codeInput.value = colorPicker.value.toLowerCase();
            if (colorThemeSelect.value === 'custom') updateColorThemeSettingsUi();
            clearTimeout(colorPickerSaveTimer);
            colorPickerSaveTimer = setTimeout(() => requestSettingsSave(document.getElementById('settings-form')), 500);
        });
        codeInput.addEventListener('input', () => {
            const color = codeInput.value.trim();
            if (HEX_COLOR_PATTERN.test(color)) {
                colorPicker.value = color.toLowerCase();
                if (colorThemeSelect.value === 'custom') updateColorThemeSettingsUi();
            }
        });
    });
    colorThemeSelect.addEventListener('change', updateColorThemeSettingsUi);
    updateColorThemeSettingsUi();

    const verificationApplicationButton = document.getElementById('open-verification-application-btn');
    const verificationApplicationModal = document.getElementById('verification-application-modal');
    const verificationApplicationStatus = document.getElementById('verification-application-status');
    const verificationApplicationError = document.getElementById('verification-application-error');
    const verificationApplicationSubmit = document.getElementById('submit-verification-application-btn');

    const closeVerificationApplicationModal = () => verificationApplicationModal?.classList.add('hidden');
    const updateVerificationApplicationStatus = (application) => {
        if (!verificationApplicationButton || !verificationApplicationStatus) return;
        if (getCurrentUser().verify) {
            verificationApplicationButton.disabled = true;
            verificationApplicationButton.textContent = '認証済み';
            verificationApplicationStatus.classList.add('hidden');
            return;
        }
        if (!application) {
            verificationApplicationButton.disabled = false;
            verificationApplicationButton.textContent = '認証を申請する';
            verificationApplicationStatus.classList.add('hidden');
            verificationApplicationStatus.textContent = '';
            return;
        }
        verificationApplicationButton.disabled = true;
        verificationApplicationButton.textContent = '認証申請を確認中';
        verificationApplicationStatus.textContent = application.status === 'assigned'
            ? '認証申請は担当管理者に割り当てられ、確認中です。'
            : '認証申請を受け付け、担当管理者への割当を待っています。';
        verificationApplicationStatus.classList.remove('hidden');
    };

    const refreshVerificationApplicationStatus = async () => {
        if (getCurrentUser().verify) return updateVerificationApplicationStatus(null);
        const { data, error } = await apiRequest('/server/api/verification-applications/me');
        if (!error) updateVerificationApplicationStatus(data?.application || null);
    };

    verificationApplicationButton?.addEventListener('click', () => {
        if (!verificationApplicationButton.disabled) {
            verificationApplicationError?.classList.add('hidden');
            verificationApplicationModal?.classList.remove('hidden');
        }
    });
    verificationApplicationModal?.querySelectorAll('[data-action="close-verification-application"]').forEach((button) => {
        button.addEventListener('click', closeVerificationApplicationModal);
    });
    verificationApplicationModal?.addEventListener('click', (event) => {
        if (event.target === verificationApplicationModal) closeVerificationApplicationModal();
    });
    verificationApplicationSubmit?.addEventListener('click', async () => {
        verificationApplicationSubmit.disabled = true;
        verificationApplicationError?.classList.add('hidden');
        const { data, error } = await apiRequest('/server/api/verification-applications', {
            method: 'POST',
            body: {},
        });
        verificationApplicationSubmit.disabled = false;
        if (error) {
            if (verificationApplicationError) {
                verificationApplicationError.textContent = error.message || '認証申請を送信できませんでした。';
                verificationApplicationError.classList.remove('hidden');
            }
            return;
        }
        closeVerificationApplicationModal();
        updateVerificationApplicationStatus(data?.application || null);
    });
    void refreshVerificationApplicationStatus();

    const sessionsList = document.getElementById('settings-sessions-list');
    const loadLoginSecuritySessions = async () => {
        if (!sessionsList) return;
        const { data, error } = await apiRequest('/server/auth/sessions');
        sessionsList.replaceChildren();
        if (error) return;
        const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
        if (sessions.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'settings-help-text nui-help-text';
            empty.textContent = '有効なセッションはありません。';
            sessionsList.appendChild(empty);
            return;
        }
        sessions.forEach((session) => {
            const item = document.createElement('article');
            item.className = 'settings-session-item nui-list-item';
            const details = document.createElement('div');
            details.className = 'settings-session-details nui-list-copy';
            const title = document.createElement('div');
            title.className = 'settings-session-title nui-list-title';
            title.textContent = session.ip_masked || '旧セッション';
            if (session.current) {
                const currentBadge = document.createElement('span');
                currentBadge.className = 'settings-session-current nui-badge';
                currentBadge.textContent = 'この端末';
                title.appendChild(currentBadge);
            }
            const device = document.createElement('p');
            device.className = 'settings-session-device';
            device.textContent = session.user_agent || '不明な端末';
            const dates = document.createElement('p');
            dates.className = 'settings-session-dates nui-list-meta';
            dates.textContent = `開始: ${formatSecurityTimestamp(session.created_at)} / 有効期限: ${formatSecurityTimestamp(session.expires_at)}`;
            details.append(title, device, dates);

            const actions = document.createElement('div');
            actions.className = 'settings-session-actions nui-actions';
            const invalidateButton = document.createElement('button');
            invalidateButton.type = 'button';
            invalidateButton.className = 'settings-session-invalidate-button';
            invalidateButton.textContent = '無効化';
            invalidateButton.addEventListener('click', async () => {
                if (!(await showAppConfirm(session.current ? 'この端末のセッションを無効化してログアウトしますか？' : 'このセッションを無効化しますか？'))) return;
                const { data: result, error: invalidateError } = await apiRequest(`/server/auth/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' });
                if (invalidateError) return showAppAlert(`セッションの無効化に失敗しました: ${invalidateError.message}`);
                if (result?.active_removed) {
                    setCurrentUser(null);
                    unsubscribeFromChanges();
                    window.location.hash = '#';
                    await checkSession();
                    return;
                }
                await loadLoginSecuritySessions();
            });
            actions.appendChild(invalidateButton);

            if (session.can_revoke_trust) {
                const revokeButton = document.createElement('button');
                revokeButton.type = 'button';
                revokeButton.className = 'settings-session-revoke-button';
                revokeButton.textContent = '信頼を取り消す';
                revokeButton.addEventListener('click', async () => {
                    if (!(await showAppConfirm('このIPアドレスの信頼を取り消し、同じIPアドレスの全セッションを無効化しますか？'))) return;
                    const { data: result, error: revokeError } = await apiRequest(`/server/auth/sessions/${encodeURIComponent(session.id)}/revoke-ip`, { method: 'POST' });
                    if (revokeError) return showAppAlert(`信頼の取り消しに失敗しました: ${revokeError.message}`);
                    if (result?.active_removed) {
                        setCurrentUser(null);
                        unsubscribeFromChanges();
                        window.location.hash = '#';
                        await checkSession();
                        return;
                    }
                    await loadLoginSecuritySessions();
                });
                actions.appendChild(revokeButton);
            }

            item.append(details, actions);
            sessionsList.appendChild(item);
        });
    };

    const blockedIpsList = document.getElementById('settings-blocked-ips-list');
    const loadBlockedLoginIps = async () => {
        if (!blockedIpsList) return;
        const { data, error } = await apiRequest('/server/auth/blocked-ips');
        blockedIpsList.replaceChildren();
        if (error) return;
        const blockedIps = Array.isArray(data?.blocked_ips) ? data.blocked_ips : [];
        if (blockedIps.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'settings-help-text nui-help-text';
            empty.textContent = 'ブロックしたIPアドレスはありません。';
            blockedIpsList.appendChild(empty);
            return;
        }
        blockedIps.forEach((blocked) => {
            const isCurrentIp = Boolean(blocked.is_current_ip);
            const item = document.createElement('article');
            item.className = 'settings-session-item nui-list-item';
            const details = document.createElement('div');
            details.className = 'settings-session-details nui-list-copy';
            const title = document.createElement('div');
            title.className = 'settings-session-title nui-list-title';
            title.textContent = blocked.ip_masked || '不明なIPアドレス';
            if (isCurrentIp) {
                const currentBadge = document.createElement('span');
                currentBadge.className = 'settings-session-current nui-badge';
                currentBadge.textContent = 'この端末と同じIP';
                title.appendChild(currentBadge);
            }
            const dates = document.createElement('p');
            dates.className = 'settings-session-dates nui-list-meta';
            dates.textContent = `ブロック日時: ${formatSecurityTimestamp(blocked.created_at)}`;
            details.append(title, dates);

            const actions = document.createElement('div');
            actions.className = 'settings-session-actions nui-actions';
            if (blocked.ip_hash) {
                const unblockButton = document.createElement('button');
                unblockButton.type = 'button';
                unblockButton.className = 'settings-blocked-ip-unblock-button';
                unblockButton.textContent = '解除';
                unblockButton.addEventListener('click', async () => {
                    const message = isCurrentIp
                        ? 'このIPアドレスは現在この端末で利用中のIPです。ブロックを解除しますか？'
                        : 'このIPアドレスのブロックを解除しますか？';
                    if (!(await showAppConfirm(message))) return;
                    const { error: unblockError } = await apiRequest(`/server/auth/blocked-ips/${encodeURIComponent(blocked.ip_hash)}`, { method: 'DELETE' });
                    if (unblockError) {
                        // apiRequestはHTTPステータスを返さないので、404はサーバー文言で判別する。
                        if (String(unblockError.message || '').includes('見つかりません')) {
                            await showAppAlert('このブロックは他の端末ですでに解除されていた可能性があります。一覧を更新します。');
                            await loadBlockedLoginIps();
                        } else {
                            showAppAlert(`ブロックの解除に失敗しました: ${unblockError.message}`);
                        }
                        return;
                    }
                    await loadBlockedLoginIps();
                });
                actions.appendChild(unblockButton);
            }

            item.append(details, actions);
            blockedIpsList.appendChild(item);
        });
    };

    const authProvidersList = document.getElementById('settings-auth-providers-list');
    const loadAuthProvidersSettings = async () => {
        if (!authProvidersList) return;
        authProvidersList.replaceChildren();

        const [serverResult, linkedResult] = await Promise.all([
            apiRequest('/server/auth/providers'),
            apiRequest('/server/auth/linked-providers'),
        ]);

        if (serverResult.error && linkedResult.error) {
            const errorP = document.createElement('p');
            errorP.className = 'settings-help-text nui-help-text';
            errorP.textContent = '認証プロバイダー情報の取得に失敗しました。';
            authProvidersList.appendChild(errorP);
            return;
        }

        const serverProviders = Array.isArray(serverResult.data?.providers) ? serverResult.data.providers : [];
        const rawLinkedProviders = Array.isArray(linkedResult.data?.linked_providers) ? linkedResult.data.linked_providers : [];
        const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        const linkedProviders = [...rawLinkedProviders];
        if (currentUser?.scid && !linkedProviders.some((p) => String(p.provider).toLowerCase() === 'scratch')) {
            linkedProviders.unshift({
                provider: 'scratch',
                providerUserId: currentUser.scid,
                isPrimary: true,
            });
        }

        if (serverProviders.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'settings-help-text nui-help-text';
            empty.textContent = '利用可能な認証プロバイダーはありません。';
            authProvidersList.appendChild(empty);
            return;
        }

        serverProviders.forEach((provider) => {
            const isLinked = linkedProviders.some(
                (p) => String(p.provider).toLowerCase() === String(provider.name).toLowerCase()
            );
            const linkedInfo = linkedProviders.find(
                (p) => String(p.provider).toLowerCase() === String(provider.name).toLowerCase()
            );

            const item = document.createElement('article');
            item.className = 'settings-session-item settings-auth-provider-item nui-list-item';

            const details = document.createElement('div');
            details.className = 'settings-session-details nui-list-copy';

            const title = document.createElement('div');
            title.className = 'settings-session-title nui-list-title';
            title.textContent = provider.displayName || provider.name;

            const badge = document.createElement('span');
            badge.className = isLinked ? 'settings-session-current' : 'settings-provider-unlinked';
            badge.textContent = isLinked ? '連携中' : '未連携';
            title.appendChild(badge);

            const desc = document.createElement('p');
            if (isLinked && linkedInfo?.providerUserId) {
                desc.textContent = `連携アカウント: ${linkedInfo.providerUserId}`;
            } else if (provider.name === 'scratch') {
                desc.textContent = 'Scratchアカウントでログインします。';
            } else if (provider.name === 'email') {
                desc.textContent = 'ワンタイム認証コードでログインします。';
            } else if (provider.name === 'passkey') {
                desc.textContent = '端末の指紋認証・顔認証・セキュリティキーでログインします。';
            } else if (provider.name === 'google') {
                desc.textContent = 'Googleアカウントでログインします。';
            } else if (provider.name === 'microsoft') {
                desc.textContent = 'Microsoftアカウントでログインします。';
            } else {
                desc.textContent = `${provider.displayName || provider.name}でログインします。`;
            }

            details.append(title, desc);

            const actions = document.createElement('div');
            actions.className = 'settings-session-actions nui-actions';

            if (isLinked) {
                const unlinkBtn = document.createElement('button');
                unlinkBtn.type = 'button';
                unlinkBtn.className = 'settings-session-revoke-button';
                unlinkBtn.textContent = '連携解除';
                unlinkBtn.addEventListener('click', async () => {
                    if (linkedProviders.length <= 1) {
                        return showAppAlert('アカウントには最低1つのログイン方法が必要です。最後の認証方法を解除することはできません。');
                    }
                    if (!(await showAppConfirm(`「${provider.displayName || provider.name}」の連携を解除しますか？\n解除後はこの方法でログインできなくなります。`))) return;

                    showLoading(true);
                    const { error: unlinkError } = await apiRequest(`/server/auth/link/${encodeURIComponent(provider.name)}`, {
                        method: 'DELETE',
                        body: { provider_user_id: linkedInfo?.providerUserId },
                    });
                    showLoading(false);

                    if (unlinkError) {
                        return showAppAlert(`連携解除に失敗しました: ${unlinkError.message}`);
                    }
                    await showAppAlert(`「${provider.displayName || provider.name}」の連携を解除しました。`);
                    await loadAuthProvidersSettings();
                });
                actions.appendChild(unlinkBtn);
            } else {
                const linkBtn = document.createElement('button');
                linkBtn.type = 'button';
                linkBtn.className = 'settings-session-link-button';
                linkBtn.textContent = '連携する';
                linkBtn.addEventListener('click', () => {
                    if (typeof window.openNyaitterLoginModal !== 'function') {
                        showAppAlert('ログインモーダルを利用できません。ページを再読み込みしてください。');
                        return;
                    }
                    window.openNyaitterLoginModal({
                        mode: 'link',
                        provider: provider.name,
                        onSuccess: loadAuthProvidersSettings,
                    });
                });
                actions.appendChild(linkBtn);
            }

            item.append(details, actions);
            authProvidersList.appendChild(item);
        });
    };

    // リダイレクトを跨ぐ NyaitterAuth 連携の完了後、一覧を再読込する。
    if (!linkSuccessListenerBound) {
        linkSuccessListenerBound = true;
        window.addEventListener('nyaitter:link-success', () => {
            void loadAuthProvidersSettings();
        });
    }

    const botTokensList = document.getElementById('settings-bot-tokens-list');
    const createBotTokenBtn = document.getElementById('setting-bot-token-create-btn');
    const botTokenNameInput = document.getElementById('setting-bot-token-name');
    const newlyCreatedBox = document.getElementById('settings-bot-token-newly-created');
    const newlyCreatedValue = document.getElementById('settings-bot-new-key-value');
    const copyBotKeyBtn = document.getElementById('settings-bot-copy-key-btn');
    const closeNewKeyBtn = document.getElementById('settings-bot-close-new-key-btn');

    const loadUserBotTokens = async () => {
        if (!botTokensList) return;
        const { data, error } = await apiRequest('/server/auth/bot-tokens');
        botTokensList.replaceChildren();
        if (error) {
            const errP = document.createElement('p');
            errP.className = 'settings-help-text nui-help-text';
            errP.textContent = 'APIキー一覧の取得に失敗しました。';
            botTokensList.appendChild(errP);
            return;
        }
        const tokens = Array.isArray(data?.tokens) ? data.tokens : [];
        if (tokens.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'settings-help-text nui-help-text';
            empty.textContent = '生成済みのAPIキーはありません。';
            botTokensList.appendChild(empty);
            return;
        }
        tokens.forEach((token) => {
            const item = document.createElement('article');
            item.className = 'settings-session-item nui-list-item';
            const details = document.createElement('div');
            details.className = 'settings-session-details nui-list-copy';
            const title = document.createElement('div');
            title.className = 'settings-session-title nui-list-title';
            title.textContent = token.name || '名称未設定';
            const idBadge = document.createElement('span');
            idBadge.className = 'settings-bot-token-id';
            idBadge.textContent = `ID: ${token.tokenId}`;
            title.appendChild(idBadge);
            const dates = document.createElement('p');
            dates.className = 'settings-session-dates nui-list-meta';
            const createdStr = token.createdAt ? formatSecurityTimestamp(token.createdAt) : '日時不明';
            const lastUsedStr = token.lastUsedAt ? formatSecurityTimestamp(token.lastUsedAt) : '未使用';
            dates.textContent = `作成: ${createdStr} / 最終使用: ${lastUsedStr}`;
            details.append(title, dates);

            const actions = document.createElement('div');
            actions.className = 'settings-session-actions nui-actions';
            const revokeBtn = document.createElement('button');
            revokeBtn.type = 'button';
            revokeBtn.className = 'settings-session-revoke-button';
            revokeBtn.textContent = '無効化';
            revokeBtn.addEventListener('click', async () => {
                if (!(await showAppConfirm(`APIキー「${token.name || token.tokenId}」を無効化しますか？\n無効化するとこのキーを使用したBotはアクセスできなくなります。`))) return;
                revokeBtn.disabled = true;
                const { error: revokeError } = await apiRequest(`/server/auth/bot-tokens/${encodeURIComponent(token.tokenId)}`, { method: 'DELETE' });
                if (revokeError) {
                    showAppAlert(`APIキーの無効化に失敗しました: ${revokeError.message}`);
                    revokeBtn.disabled = false;
                    return;
                }
                await loadUserBotTokens();
            });
            actions.appendChild(revokeBtn);
            item.append(details, actions);
            botTokensList.appendChild(item);
        });
    };

    if (createBotTokenBtn) {
        createBotTokenBtn.addEventListener('click', async () => {
            const name = (botTokenNameInput?.value || '').trim();
            createBotTokenBtn.disabled = true;
            createBotTokenBtn.textContent = '生成中';
            try {
                const { data, error } = await apiRequest('/server/auth/bot-tokens', {
                    method: 'POST',
                    body: { name: name || undefined },
                });
                if (error) {
                    showAppAlert(`APIキーの生成に失敗しました: ${error.message}`);
                    return;
                }
                if (data?.token) {
                    if (botTokenNameInput) botTokenNameInput.value = '';
                    if (newlyCreatedValue) newlyCreatedValue.value = data.token;
                    if (newlyCreatedBox) {
                        newlyCreatedBox.hidden = false;
                        newlyCreatedBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                    if (copyBotKeyBtn) copyBotKeyBtn.textContent = 'コピー';
                    await loadUserBotTokens();
                }
            } finally {
                createBotTokenBtn.disabled = false;
                createBotTokenBtn.textContent = 'APIキーを生成';
            }
        });
    }

    if (copyBotKeyBtn) {
        copyBotKeyBtn.addEventListener('click', async () => {
            if (!newlyCreatedValue?.value) return;
            try {
                await copyTextToClipboard(newlyCreatedValue.value);
                copyBotKeyBtn.textContent = 'コピー完了！';
                setTimeout(() => {
                    if (copyBotKeyBtn) copyBotKeyBtn.textContent = 'コピー';
                }, 2000);
            } catch (_) {
                newlyCreatedValue.select();
                document.execCommand('copy');
                copyBotKeyBtn.textContent = 'コピー完了！';
                setTimeout(() => {
                    if (copyBotKeyBtn) copyBotKeyBtn.textContent = 'コピー';
                }, 2000);
            }
        });
    }

    if (closeNewKeyBtn) {
        closeNewKeyBtn.addEventListener('click', () => {
            if (newlyCreatedBox) newlyCreatedBox.hidden = true;
            if (newlyCreatedValue) newlyCreatedValue.value = '';
        });
    }

    // ==================== Authorized Apps (NyaitterAuth) ====================
    const authorizedAppsList = document.getElementById('settings-authorized-apps-list');
    const openEditAppScopesModal = async (app, onUpdated) => {
        const modal = document.getElementById('edit-app-scopes-modal');
        if (!modal) return;
        const appTitle = document.getElementById('edit-app-scopes-title');
        const scopesContainer = document.getElementById('edit-app-scopes-container');
        const saveBtn = document.getElementById('edit-app-scopes-save-btn');
        const cancelBtn = document.getElementById('edit-app-scopes-cancel-btn');
        const closeBtn = modal.querySelector('.modal-close-btn');

        if (appTitle) appTitle.textContent = `${app.app_name || 'アプリ'}の権限変更`;

        const availableScopes = [
            { id: 'profile:read', label: '基本情報の閲覧', desc: 'ユーザー名、アイコンなどの基本情報', required: true },
            { id: 'posts:read', label: 'タイムライン・ポストの閲覧', desc: 'タイムライン、ポストの閲覧' },
            { id: 'posts:write', label: 'ポストの投稿・リアクション', desc: 'ポストの投稿、返信、いいね等' },
            { id: 'dm:read', label: 'ダイレクトメッセージの閲覧', desc: 'DMの閲覧' },
            { id: 'dm:write', label: 'ダイレクトメッセージの送信', desc: 'DMの送信' },
            { id: 'notifications:read', label: '通知の閲覧', desc: '通知の確認' },
            { id: 'storage:access', label: 'ストレージへのアクセス', desc: 'ファイル・プロジェクトの保存、閲覧、更新、削除' },
            { id: 'continuous_access', label: '継続アクセス', desc: 'バックグラウンドでの継続的なアクセス' },
        ];

        const currentScopesSet = new Set(Array.isArray(app.scopes) ? app.scopes : []);

        if (scopesContainer) {
            scopesContainer.innerHTML = availableScopes.map((s) => `
                <label class="nyauth-scope-item nui-field" style="display: flex; gap: 0.75rem; margin: 0.75rem 0; cursor: pointer;">
                    <input type="checkbox" name="edit_nyauth_scope" value="${s.id}" ${currentScopesSet.has(s.id) || s.required ? 'checked' : ''} ${s.required ? 'disabled data-required="true"' : ''}>
                    <div>
                        <strong style="font-size: 0.95rem;">${escapeHTML(s.label)}</strong> ${s.required ? '<span class="nyauth-badge-required nui-badge nui-badge-danger">必須</span>' : ''}
                        <p class="nui-help-text" style="margin: 0.2rem 0 0; font-size: 0.82rem; color: var(--secondary-text-color);">${escapeHTML(s.desc)}</p>
                    </div>
                </label>
            `).join('');
        }

        const closeModal = () => {
            modal.classList.add('hidden');
        };

        const handleSave = async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = '保存中';
            const selectedScopes = [];
            modal.querySelectorAll('input[name="edit_nyauth_scope"]').forEach((cb) => {
                if (cb.checked || cb.dataset.required === 'true') {
                    selectedScopes.push(cb.value);
                }
            });

            try {
                const { error } = await apiRequest(`/server/auth/nyaitter-auth/authorized-apps/${encodeURIComponent(app.id)}`, {
                    method: 'PATCH',
                    body: { scopes: selectedScopes },
                });
                if (error) {
                    showAppAlert(`権限の更新に失敗しました: ${error.message}`);
                    return;
                }
                closeModal();
                if (typeof onUpdated === 'function') await onUpdated();
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = '保存する';
            }
        };

        if (closeBtn) closeBtn.onclick = closeModal;
        if (cancelBtn) cancelBtn.onclick = closeModal;
        if (saveBtn) saveBtn.onclick = handleSave;
        modal.classList.remove('hidden');
    };

    const loadAuthorizedApps = async () => {
        if (!authorizedAppsList) return;
        const { data, error } = await apiRequest('/server/auth/nyaitter-auth/authorized-apps');
        authorizedAppsList.replaceChildren();
        if (error) {
            const errP = document.createElement('p');
            errP.className = 'settings-help-text nui-help-text';
            errP.textContent = `連携アプリの取得に失敗しました: ${error.message}`;
            authorizedAppsList.appendChild(errP);
            return;
        }
        const apps = Array.isArray(data?.apps) ? data.apps : [];
        if (apps.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'settings-help-text nui-help-text';
            empty.textContent = '連携中のアプリケーションはありません。';
            authorizedAppsList.appendChild(empty);
            return;
        }
        apps.forEach((app) => {
            const item = document.createElement('article');
            item.className = 'settings-session-item nyauth-app-item nui-list-item';
            item.style.cssText = 'display: flex; gap: 1rem; align-items: center; padding: 0.85rem;';

            const iconDiv = document.createElement('div');
            iconDiv.className = 'nyauth-settings-app-icon';
            if (app.app_icon_url) {
                const img = document.createElement('img');
                img.src = escapeHTML(getSafeHttpUrl(app.app_icon_url));
                img.alt = app.app_name;
                img.style.cssText = 'width: 44px; height: 44px; border-radius: 10px; object-fit: cover;';
                iconDiv.appendChild(img);
            } else {
                iconDiv.innerHTML = `<div style="width: 44px; height: 44px; border-radius: 10px; background: color-mix(in srgb, var(--primary-color) 15%, transparent); display: flex; align-items: center; justify-content: center; font-size: 1.4rem;">📱</div>`;
            }

            const details = document.createElement('div');
            details.className = 'settings-session-details nui-list-copy';
            details.style.flex = '1';

            const title = document.createElement('div');
            title.className = 'settings-session-title nui-list-title';
            title.textContent = app.app_name || '名称未設定';

            const idBadge = document.createElement('span');
            idBadge.className = 'settings-bot-token-id';
            idBadge.textContent = `ID: ${app.application_id || `grant:${app.id}`}`;
            title.appendChild(idBadge);

            if (app.has_continuous_access) {
                const contBadge = document.createElement('span');
                contBadge.className = 'nyauth-badge-continuous';
                contBadge.style.cssText = 'margin-left: 0.5rem; font-size: 0.75rem; padding: 0.15rem 0.4rem; border-radius: 4px; background: color-mix(in srgb, var(--primary-color) 20%, transparent); color: var(--primary-color); font-weight: 600;';
                contBadge.textContent = '継続アクセス';
                title.appendChild(contBadge);
            }

            const scopesDiv = document.createElement('div');
            scopesDiv.className = 'nyauth-scopes-badges';
            scopesDiv.style.cssText = 'margin: 0.4rem 0; display: flex; flex-wrap: wrap; gap: 0.35rem;';
            const scopeLabels = {
                'profile:read': '基本情報',
                'posts:read': 'ポスト閲覧',
                'posts:write': 'ポスト投稿',
                'dm:read': 'DM閲覧',
                'dm:write': 'DM送信',
                'notifications:read': '通知閲覧',
                'storage:access': 'ストレージ',
                'continuous_access': '継続アクセス',
            };
            const scopesList = Array.isArray(app.scopes) ? app.scopes : [];
            scopesList.forEach((sc) => {
                const badge = document.createElement('span');
                badge.style.cssText = 'font-size: 0.75rem; padding: 0.1rem 0.4rem; border-radius: 4px; background: color-mix(in srgb, var(--secondary-text-color) 15%, transparent); color: var(--text-color);';
                badge.textContent = scopeLabels[sc] || sc;
                scopesDiv.appendChild(badge);
            });

            const dates = document.createElement('p');
            dates.className = 'settings-session-dates nui-list-meta';
            const createdStr = app.created_at ? formatSecurityTimestamp(app.created_at) : '日時不明';
            const lastUsedStr = app.last_used_at ? formatSecurityTimestamp(app.last_used_at) : '未使用';
            dates.textContent = `連携日: ${createdStr} / 最終使用: ${lastUsedStr}`;

            details.append(title, scopesDiv, dates);

            const actions = document.createElement('div');
            actions.className = 'settings-session-actions nui-actions';
            actions.style.cssText = 'display: flex; gap: 0.5rem; align-items: center;';

            // Edit scopes button
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'settings-bot-secondary-button';
            editBtn.textContent = '権限を変更';
            editBtn.addEventListener('click', async () => {
                await openEditAppScopesModal(app, loadAuthorizedApps);
            });

            // Revoke button
            const revokeBtn = document.createElement('button');
            revokeBtn.type = 'button';
            revokeBtn.className = 'settings-session-revoke-button';
            revokeBtn.textContent = '連携を解除';
            revokeBtn.addEventListener('click', async () => {
                if (!(await showAppConfirm(`アプリケーション「${app.app_name}」の連携を解除しますか？\n解除するとこのアプリからのアクセスは直ちに停止されます。`))) return;
                revokeBtn.disabled = true;
                const { error: revokeError } = await apiRequest(`/server/auth/nyaitter-auth/authorized-apps/${encodeURIComponent(app.id)}`, { method: 'DELETE' });
                if (revokeError) {
                    showAppAlert(`連携の解除に失敗しました: ${revokeError.message}`);
                    revokeBtn.disabled = false;
                    return;
                }
                await loadAuthorizedApps();
            });

            actions.append(editBtn, revokeBtn);
            item.append(iconDiv, details, actions);
            authorizedAppsList.appendChild(item);
        });
    };

    const imposterList = document.getElementById('settings-imposter-list');
    const imposterLimit = document.getElementById('settings-imposter-limit');
    const imposterCreateContainer = document.getElementById('settings-imposter-create');
    const imposterNameInput = document.getElementById('settings-imposter-name');
    const imposterCreateButton = document.getElementById('settings-imposter-create-btn');
    const formatImposterId = (value) => formatNyaitterId({ nyaitter_id: value });
    const imposterRoleLabel = (role) => ({
        owner: '所有者',
        manager: '管理者',
        editor: '編集者',
    }[role] || '編集者');

    const loadImposters = async () => {
        if (!imposterList || !imposterLimit) return;
        imposterList.replaceChildren();
        imposterLimit.textContent = 'インポスターを読み込んでいます';
        const { data, error } = await apiRequest('/server/api/imposters');
        if (error) {
            imposterLimit.textContent = 'インポスター情報の取得に失敗しました。';
            const message = document.createElement('p');
            message.className = 'settings-help-text nui-help-text';
            message.textContent = error.message || 'インポスター情報を取得できませんでした。';
            imposterList.appendChild(message);
            return;
        }

        const imposters = Array.isArray(data?.imposters) ? data.imposters : [];
        const ownedCount = imposters.filter((imposter) => imposter?.imposter?.role === 'owner').length;
        const limit = Math.max(0, Number(data?.limit) || 0);
        const isCurrentImposter = Boolean(getCurrentUser()?.is_imposter);
        if (imposterCreateContainer) imposterCreateContainer.hidden = isCurrentImposter;
        imposterLimit.textContent = isCurrentImposter
            ? 'インポスターから新しいインポスターを作成することはできません。'
            : `作成済み: ${ownedCount} / ${limit}`;

        if (imposters.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'settings-help-text nui-help-text';
            empty.textContent = '利用できるインポスターはありません。';
            imposterList.appendChild(empty);
            return;
        }

        imposters.forEach((imposter) => {
            const metadata = imposter?.imposter || {};
            const canManage = metadata.role === 'owner' || metadata.role === 'manager';
            const item = document.createElement('article');
            item.className = 'settings-session-item nui-list-item';
            const details = document.createElement('div');
            details.className = 'settings-session-details nui-list-copy';
            const title = document.createElement('div');
            title.className = 'settings-session-title nui-list-title';
            title.textContent = imposter.name || `NyaitterID ${formatImposterId(imposter.id)}`;
            const idBadge = document.createElement('span');
            idBadge.className = 'settings-bot-token-id';
            idBadge.textContent = `NyaitterID: ${formatImposterId(imposter.nyaitter_id || imposter.id)}`;
            const roleBadge = document.createElement('span');
            roleBadge.className = 'settings-session-current nui-badge';
            roleBadge.textContent = imposterRoleLabel(metadata.role);
            title.append(' ', idBadge, ' ', roleBadge);
            details.appendChild(title);

            const memberSection = document.createElement('div');
            memberSection.className = 'settings-sessions-list';
            const members = Array.isArray(metadata.members) ? metadata.members : [];
            const memberHeading = document.createElement('p');
            memberHeading.className = 'settings-help-text nui-help-text';
            memberHeading.textContent = members.length > 0 ? '共同運用者' : '共同運用者はいません。';
            memberSection.appendChild(memberHeading);

            members.forEach((member) => {
                const memberRow = document.createElement('div');
                memberRow.className = 'settings-session-item nui-list-item';
                const memberDetails = document.createElement('div');
                memberDetails.className = 'settings-session-details nui-list-copy';
                memberDetails.textContent = `NyaitterID: ${formatImposterId(member.user_id)}`;
                memberRow.appendChild(memberDetails);
                if (canManage) {
                    const actions = document.createElement('div');
                    actions.className = 'settings-session-actions nui-actions';
                    const roleSelect = document.createElement('select');
                    roleSelect.dataset.imposterControl = 'true';
                    ['manager', 'editor'].forEach((role) => {
                        const option = document.createElement('option');
                        option.value = role;
                        option.textContent = imposterRoleLabel(role);
                        option.selected = member.role === role;
                        roleSelect.appendChild(option);
                    });
                    roleSelect.addEventListener('change', async () => {
                        roleSelect.disabled = true;
                        const { error: updateError } = await apiRequest(`/server/api/imposters/${encodeURIComponent(imposter.id)}/members/${encodeURIComponent(member.user_id)}`, {
                            method: 'PATCH',
                            body: { role: roleSelect.value },
                        });
                        if (updateError) showAppAlert(`権限の変更に失敗しました: ${updateError.message}`);
                        await loadImposters();
                    });
                    const removeButton = document.createElement('button');
                    removeButton.type = 'button';
                    removeButton.className = 'settings-session-revoke-button';
                    removeButton.textContent = '解除';
                    removeButton.addEventListener('click', async () => {
                        if (!(await showAppConfirm(`NyaitterID ${formatImposterId(member.user_id)} の共同運用を解除しますか？`))) return;
                        removeButton.disabled = true;
                        const { error: removeError } = await apiRequest(`/server/api/imposters/${encodeURIComponent(imposter.id)}/members/${encodeURIComponent(member.user_id)}`, { method: 'DELETE' });
                        if (removeError) showAppAlert(`共同運用者の解除に失敗しました: ${removeError.message}`);
                        await loadImposters();
                    });
                    actions.append(roleSelect, removeButton);
                    memberRow.appendChild(actions);
                } else {
                    const roleText = document.createElement('span');
                    roleText.className = 'settings-help-text nui-help-text';
                    roleText.textContent = imposterRoleLabel(member.role);
                    memberRow.appendChild(roleText);
                }
                memberSection.appendChild(memberRow);
            });

            if (canManage) {
                const inviteRow = document.createElement('div');
                inviteRow.className = 'settings-bot-create-form';
                const memberIdInput = document.createElement('input');
                memberIdInput.type = 'number';
                memberIdInput.min = '1';
                memberIdInput.placeholder = '共同運用者のNyaitterID';
                memberIdInput.dataset.imposterControl = 'true';
                const memberRoleSelect = document.createElement('select');
                memberRoleSelect.dataset.imposterControl = 'true';
                ['editor', 'manager'].forEach((role) => {
                    const option = document.createElement('option');
                    option.value = role;
                    option.textContent = imposterRoleLabel(role);
                    memberRoleSelect.appendChild(option);
                });
                const inviteButton = document.createElement('button');
                inviteButton.type = 'button';
                inviteButton.textContent = '招待';
                inviteButton.addEventListener('click', async () => {
                    const userId = Number(memberIdInput.value);
                    if (!Number.isInteger(userId) || userId <= 0) {
                        showAppAlert('共同運用者のNyaitterIDを入力してください。');
                        return;
                    }
                    inviteButton.disabled = true;
                    const { error: inviteError } = await apiRequest(`/server/api/imposters/${encodeURIComponent(imposter.id)}/members`, {
                        method: 'POST',
                        body: { user_id: userId, role: memberRoleSelect.value },
                    });
                    if (inviteError) showAppAlert(`共同運用者の招待に失敗しました: ${inviteError.message}`);
                    await loadImposters();
                });
                inviteRow.append(memberIdInput, memberRoleSelect, inviteButton);
                memberSection.appendChild(inviteRow);
            }
            details.appendChild(memberSection);

            const actions = document.createElement('div');
            actions.className = 'settings-session-actions nui-actions';
            if (metadata.role === 'owner') {
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'settings-danger-button';
                deleteButton.textContent = 'インポスターを削除';
                deleteButton.addEventListener('click', async () => {
                    if (!(await showAppConfirm(`インポスター「${imposter.name || formatImposterId(imposter.id)}」を削除しますか？\nこの操作は取り消せません。`))) return;
                    deleteButton.disabled = true;
                    const { error: deleteError } = await apiRequest(`/server/api/imposters/${encodeURIComponent(imposter.id)}`, { method: 'DELETE' });
                    if (deleteError) showAppAlert(`インポスターの削除に失敗しました: ${deleteError.message}`);
                    await loadImposters();
                });
                actions.appendChild(deleteButton);
            }
            item.append(details, actions);
            imposterList.appendChild(item);
        });
    };

    imposterCreateButton?.addEventListener('click', async () => {
        const name = (imposterNameInput?.value || '').trim();
        if (!name) {
            showAppAlert('インポスターの表示名を入力してください。');
            return;
        }
        imposterCreateButton.disabled = true;
        const { error } = await apiRequest('/server/api/imposters', {
            method: 'POST',
            body: { name },
        });
        if (error) showAppAlert(`インポスターの作成に失敗しました: ${error.message}`);
        else if (imposterNameInput) imposterNameInput.value = '';
        imposterCreateButton.disabled = false;
        await loadImposters();
    });

    const formatStorageSize = (value) => {
        const bytes = Math.max(0, Number(value) || 0);
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    const loadUserStorage = async () => {
        const summary = document.getElementById('settings-storage-summary');
        const progress = document.getElementById('settings-storage-progress-value');
        const fileList = document.getElementById('settings-storage-files');
        if (!summary || !progress || !fileList) return;

        summary.textContent = 'ストレージ使用量を読み込んでいます';
        fileList.replaceChildren();
        const { data, error } = await apiRequest('/server/api/uploads/storage');
        if (error) {
            summary.textContent = 'ストレージ情報の取得に失敗しました。';
            progress.style.width = '0%';
            return;
        }

        const payload = data?.data || data || {};
        const usedBytes = Math.max(0, Number(payload.used_bytes) || 0);
        const limitBytes = Math.max(1, Number(payload.limit_bytes) || 1);
        const percent = Math.min(100, Math.max(0, Number(payload.used_percent) || (usedBytes / limitBytes) * 100));
        summary.textContent = `${formatStorageSize(usedBytes)} / ${formatStorageSize(limitBytes)}`;
        progress.style.width = `${percent}%`;

        const files = Array.isArray(payload.files) ? payload.files : [];
        if (files.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'settings-help-text nui-help-text';
            empty.textContent = '保存済みファイルはありません。';
            fileList.appendChild(empty);
            return;
        }

        files.forEach((file) => {
            const item = document.createElement('article');
            item.className = 'settings-session-item settings-storage-file nui-list-item';
            const details = document.createElement('div');
            details.className = 'settings-session-details nui-list-copy';
            const title = document.createElement('div');
            title.className = 'settings-session-title nui-list-title';
            title.textContent = file.name || file.id || '名称不明のファイル';
            const meta = document.createElement('p');
            meta.className = 'settings-session-dates nui-list-meta';
            const updatedAt = file.updatedAt ? formatSecurityTimestamp(file.updatedAt) : '日時不明';
            meta.textContent = `サイズ: ${formatStorageSize(file.size)} / 更新: ${updatedAt}`;
            details.append(title, meta);

            const actions = document.createElement('div');
            actions.className = 'settings-session-actions nui-actions';
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'settings-session-revoke-button';
            deleteButton.textContent = '削除';
            deleteButton.addEventListener('click', async () => {
                if (!file.id || !(await showAppConfirm(`ファイル「${file.name || file.id}」を削除しますか？\n投稿やプロフィールで使用中の場合、表示できなくなることがあります。`))) return;
                deleteButton.disabled = true;
                const { error: deleteError } = await apiRequest('/server/api/uploads', {
                    method: 'DELETE',
                    body: { fileIds: [file.id] },
                });
                if (deleteError) {
                    showAppAlert(`ファイルの削除に失敗しました: ${deleteError.message}`);
                    deleteButton.disabled = false;
                    return;
                }
                await loadUserStorage();
            });
            actions.appendChild(deleteButton);
            item.append(details, actions);
            fileList.appendChild(item);
        });
    };

    document.getElementById('settings-storage-refresh-btn')?.addEventListener('click', () => {
        void loadUserStorage();
    });

    const renderResourceLinks = () => {
        const resourceLinksList = document.getElementById('settings-resource-links');
        if (!resourceLinksList) return;

        resourceLinksList.replaceChildren();
        const resourceLinks = globalThis.NyaitterClientConfig?.resourceLinks;
        const resources = Array.isArray(resourceLinks) ? resourceLinks : [];
        if (resources.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'settings-help-text nui-help-text';
            empty.textContent = '表示するリソースリンクはありません。';
            resourceLinksList.appendChild(empty);
            return;
        }

        resources.forEach((resource) => {
            if (
                !resource ||
                typeof resource.name !== 'string' ||
                typeof resource.url !== 'string'
            ) {
                return;
            }
            const item = document.createElement('article');
            item.className = 'settings-session-item nui-list-item';
            const link = document.createElement('a');
            link.className = 'settings-session-title nui-list-title';
            link.textContent = resource.name;
            link.href = resource.url;
            if (/^https:\/\//i.test(resource.url)) {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
            item.appendChild(link);
            resourceLinksList.appendChild(item);
        });
    };

    function createHomeTabItemElement(tabDef, zone = 'active', isOnlyActive = false) {
        const item = document.createElement('div');
        item.className = 'home-tab-item nui-list-item';
        item.draggable = true;
        item.dataset.tabKey = tabDef.key;
        item.dataset.zone = zone;

        item.innerHTML = `
            <div class="home-tab-item-main">
                <span class="home-tab-handle" title="ドラッグして並び替え">⠿</span>
                <div class="home-tab-info">
                    <span class="home-tab-name nui-list-title">${escapeHTML(tabDef.name)}</span>
                    <span class="home-tab-description nui-list-meta">${escapeHTML(tabDef.description)}</span>
                </div>
            </div>
            <div class="home-tab-actions nui-actions">
                ${zone === 'available' ? `
                    <button type="button" class="home-tab-action-btn home-tab-add-btn nui-button-secondary" data-action="add-tab" title="有効なタブに追加">＋ 追加</button>
                ` : `
                    <button type="button" class="home-tab-action-btn nui-button-secondary" data-action="move-up" title="上へ移動">↑</button>
                    <button type="button" class="home-tab-action-btn nui-button-secondary" data-action="move-down" title="下へ移動">↓</button>
                    <button type="button" class="home-tab-action-btn home-tab-remove-btn nui-button-secondary" data-action="remove-tab" title="無効化" ${isOnlyActive ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>✕</button>
                `}
            </div>
        `;

        return item;
    }

    function renderHomeTabsCustomizer() {
        const availableList = document.getElementById('home-tabs-available-list');
        const activeList = document.getElementById('home-tabs-active-list');
        if (!availableList || !activeList) return;

        const activeKeys = getSavedHomeTabs();
        const availableKeys = ALL_HOME_TABS.map((t) => t.key).filter((k) => !activeKeys.includes(k));

        availableList.innerHTML = '';
        activeList.innerHTML = '';

        availableKeys.forEach((key) => {
            const def = ALL_HOME_TABS.find((t) => t.key === key);
            if (def) availableList.appendChild(createHomeTabItemElement(def, 'available'));
        });

        activeKeys.forEach((key) => {
            const def = ALL_HOME_TABS.find((t) => t.key === key);
            if (def) activeList.appendChild(createHomeTabItemElement(def, 'active', activeKeys.length <= 1));
        });
    }

    function getDragAfterElement(container, y, selector = '.home-tab-item') {
        const draggableElements = [...container.querySelectorAll(`${selector}:not(.dragging)`)];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function setupHomeTabsCustomizer() {
        const container = document.querySelector('.home-tabs-customizer');
        if (!container) return;
        renderHomeTabsCustomizer();

        if (container.dataset.dndInitialized) return;
        container.dataset.dndInitialized = 'true';

        let draggedItem = null;

        container.addEventListener('dragstart', (e) => {
            const item = e.target.closest('.home-tab-item');
            if (!item) return;
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.tabKey);
        });

        container.addEventListener('dragend', () => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                draggedItem = null;
            }
            document.querySelectorAll('.home-tabs-list').forEach((l) => l.classList.remove('drag-over'));
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const list = e.target.closest('.home-tabs-list');
            if (!list) return;
            e.dataTransfer.dropEffect = 'move';
            list.classList.add('drag-over');

            const afterElement = getDragAfterElement(list, e.clientY);
            if (draggedItem) {
                if (afterElement == null) {
                    list.appendChild(draggedItem);
                } else {
                    list.insertBefore(draggedItem, afterElement);
                }
            }
        });

        container.addEventListener('dragleave', (e) => {
            const list = e.target.closest('.home-tabs-list');
            if (list && !list.contains(e.relatedTarget)) {
                list.classList.remove('drag-over');
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            document.querySelectorAll('.home-tabs-list').forEach((l) => l.classList.remove('drag-over'));
            const activeList = document.getElementById('home-tabs-active-list');
            if (!activeList) return;

            const currentActiveItems = Array.from(activeList.querySelectorAll('.home-tab-item'));
            let newActiveKeys = currentActiveItems.map((item) => item.dataset.tabKey).filter(Boolean);
            if (newActiveKeys.length === 0) {
                newActiveKeys = [...DEFAULT_HOME_TABS];
            }
            saveHomeTabs(newActiveKeys);
            renderHomeTabsCustomizer();
        });

        // Click / Touch buttons action (Add, Remove, Move Up/Down)
        container.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-action]');
            if (!actionBtn) return;
            const item = actionBtn.closest('.home-tab-item');
            if (!item) return;
            const tabKey = item.dataset.tabKey;
            const action = actionBtn.dataset.action;

            let activeKeys = getSavedHomeTabs();

            if (action === 'add-tab') {
                if (!activeKeys.includes(tabKey)) {
                    activeKeys.push(tabKey);
                    saveHomeTabs(activeKeys);
                    renderHomeTabsCustomizer();
                }
            } else if (action === 'remove-tab') {
                if (activeKeys.length > 1) {
                    activeKeys = activeKeys.filter((k) => k !== tabKey);
                    saveHomeTabs(activeKeys);
                    renderHomeTabsCustomizer();
                }
            } else if (action === 'move-up') {
                const idx = activeKeys.indexOf(tabKey);
                if (idx > 0) {
                    const temp = activeKeys[idx - 1];
                    activeKeys[idx - 1] = activeKeys[idx];
                    activeKeys[idx] = temp;
                    saveHomeTabs(activeKeys);
                    renderHomeTabsCustomizer();
                }
            } else if (action === 'move-down') {
                const idx = activeKeys.indexOf(tabKey);
                if (idx >= 0 && idx < activeKeys.length - 1) {
                    const temp = activeKeys[idx + 1];
                    activeKeys[idx + 1] = activeKeys[idx];
                    activeKeys[idx] = temp;
                    saveHomeTabs(activeKeys);
                    renderHomeTabsCustomizer();
                }
            }
        });

        const resetBtn = document.getElementById('reset-home-tabs-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                saveHomeTabs([...DEFAULT_HOME_TABS]);
                renderHomeTabsCustomizer();
            });
        }
    }

    const SIDE_MENU_ZONES = ['bar', 'more'];
    let sideMenuOutlet = 'pc';

    function getSideMenuItemDef(key) {
        return ALL_SIDEBAR_ITEMS.find((item) => item.key === key);
    }

    function getSideMenuList(container, outlet, zone) {
        return container.querySelector(
            `.side-menu-zone[data-outlet="${outlet}"] .side-menu-list[data-zone="${zone}"]`,
        );
    }

    function readSideMenuZones(container, outlet) {
        const readZone = (zone) => {
            const list = getSideMenuList(container, outlet, zone);
            if (!list) return [];
            return [...list.querySelectorAll(':scope > .side-menu-item')]
                .map((item) => item.dataset.itemKey)
                .filter(Boolean);
        };
        return { bar: readZone('bar'), more: readZone('more') };
    }

    function createSideMenuItemElement(itemDef, zone = 'bar') {
        const item = document.createElement('div');
        item.className = 'side-menu-item nui-list-item';
        item.draggable = true;
        item.dataset.itemKey = itemDef.key;
        item.dataset.zone = zone;

        const rawHash = String(itemDef.hash || '');
        const hashHint = rawHash ? (rawHash.startsWith('#') ? rawHash : `#${rawHash}`) : '';
        const zoneAction = zone === 'more'
            ? '<button type="button" class="side-menu-action-btn side-menu-to-bar-btn nui-button-secondary" data-action="to-bar" title="バーに表示し直す">バーへ</button>'
            : '<button type="button" class="side-menu-action-btn side-menu-to-more-btn nui-button-secondary" data-action="to-more" title="その他にまとめる">その他へ</button>';

        // バー側の下限は設けないので、全項目を「その他」に移せる
        item.innerHTML = `
            <div class="side-menu-item-main">
                <span class="side-menu-handle" title="ドラッグして並び替え">⠿</span>
                <span class="side-menu-name nui-list-title">${escapeHTML(itemDef.name)}</span>
                ${hashHint ? `<span class="side-menu-hash nui-list-meta">${escapeHTML(hashHint)}</span>` : ''}
            </div>
            <div class="side-menu-actions nui-actions">
                <button type="button" class="side-menu-action-btn nui-button-secondary" data-action="move-up" title="上へ移動">↑</button>
                <button type="button" class="side-menu-action-btn nui-button-secondary" data-action="move-down" title="下へ移動">↓</button>
                ${zoneAction}
            </div>
        `;

        return item;
    }

    function renderSideMenuCustomizer() {
        const container = document.querySelector('.side-menu-customizer');
        if (!container) return;

        const zones = getSavedSideMenu()[sideMenuOutlet];

        SIDE_MENU_ZONES.forEach((zone) => {
            const list = getSideMenuList(container, sideMenuOutlet, zone);
            if (!list) return;
            list.innerHTML = '';
            zones[zone].forEach((key) => {
                list.appendChild(createSideMenuItemElement(getSideMenuItemDef(key), zone));
            });
        });
    }

    function setupSideMenuCustomizer() {
        const container = document.querySelector('.side-menu-customizer');
        if (!container) return;
        renderSideMenuCustomizer();

        if (container.dataset.dndInitialized) return;
        container.dataset.dndInitialized = 'true';

        let draggedItem = null;

        const clearDragOver = () => {
            container.querySelectorAll('.side-menu-list').forEach((list) => list.classList.remove('drag-over'));
        };
        const commit = (zones) => {
            saveSideMenu(sideMenuOutlet, zones);
            renderSideMenuCustomizer();
        };

        container.addEventListener('dragstart', (e) => {
            const item = e.target.closest('.side-menu-item');
            if (!item) return;
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.itemKey);
        });

        container.addEventListener('dragend', () => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                draggedItem = null;
            }
            clearDragOver();
            // ドロップを放棄するとDOMだけ並びが変わる。保存済みモデルから描き直す
            renderSideMenuCustomizer();
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const list = e.target.closest('.side-menu-list');
            if (!list) return;
            e.dataTransfer.dropEffect = 'move';
            clearDragOver();
            list.classList.add('drag-over');

            const afterElement = getDragAfterElement(list, e.clientY, '.side-menu-item');
            if (draggedItem) {
                if (afterElement == null) {
                    list.appendChild(draggedItem);
                } else {
                    list.insertBefore(draggedItem, afterElement);
                }
            }
        });

        container.addEventListener('dragleave', (e) => {
            const list = e.target.closest('.side-menu-list');
            if (list && !list.contains(e.relatedTarget)) {
                list.classList.remove('drag-over');
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            clearDragOver();
            // ドラッグ中にDOMが移動済みなので、現在の並びを読み取って保存する。
            commit(readSideMenuZones(container, sideMenuOutlet));
        });

        container.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-action]');
            if (!actionBtn || actionBtn.disabled) return;
            const item = actionBtn.closest('.side-menu-item');
            if (!item) return;
            const itemKey = item.dataset.itemKey;
            if (!itemKey) return;
            const action = actionBtn.dataset.action;

            const zones = readSideMenuZones(container, sideMenuOutlet);
            const fromZone = item.closest('.side-menu-list')?.dataset.zone === 'more' ? 'more' : 'bar';
            const keys = zones[fromZone];
            const index = keys.indexOf(itemKey);
            if (index < 0) return;

            if (action === 'move-up' || action === 'move-down') {
                const target = action === 'move-up' ? index - 1 : index + 1;
                if (target < 0 || target >= keys.length) return;
                keys[target] = keys.splice(index, 1, keys[target])[0];
            } else if (action === 'to-more' || action === 'to-bar') {
                const toZone = action === 'to-bar' ? 'bar' : 'more';
                keys.splice(index, 1);
                zones[toZone].push(itemKey);
            } else {
                return;
            }

            commit(zones);
        });

        const tabButtons = [...document.querySelectorAll('.side-menu-outlet-tab')];
        const zoneElements = [...document.querySelectorAll('.side-menu-zone')];
        const activateOutlet = (outlet) => {
            sideMenuOutlet = outlet === 'mobile' ? 'mobile' : 'pc';
            tabButtons.forEach((tab) => {
                const active = tab.dataset.outlet === sideMenuOutlet;
                tab.setAttribute('aria-selected', active ? 'true' : 'false');
                tab.tabIndex = active ? 0 : -1;
            });
            zoneElements.forEach((zone) => {
                zone.hidden = zone.dataset.outlet !== sideMenuOutlet;
            });
            renderSideMenuCustomizer();
        };
        tabButtons.forEach((tab) => {
            tab.addEventListener('click', () => activateOutlet(tab.dataset.outlet));
        });

        const resetBtn = document.getElementById('side-menu-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                commit(DEFAULT_SIDEBAR[sideMenuOutlet]);
            });
        }
    }

    const selectSettingsGroup = (group) => {
        const activeGroup = SETTINGS_GROUP_DETAILS[group] ? group : 'overview';
        const details = SETTINGS_GROUP_DETAILS[activeGroup];
        const title = document.getElementById('settings-group-title');
        const description = document.getElementById('settings-group-description');
        if (title) title.textContent = details.title;
        if (description) description.textContent = details.description;
        const mobileCategory = document.getElementById('settings-mobile-category');
        if (mobileCategory) mobileCategory.value = activeGroup;

        document.querySelectorAll('.settings-group-button').forEach((button) => {
            const active = button.dataset.settingsGroup === activeGroup;
            button.classList.toggle('active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
        document.querySelectorAll('.settings-group-panel').forEach((panel) => {
            panel.hidden = panel.dataset.settingsPanel !== activeGroup;
        });
        if (activeGroup === 'home') {
            setupHomeTabsCustomizer();
        }
        if (activeGroup === 'menu') {
            setupSideMenuCustomizer();
        }
        if (activeGroup === 'account') {
            void loadLoginSecuritySessions();
            void loadBlockedLoginIps();
            void loadAuthProvidersSettings();
        }
        if (activeGroup === 'notifications') void loadPushSettingsState();
        if (activeGroup === 'storage') void loadUserStorage();
        if (activeGroup === 'apps') void loadAuthorizedApps();
        if (activeGroup === 'api') void loadUserBotTokens();
        if (activeGroup === 'imposter') void loadImposters();
        if (activeGroup === 'resources') renderResourceLinks();
        if (activeGroup === 'client') void loadClientSettings();
    };

    const dangerZone = document.querySelector('.settings-danger-zone');
    if (dangerZone) {
        const isImposter = Boolean(getCurrentUser()?.is_imposter);
        let dangerZoneHTML = `
            <section class="nui-section settings-account-identity" aria-labelledby="settings-nyaitter-id-title">
                <h4 class="nui-section-title" id="settings-nyaitter-id-title">NyaitterID</h4>
                <p class="settings-help-text nui-help-text">再割り当てをした場合元のIDに戻すことはできません。</p>
                <button type="button" id="settings-reassign-nyaitter-id-btn" class="nui-button-secondary">NyaitterIDを再割り当て</button>
            </section>
            ${isImposter ? '' : `
                <section class="nui-section settings-account-delete" aria-labelledby="settings-account-delete-title">
                    <h4 class="nui-section-title" id="settings-account-delete-title">NyaitterIDの破棄</h4>
                    <p class="settings-help-text nui-help-text">あなたのNyaitterIDを破棄し、全てのデータを削除します。この操作は取り消せません。</p>
                    <button type="button" id="settings-delete-account-btn" class="settings-danger-button nui-button-danger">NyaitterIDを破棄</button>
                </section>
            `}
            <button type="button" id="settings-account-switcher-btn" class="nui-button-secondary">アカウント切替</button>
            ${isImposter ? '' : '<button type="button" id="settings-logout-btn" class="nui-button-secondary">ログアウト</button>'}
        `;
        if (getCurrentUser().admin) {
            dangerZoneHTML += `<a href="#admin/logs" id="settings-showlog-btn" class="nui-link" style="display:block;margin-top:0.5rem;">アクセスログ</a>`;
        }
        dangerZone.innerHTML = dangerZoneHTML;
    }

    const settingsRoot = document.getElementById('settings-screen');
    rebuildSettings(settingsRoot);
    const stopUsageUpdates = bindSettingsNetworkUsage(settingsRoot);
    settingsScreenContext?.addCleanup(stopUsageUpdates);
    bindSettingsDiscovery(settingsRoot, selectSettingsGroup, () => requestSettingsSave(document.getElementById('settings-form')));
    selectSettingsGroup(initialGroup);

    // Profile icons & header
    const iconInput = document.getElementById('setting-icon-input');
    const iconPreview = document.getElementById('setting-icon-preview');
    iconPreview?.addEventListener('click', () => iconInput?.click());
    iconInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        setResetIconToDefault(false);
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const MAX_DIMENSION = 300;
                let { width, height } = img;
                if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                    if (width > height) {
                        height = Math.round((height * MAX_DIMENSION) / width);
                        width = MAX_DIMENSION;
                    } else {
                        width = Math.round((width * MAX_DIMENSION) / height);
                        height = MAX_DIMENSION;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                setNewIconDataUrl(canvas.toDataURL(file.type));
                if (iconPreview) iconPreview.src = getNewIconDataUrl();
                requestSettingsSave(document.getElementById('settings-form'));
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('reset-icon-btn')?.addEventListener('click', () => {
        setResetIconToDefault(true);
        setNewIconDataUrl(null);
        if (iconInput) iconInput.value = '';
        if (iconPreview) iconPreview.src = getUserIconUrl(getCurrentUser());
        requestSettingsSave(document.getElementById('settings-form'));
    });

    const headerInput = document.getElementById('setting-header-input');
    const headerPreview = document.getElementById('setting-header-preview');
    headerPreview?.addEventListener('click', () => headerInput?.click());
    headerInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        setResetHeaderToDefault(false);
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const maxWidth = 1500;
                const maxHeight = 600;
                const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
                const width = Math.max(1, Math.round(img.width * scale));
                const height = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                setNewHeaderDataUrl(canvas.toDataURL(file.type));
                if (headerPreview) {
                    const previewImage = document.createElement('img');
                    previewImage.src = getNewHeaderDataUrl();
                    previewImage.alt = 'header image preview';
                    headerPreview.replaceChildren(previewImage);
                    headerPreview.classList.remove('is-empty');
                }
                requestSettingsSave(document.getElementById('settings-form'));
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('reset-header-btn')?.addEventListener('click', () => {
        setResetHeaderToDefault(true);
        setNewHeaderDataUrl(null);
        if (headerInput) headerInput.value = '';
        if (headerPreview) {
            headerPreview.replaceChildren();
            headerPreview.classList.add('is-empty');
        }
        requestSettingsSave(document.getElementById('settings-form'));
    });

    applyServerInputLimits(document.getElementById('settings-screen'));
    const settingsForm = document.getElementById('settings-form');
    settingsForm?.addEventListener('submit', (e) => e.preventDefault());
    let settingsChangeDebouncetimer;
    settingsScreenContext?.addCleanup(() => {
        if (settingsChangeDebouncetimer) clearTimeout(settingsChangeDebouncetimer);
    });
    settingsForm?.querySelectorAll('select, input[type="checkbox"]').forEach((control) => {
        control.addEventListener('change', async () => {
            if (control.dataset.imposterControl === 'true') return;
            if (control.id === 'setting-theme') applyInterfaceTheme(control.value);
            if (control.id === 'setting-ui-mode') setUiMode(control.value);
            if (control.id === 'setting-ip-trust-enabled' && control.checked) {
                const { error } = await apiRequest('/server/auth/trust-current-ip', { method: 'POST' });
                if (error) {
                    control.checked = false;
                    showAppAlert('現在の端末を信頼済みにできなかったため、この設定は有効化されませんでした。');
                }
            }
            clearTimeout(settingsChangeDebouncetimer);
            settingsChangeDebouncetimer = setTimeout(() => requestSettingsSave(settingsForm), 400);
        });
    });
    settingsForm?.querySelectorAll('input[type="text"], textarea').forEach((control) => {
        // 1文字入力するごとに保存すると自動保存が連打され、保存 API の
        // レート制限に達してしまう。入力の確定時（blur / Enter による blur）
        // にのみ保存する。
        control.addEventListener('blur', () => {
            clearTimeout(settingsChangeDebouncetimer);
            requestSettingsSave(settingsForm);
        });
    });
    settingsForm?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.matches('input[type="text"]')) {
            event.preventDefault();
            event.target.blur();
        }
    });

    document.getElementById('push-notification-action')?.addEventListener('click', togglePushSubscription);
    document.getElementById('settings-account-switcher-btn')?.addEventListener('click', openAccountSwitcherModal);
    document.getElementById('settings-logout-btn')?.addEventListener('click', handleLogout);

    document.getElementById('settings-reassign-nyaitter-id-btn')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        if (!(await showAppConfirm('NyaitterIDを再割り当てしますか？ 現在のIDへ戻せない場合があります。'))) return;
        button.disabled = true;

        const previousId = getCurrentUser()?.id != null ? Number(getCurrentUser().id) : null;
        const { data, error } = await apiRequest('/server/api/users/me/nyaitter-id/reassign', {
            method: 'POST',
            body: {},
        });
        if (error) {
            button.disabled = false;
            showAppAlert(error.message || 'NyaitterIDを再割り当てできませんでした。');
            return;
        }
        if (data?.user) {
            const newUser = data.user;
            const newUserId = Number(newUser.id);
            invalidateCachesAfterUserIdReassignment(previousId, newUserId);
            setCurrentUser(newUser);
            updateAccountData(newUser, previousId);
            if (previousId != null) {
                getPublicProfileCache().delete(previousId);
                getAllUsersCache().delete(previousId);
            }
            getPublicProfileCache().set(newUserId, newUser);
            cacheUser(newUser);
            await updateNavAndSidebars();
        }
        showAppAlert('NyaitterIDを再割り当てしました。');
        await router();
    });

    document.getElementById('settings-delete-account-btn')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        if (!(await showAppConfirm('アカウントを削除しますか？ 投稿、DM、セッションなどのデータは削除され、元に戻せません。'))) return;
        button.disabled = true;

        const { data: prepared, error: prepareError } = await apiRequest('/server/api/users/me/account/delete/prepare', {
            method: 'POST',
            body: {},
        });
        if (prepareError || !prepared?.confirmation_token) {
            button.disabled = false;
            showAppAlert(prepareError?.message || 'アカウント削除の確認を開始できませんでした。');
            return;
        }
        if (!(await showAppConfirm('確認: このアカウントとすべてのコンテンツを完全に削除します。本当に続行しますか？'))) {
            button.disabled = false;
            return;
        }
        const { error } = await apiRequest('/server/api/users/me/account', {
            method: 'DELETE',
            body: { confirmation_token: prepared.confirmation_token },
        });
        if (error) {
            button.disabled = false;
            showAppAlert(error.message || 'アカウントを削除できませんでした。');
            return;
        }
        await api.auth.signOut().catch(() => {});
        setCurrentUser(null);
        unsubscribeFromChanges();
        window.location.hash = '#';
        await router();
    });

    showLoading(false);
}
