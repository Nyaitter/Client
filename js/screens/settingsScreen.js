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
} from '../state.js';
import {
    cacheUser,
    invalidateTimelinePageCache,
    invalidateDmCaches,
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
import { uploadFileViaEdgeFunction, deleteFilesViaEdgeFunction } from '../modules/posts.js';
import {
    escapeHTML,
    getUserIconUrl,
    getUserHeaderImageUrl,
    copyTextToClipboard,
    formatSecurityTimestamp,
    formatNyaitterId,
    normalizePostTimestampFormat,
    applyServerInputLimits,
    showLoading,
    showAppAlert,
    showAppConfirm,
} from '../utils/helpers.js';

const { resourceLinks: RESOURCE_LINKS, apiUrl } = globalThis.NyaitterClientConfig || {};

export function getSettingsGroupFromHash(hash = window.location.hash) {
    const match = /^#settings\/([a-z0-9_-]+)/i.exec(hash || '');
    return match ? match[1].toLowerCase() : 'profile';
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

export function requestSettingsSave(form = document.getElementById('settings-form')) {
    if (!getCurrentUser() || !form) return;
    if (getSettingsSaveInFlight()) {
        setSettingsSaveQueued(true);
        return;
    }
    void saveSettings(form);
}

export async function saveSettings(form) {
    if (!getCurrentUser() || !form) return;
    if (!form.reportValidity()) return;

    setSettingsSaveInFlight(true);

    try {
        const updatedData = {
            name: form.querySelector('#setting-username')?.value.trim(),
            me: form.querySelector('#setting-me')?.value.trim(),
            settings: {
                ...(getCurrentUser().settings || {}),
                lock: form.querySelector('#setting-lock')?.checked || false,
                show_like: form.querySelector('#setting-show-like')?.checked || false,
                show_follow: form.querySelector('#setting-show-follow')?.checked || false,
                show_follower: form.querySelector('#setting-show-follower')?.checked ?? true,
                show_star: form.querySelector('#setting-show-star')?.checked || false,
                show_scid: form.querySelector('#setting-show-scid')?.checked || false,
                reject_unknown_login: form.querySelector('#setting-reject-unknown-login')?.checked ?? true,
                post_timestamp_format: normalizePostTimestampFormat(
                    form.querySelector('#setting-post-timestamp-format')?.value,
                ),
                emoji: form.querySelector('#setting-emoji-kind')?.value || 'twemoji',
                content_editor:
                    form.querySelector('#setting-content-editor')?.value === 'nyaitter'
                        ? 'nyaitter'
                        : 'textarea',
                data_saver: form.querySelector('#setting-data-saver')?.checked || false,
                theme: form.querySelector('#setting-theme')?.value || 'light',
                color_theme: normalizeColorTheme(
                    form.querySelector('#setting-color-theme')?.value,
                ),
                custom_colors: getCustomColorsFromInputs(form),
            },
        };
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
                );
                uploadedFileIds.push(fileId);
                updatedData.icon_data = fileId;
                if (previousStoredIconId) previousStoredFileIds.add(previousStoredIconId);
            }
            if (getResetHeaderToDefault()) {
                updatedData.header_image = null;
                if (previousStoredHeaderId) previousStoredFileIds.add(previousStoredHeaderId);
            } else if (getNewHeaderDataUrl()) {
                const fileId = await uploadFileViaEdgeFunction(
                    imageDataUrlToFile(getNewHeaderDataUrl()),
                );
                uploadedFileIds.push(fileId);
                updatedData.header_image = fileId;
                if (previousStoredHeaderId) previousStoredFileIds.add(previousStoredHeaderId);
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
        applyDataSaverRealtimePreference();
        refreshMarkdownContentEditors();
        await updateNavAndSidebars();
        setNewIconDataUrl(null);
        setResetIconToDefault(false);
        setNewHeaderDataUrl(null);
        setResetHeaderToDefault(false);
    } catch (error) {
        console.error('設定の自動保存に失敗:', error);
    } finally {
        setSettingsSaveInFlight(false);
        if (getSettingsSaveQueued()) {
            setSettingsSaveQueued(false);
            requestSettingsSave(form);
        }
    }
}

export async function showSettingsScreen(initialGroup = getSettingsGroupFromHash(), showScreenFn = null) {
    if (!getCurrentUser()) {
        window.location.hash = '#';
        return;
    }
    DOM.pageHeader.innerHTML = `<h2 id="page-title">設定</h2>`;
    if (typeof showScreenFn === 'function') {
        showScreenFn('settings-screen');
    } else {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
        document.getElementById('settings-screen')?.classList.remove('hidden');
    }

    setNewIconDataUrl(null);
    setResetIconToDefault(false);
    setNewHeaderDataUrl(null);
    setResetHeaderToDefault(false);

    document.getElementById('settings-screen').innerHTML = `
        <div class="settings-layout">
            <nav class="settings-group-list" aria-label="設定グループ">
                <a href="#settings/profile" class="settings-group-button" data-settings-group="profile">プロフィール</a>
                <a href="#settings/privacy" class="settings-group-button" data-settings-group="privacy">プライバシーとセキュリティ</a>
                <a href="#settings/ui" class="settings-group-button" data-settings-group="ui">UI / フォント</a>
                <a href="#settings/notifications" class="settings-group-button" data-settings-group="notifications">通知</a>
                <a href="#settings/storage" class="settings-group-button" data-settings-group="storage">ストレージ</a>
                <a href="#settings/api" class="settings-group-button" data-settings-group="api">API / Bot</a>
                <a href="#settings/imposter" class="settings-group-button" data-settings-group="imposter">インポスター</a>
                <a href="#settings/resources" class="settings-group-button" data-settings-group="resources">リソース</a>
            </nav>
            <form id="settings-form" class="settings-detail">
                <div class="settings-detail-heading">
                    <h3 id="settings-group-title">プロフィール</h3>
                    <p id="settings-group-description" class="settings-group-description">プロフィールに表示される情報と画像を設定します。</p>
                </div>
                <section class="settings-group-panel" data-settings-panel="profile">
                    <label for="setting-username">ユーザー名</label>
                    <input type="text" id="setting-username" required data-server-input-limit="user_name_length" value="${escapeHTML(getCurrentUser().name)}">
                    <label for="setting-icon-input">アイコン</label>
                    <div class="setting-icon-container">
                        <img id="setting-icon-preview" src="${getUserIconUrl(getCurrentUser())}" alt="アイコンのプレビュー" title="クリックしてファイルを選択">
                        <button type="button" id="reset-icon-btn">デフォルトに戻す</button>
                    </div>
                    <input type="file" id="setting-icon-input" accept="image/*" class="hidden">
                    <label for="setting-header-input">ヘッダー画像</label>
                    <div class="setting-header-container">
                        <div id="setting-header-preview" class="setting-header-preview ${getUserHeaderImageUrl(getCurrentUser()) ? '' : 'is-empty'}" title="クリックしてファイルを選択">
                            ${getUserHeaderImageUrl(getCurrentUser()) ? `<img src="${escapeHTML(getUserHeaderImageUrl(getCurrentUser()))}" alt="ヘッダー画像のプレビュー">` : '<span>ヘッダー画像を選択</span>'}
                        </div>
                        <button type="button" id="reset-header-btn">ヘッダー画像を削除</button>
                    </div>
                    <input type="file" id="setting-header-input" accept="image/*" class="hidden">
                    <label for="setting-me">自己紹介</label>
                    <textarea id="setting-me" data-server-input-limit="profile_bio_length">${escapeHTML(getCurrentUser().me || '')}</textarea>
                </section>
                <section class="settings-group-panel" data-settings-panel="privacy" hidden>
                    <fieldset><legend>公開設定</legend>
                        <label><input type="checkbox" id="setting-show-like" ${getCurrentUser().settings?.show_like ? 'checked' : ''}> いいねしたポストを公開する</label>
                        <label><input type="checkbox" id="setting-show-follow" ${getCurrentUser().settings?.show_follow ? 'checked' : ''}> フォローしている人を公開する</label>
                        <label><input type="checkbox" id="setting-show-follower" ${(getCurrentUser().settings?.show_follower ?? true) ? 'checked' : ''}> フォロワーリストを公開する</label>
                        <label><input type="checkbox" id="setting-show-star" ${getCurrentUser().settings?.show_star ? 'checked' : ''}> お気に入りを公開する</label>
                        <label><input type="checkbox" id="setting-show-scid" ${getCurrentUser().settings?.show_scid ? 'checked' : ''}> Scratchアカウント名を公開する</label>
                        <label><input type="checkbox" id="setting-lock" ${getCurrentUser().settings?.lock ? 'checked' : ''}> ポストを非公開にする</label>
                    </fieldset>
                    <fieldset class="settings-login-security"><legend>ログインのセーフティ</legend>
                        <label><input type="checkbox" id="setting-reject-unknown-login" ${(getCurrentUser().settings?.reject_unknown_login ?? true) ? 'checked' : ''}> 不明な場所からのログインを拒否</label>
                        <p class="settings-help-text">有効にすると、初めて利用するIPアドレスからのログインには、ログイン済み端末での許可が必要です。</p>
                    </fieldset>
                    <section class="settings-verification-application" aria-labelledby="settings-verification-title">
                        <h4 id="settings-verification-title">認証</h4>
                        <p class="settings-help-text">認証済みアカウントにはプロフィール上で認証バッジが表示されます。申請は担当管理者が審査します。</p>
                        <button type="button" id="open-verification-application-btn" class="settings-bot-secondary-button" ${getCurrentUser().verify ? 'disabled' : ''}>${getCurrentUser().verify ? '認証済み' : '認証を申請する'}</button>
                        <p id="verification-application-status" class="settings-help-text hidden" role="status"></p>
                    </section>
                    <section class="settings-sessions" aria-labelledby="settings-sessions-title">
                        <h4 id="settings-sessions-title">セッション</h4>
                        <p class="settings-help-text">有効なログイン端末を管理できます。IPアドレスは安全のため一部のみ表示されます。</p>
                        <div id="settings-sessions-list" class="settings-sessions-list" aria-live="polite"></div>
                    </section>
                    <div class="settings-danger-zone"></div>
                </section>
                <section class="settings-group-panel" data-settings-panel="ui" hidden>
                    <label for="setting-post-timestamp-format">ポスト日時の表示</label>
                    <select id="setting-post-timestamp-format" class="settings-select">
                        <option value="relative">相対</option>
                        <option value="relative_detailed">相対（詳細）</option>
                        <option value="absolute_24">絶対（24時間）</option>
                        <option value="absolute_12">絶対（12時間）</option>
                    </select>
                    <p class="settings-help-text">プロフィールの参加日時には適用されません。</p>
                    <label for="setting-emoji-kind">絵文字のフォント</label>
                    <select id="setting-emoji-kind" class="settings-select">
                        <option value="twemoji">Twemoji</option>
                        <option value="emojione">Emoji One</option>
                        <option value="default">デフォルト（端末絵文字）</option>
                    </select>
                    <label for="setting-content-editor">コンテンツエディタ</label>
                    <select id="setting-content-editor" class="settings-select">
                        <option value="textarea">Textarea</option>
                        <option value="nyaitter">Nyaitterエディタ</option>
                    </select>
                    <p class="settings-help-text">Textareaはブラウザ標準の入力欄です。NyaitterエディタはMarkdownとカスタム絵文字を入力中に表示します。</p>
                    <fieldset class="settings-data-saver"><legend>通信量</legend>
                        <label><input type="checkbox" id="setting-data-saver" ${getCurrentUser().settings?.data_saver ? 'checked' : ''}> データセーバーを有効にする</label>
                        <p class="settings-help-text">画像は低画質プレビューで表示し、開いた時だけ元の画質を取得します。リアルタイム接続を停止し、一覧の一度の取得件数も減らします。</p>
                    </fieldset>
                    <label for="setting-theme">テーマ</label>
                    <select id="setting-theme" class="settings-select">
                        <option value="auto">端末設定</option>
                        <option value="light">ライト</option>
                        <option value="dark">ダーク</option>
                    </select>
                    <label for="setting-color-theme">カラーテーマ</label>
                    <select id="setting-color-theme" class="settings-select">
                        <option value="nyaitter">Nyaitter</option>
                        <option value="nyax">NyaX</option>
                        <option value="custom">カスタム</option>
                    </select>
                    <p class="settings-help-text">アクセントカラーと選択状態の配色を変更します。</p>
                    <section id="settings-custom-colors" class="settings-custom-colors" hidden aria-labelledby="settings-custom-colors-title">
                        <h4 id="settings-custom-colors-title">カスタムカラー</h4>
                        <p class="settings-help-text">各色はカラーピッカーまたは16進数カラーコード（例: <code>#ff9900</code>）で指定できます。</p>
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
                <section class="settings-group-panel" data-settings-panel="notifications" hidden>
                    <section class="settings-push-notifications" aria-labelledby="push-notification-title">
                        <h4 id="push-notification-title">プッシュ通知</h4>
                        <p id="push-notification-status" role="status">通知の状態を確認しています…</p>
                        <button type="button" id="push-notification-action" class="settings-primary-button" disabled>読み込み中…</button>
                        <p class="settings-help-text">通知はこの端末・ブラウザごとに設定されます。HTTPS対応のブラウザで利用できます。</p>
                    </section>
                </section>
                <section class="settings-group-panel" data-settings-panel="imposter" hidden>
                    <section class="settings-imposter" aria-labelledby="settings-imposter-title">
                        <h4 id="settings-imposter-title">インポスター</h4>
                        <p class="settings-help-text">1つのNyaitterIDから複数作成可能な偽のNyaitterIdです。</p>
                        <div id="settings-imposter-create" class="settings-bot-create-container">
                            <label for="settings-imposter-name" style="font-weight: 600; font-size: 0.9rem;">新しいインポスターの表示名</label>
                            <div class="settings-bot-create-form">
                                <input type="search" id="settings-imposter-name" placeholder="表示名" maxlength="50" autocomplete="off">
                                <button type="button" id="settings-imposter-create-btn" class="settings-primary-button">作成</button>
                            </div>
                            <p id="settings-imposter-limit" class="settings-help-text" role="status">インポスターを読み込んでいます…</p>
                        </div>
                        <div id="settings-imposter-list" class="settings-sessions-list" aria-live="polite"></div>
                    </section>
                </section>
                <section class="settings-group-panel" data-settings-panel="storage" hidden>
                    <section class="settings-storage" aria-labelledby="settings-storage-title">
                        <div class="settings-storage-heading">
                            <div>
                                <h4 id="settings-storage-title">保存済みファイル</h4>
                                <p id="settings-storage-summary" class="settings-help-text" role="status">ストレージ使用量を読み込んでいます…</p>
                            </div>
                            <button type="button" id="settings-storage-refresh-btn" class="settings-bot-secondary-button">更新</button>
                        </div>
                        <div class="settings-storage-progress" aria-hidden="true"><div id="settings-storage-progress-value" class="settings-storage-progress-value"></div></div>
                        <div id="settings-storage-files" class="settings-sessions-list" aria-live="polite"></div>
                    </section>
                </section>
                <section class="settings-group-panel" data-settings-panel="api" hidden>
                    <div class="settings-bot-section">
                        <h4 id="settings-bot-title">Bot用 APIキー</h4>
                        <p class="settings-help-text">プログラムやスクリプトからNyaitter APIを操作するためのAPIキー（Botトークン）を生成・管理できます。</p>
                        <div class="settings-bot-create-container">
                            <label for="setting-bot-token-name" style="font-weight: 600; font-size: 0.9rem;">新しいAPIキーの名前</label>
                            <div class="settings-bot-create-form">
                                <input type="text" id="setting-bot-token-name" placeholder="例: 投稿Bot, 自動通知スクリプト" maxlength="50" autocomplete="off">
                                <button type="button" id="setting-bot-token-create-btn">APIキーを生成</button>
                            </div>
                        </div>
                        <div id="settings-bot-token-newly-created" class="settings-bot-new-key-box" hidden>
                            <div class="settings-bot-new-key-header">
                                <strong>APIキーが生成されました</strong>
                                <p class="settings-bot-new-key-warning">⚠️ このキーは一度しか表示されません。安全な場所にコピーして保存してください。</p>
                            </div>
                            <div class="settings-bot-new-key-display">
                                <input type="text" id="settings-bot-new-key-value" readonly spellcheck="false" autocomplete="off">
                                <button type="button" id="settings-bot-copy-key-btn" class="settings-bot-copy-button">コピー</button>
                            </div>
                            <div style="margin-top: 0.5rem; text-align: right;">
                                <button type="button" id="settings-bot-close-new-key-btn" class="settings-bot-secondary-button">完了</button>
                            </div>
                        </div>
                        <div class="settings-bot-list-section">
                            <h4 style="margin-top: 1.5rem; font-size: 1rem;">生成済みのAPIキー</h4>
                            <div id="settings-bot-tokens-list" class="settings-sessions-list" aria-live="polite"></div>
                        </div>
                    </div>
                </section>
                <section class="settings-group-panel" data-settings-panel="resources" hidden>
                    <section class="settings-resource-links" aria-labelledby="settings-resource-links-title">
                        <h4 id="settings-resource-links-title">リンク</h4>
                        <div id="settings-resource-links" class="settings-sessions-list"></div>
                    </section>
                </section>
            </form>
            <div id="verification-application-modal" class="modal-overlay hidden" role="dialog" aria-modal="true">
                <section class="modal-content verification-application-modal-content">
                    <button type="button" class="modal-close-btn" data-action="close-verification-application">×</button>
                    <h3>認証を申請する</h3>
                    <p class="settings-help-text">申請内容は担当管理者が確認します。審査が完了すると通知でお知らせします。</p>
                    <div class="verification-application-actions" style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button type="button" class="login-secondary-button" data-action="close-verification-application">キャンセル</button>
                        <button type="button" id="submit-verification-application-btn" class="settings-primary-button">申請する</button>
                    </div>
                </section>
            </div>
        </div>
    `;

    document.getElementById('setting-post-timestamp-format').value =
        normalizePostTimestampFormat(getCurrentUser().settings?.post_timestamp_format);
    document.getElementById('setting-emoji-kind').value =
        getCurrentUser().settings?.emoji || 'twemoji';
    document.getElementById('setting-content-editor').value =
        getCurrentUser().settings?.content_editor === 'nyaitter' ? 'nyaitter' : 'textarea';
    document.getElementById('setting-theme').value =
        getCurrentUser().settings?.theme || 'light';

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

    document.querySelectorAll('.settings-color-code[data-color-key]').forEach((codeInput) => {
        const colorPicker = document.getElementById(`${codeInput.id}-picker`);
        colorPicker?.addEventListener('input', () => {
            codeInput.value = colorPicker.value.toLowerCase();
            if (colorThemeSelect.value === 'custom') updateColorThemeSettingsUi();
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
            empty.className = 'settings-help-text';
            empty.textContent = '有効なセッションはありません。';
            sessionsList.appendChild(empty);
            return;
        }
        sessions.forEach((session) => {
            const item = document.createElement('article');
            item.className = 'settings-session-item';
            const details = document.createElement('div');
            details.className = 'settings-session-details';
            const title = document.createElement('div');
            title.className = 'settings-session-title';
            title.textContent = session.ip_masked || '旧セッション';
            if (session.current) {
                const currentBadge = document.createElement('span');
                currentBadge.className = 'settings-session-current';
                currentBadge.textContent = 'この端末';
                title.appendChild(currentBadge);
            }
            const device = document.createElement('p');
            device.className = 'settings-session-device';
            device.textContent = session.user_agent || '不明な端末';
            const dates = document.createElement('p');
            dates.className = 'settings-session-dates';
            dates.textContent = `開始: ${formatSecurityTimestamp(session.created_at)} / 有効期限: ${formatSecurityTimestamp(session.expires_at)}`;
            details.append(title, device, dates);

            const actions = document.createElement('div');
            actions.className = 'settings-session-actions';
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
            errP.className = 'settings-help-text';
            errP.textContent = 'APIキー一覧の取得に失敗しました。';
            botTokensList.appendChild(errP);
            return;
        }
        const tokens = Array.isArray(data?.tokens) ? data.tokens : [];
        if (tokens.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'settings-help-text';
            empty.textContent = '生成済みのAPIキーはありません。';
            botTokensList.appendChild(empty);
            return;
        }
        tokens.forEach((token) => {
            const item = document.createElement('article');
            item.className = 'settings-session-item';
            const details = document.createElement('div');
            details.className = 'settings-session-details';
            const title = document.createElement('div');
            title.className = 'settings-session-title';
            title.textContent = token.name || '名称未設定';
            const idBadge = document.createElement('span');
            idBadge.className = 'settings-bot-token-id';
            idBadge.textContent = `ID: ${token.tokenId}`;
            title.appendChild(idBadge);
            const dates = document.createElement('p');
            dates.className = 'settings-session-dates';
            const createdStr = token.createdAt ? formatSecurityTimestamp(token.createdAt) : '日時不明';
            const lastUsedStr = token.lastUsedAt ? formatSecurityTimestamp(token.lastUsedAt) : '未使用';
            dates.textContent = `作成: ${createdStr} / 最終使用: ${lastUsedStr}`;
            details.append(title, dates);

            const actions = document.createElement('div');
            actions.className = 'settings-session-actions';
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
            createBotTokenBtn.textContent = '生成中…';
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
        imposterLimit.textContent = 'インポスターを読み込んでいます…';
        const { data, error } = await apiRequest('/server/api/imposters');
        if (error) {
            imposterLimit.textContent = 'インポスター情報の取得に失敗しました。';
            const message = document.createElement('p');
            message.className = 'settings-help-text';
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
            empty.className = 'settings-help-text';
            empty.textContent = '利用できるインポスターはありません。';
            imposterList.appendChild(empty);
            return;
        }

        imposters.forEach((imposter) => {
            const metadata = imposter?.imposter || {};
            const canManage = metadata.role === 'owner' || metadata.role === 'manager';
            const item = document.createElement('article');
            item.className = 'settings-session-item';
            const details = document.createElement('div');
            details.className = 'settings-session-details';
            const title = document.createElement('div');
            title.className = 'settings-session-title';
            title.textContent = imposter.name || `NyaitterID ${formatImposterId(imposter.id)}`;
            const idBadge = document.createElement('span');
            idBadge.className = 'settings-bot-token-id';
            idBadge.textContent = `NyaitterID: ${formatImposterId(imposter.nyaitter_id || imposter.id)}`;
            const roleBadge = document.createElement('span');
            roleBadge.className = 'settings-session-current';
            roleBadge.textContent = imposterRoleLabel(metadata.role);
            title.append(' ', idBadge, ' ', roleBadge);
            details.appendChild(title);

            const memberSection = document.createElement('div');
            memberSection.className = 'settings-sessions-list';
            const members = Array.isArray(metadata.members) ? metadata.members : [];
            const memberHeading = document.createElement('p');
            memberHeading.className = 'settings-help-text';
            memberHeading.textContent = members.length > 0 ? '共同運用者' : '共同運用者はいません。';
            memberSection.appendChild(memberHeading);

            members.forEach((member) => {
                const memberRow = document.createElement('div');
                memberRow.className = 'settings-session-item';
                const memberDetails = document.createElement('div');
                memberDetails.className = 'settings-session-details';
                memberDetails.textContent = `NyaitterID: ${formatImposterId(member.user_id)}`;
                memberRow.appendChild(memberDetails);
                if (canManage) {
                    const actions = document.createElement('div');
                    actions.className = 'settings-session-actions';
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
                    roleText.className = 'settings-help-text';
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
            actions.className = 'settings-session-actions';
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

        summary.textContent = 'ストレージ使用量を読み込んでいます…';
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
        summary.textContent = `${formatStorageSize(usedBytes)} / ${formatStorageSize(limitBytes)}（${percent.toFixed(1)}% 使用）`;
        progress.style.width = `${percent}%`;

        const files = Array.isArray(payload.files) ? payload.files : [];
        if (files.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'settings-help-text';
            empty.textContent = '保存済みファイルはありません。';
            fileList.appendChild(empty);
            return;
        }

        files.forEach((file) => {
            const item = document.createElement('article');
            item.className = 'settings-session-item settings-storage-file';
            const details = document.createElement('div');
            details.className = 'settings-session-details';
            const title = document.createElement('div');
            title.className = 'settings-session-title';
            title.textContent = file.name || file.id || '名称不明のファイル';
            const meta = document.createElement('p');
            meta.className = 'settings-session-dates';
            const updatedAt = file.updatedAt ? formatSecurityTimestamp(file.updatedAt) : '日時不明';
            meta.textContent = `サイズ: ${formatStorageSize(file.size)} / 更新: ${updatedAt}`;
            details.append(title, meta);

            const actions = document.createElement('div');
            actions.className = 'settings-session-actions';
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
        const resources = Array.isArray(RESOURCE_LINKS) ? RESOURCE_LINKS : [];
        if (resources.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'settings-help-text';
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
            item.className = 'settings-session-item';
            const link = document.createElement('a');
            link.className = 'settings-session-title';
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

    const settingsGroupDetails = {
        profile: {
            title: 'プロフィール',
            description: 'プロフィールに表示される情報と画像を設定します。',
        },
        privacy: {
            title: 'プライバシーとセキュリティ',
            description: '公開範囲、ログイン保護、アカウント管理を設定します。',
        },
        ui: {
            title: 'UI / フォント',
            description: '表示形式、テーマ、フォントなどの見た目を設定します。',
        },
        notifications: {
            title: '通知',
            description: 'この端末でのプッシュ通知の状態を確認・変更します。',
        },
        storage: {
            title: 'ストレージ',
            description: 'アップロード済みのファイルとストレージ使用量を管理します。',
        },
        api: {
            title: 'API / Bot',
            description: 'Bot用APIキーを生成・管理します。',
        },
        imposter: {
            title: 'インポスター',
            description: 'インポスターの作成、共同運用者、権限を管理します。',
        },
        resources: {
            title: 'リソース',
            description: 'Nyaitterに関するリソースへのリンクを表示します。',
        },
    };

    const selectSettingsGroup = (group) => {
        const activeGroup = settingsGroupDetails[group] ? group : 'profile';
        const details = settingsGroupDetails[activeGroup];
        const title = document.getElementById('settings-group-title');
        const description = document.getElementById('settings-group-description');
        if (title) title.textContent = details.title;
        if (description) description.textContent = details.description;

        document.querySelectorAll('.settings-group-button').forEach((button) => {
            const active = button.dataset.settingsGroup === activeGroup;
            button.classList.toggle('active', active);
        });
        document.querySelectorAll('.settings-group-panel').forEach((panel) => {
            panel.hidden = panel.dataset.settingsPanel !== activeGroup;
        });
        if (activeGroup === 'privacy') void loadLoginSecuritySessions();
        if (activeGroup === 'notifications') void loadPushSettingsState();
        if (activeGroup === 'storage') void loadUserStorage();
        if (activeGroup === 'api') void loadUserBotTokens();
        if (activeGroup === 'imposter') void loadImposters();
        if (activeGroup === 'resources') renderResourceLinks();
    };

    const dangerZone = document.querySelector('.settings-danger-zone');
    if (dangerZone) {
        let dangerZoneHTML = `
            <section class="settings-account-identity" aria-labelledby="settings-nyaitter-id-title">
                <h4 id="settings-nyaitter-id-title">NyaitterID</h4>
                <p class="settings-help-text">再割り当てをした場合元のIDに戻すことはできません。</p>
                <button type="button" id="settings-reassign-nyaitter-id-btn">NyaitterIDを再割り当て</button>
            </section>
            <section class="settings-account-delete" aria-labelledby="settings-account-delete-title">
                <h4 id="settings-account-delete-title">NyaitterIDの破棄</h4>
                <p class="settings-help-text">あなたのNyaitterIDを破棄し、全てのデータを削除します。この操作は取り消せません。</p>
                <button type="button" id="settings-delete-account-btn" class="settings-danger-button">NyaitterIDを破棄</button>
            </section>
            <button type="button" id="settings-account-switcher-btn">アカウント切替</button>
            <button type="button" id="settings-logout-btn">ログアウト</button>
        `;
        if (getCurrentUser().admin) {
            dangerZoneHTML += `<a href="#admin/logs" id="settings-showlog-btn" style="display:block;margin-top:0.5rem;">アクセスログ</a>`;
        }
        dangerZone.innerHTML = dangerZoneHTML;
    }

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
    settingsForm?.querySelectorAll('select, input[type="checkbox"]').forEach((control) => {
        control.addEventListener('change', async () => {
            if (control.dataset.imposterControl === 'true') return;
            if (control.id === 'setting-theme') applyInterfaceTheme(control.value);
            if (control.id === 'setting-ip-trust-enabled' && control.checked) {
                const { error } = await apiRequest('/server/auth/trust-current-ip', { method: 'POST' });
                if (error) {
                    control.checked = false;
                    showAppAlert('現在の端末を信頼済みにできなかったため、この設定は有効化されませんでした。');
                }
            }
            requestSettingsSave(settingsForm);
        });
    });
    settingsForm?.querySelectorAll('input[type="text"], textarea').forEach((control) => {
        control.addEventListener('blur', () => requestSettingsSave(settingsForm));
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
            setCurrentUser(data.user);
            updateAccountData(getCurrentUser());
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
