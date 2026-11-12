/**
 * appShell.js — アプリケーションのUIシェルを動的に構築・マウントします。
 */

import { t } from './modules/i18n.js';

export function renderAppShellHTML() {
    return `
        <div class="app-container">
            <!-- 左側ナビゲーションメニュー -->
            <nav id="left-nav" class="nui-nav" data-nui="nav">
                <div id="nav-logo"></div>
                <div id="nav-menu-top"></div>
                <div id="nav-menu-bottom"></div>
            </nav>
            <!-- 中央メインコンテンツ -->
            <main id="main-content">
                <header id="page-header">
                    <!-- ヘッダー内容はJSで動的に生成されます -->
                </header>
                <div id="content-area">
                    <div id="pull-to-refresh-indicator" class="pull-to-refresh-indicator" role="status" aria-live="polite" aria-hidden="true">
                        <svg class="pull-to-refresh-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4v15M6 13l6 6 6-6" /></svg>
                        <span class="pull-to-refresh-label">${t('timeline.pull_to_refresh')}</span>
                    </div>
                    <div id="main-screen" class="screen hidden">
                        <div class="timeline-tabs-sticky-container">
                            <div class="timeline-tabs">
                                <button class="timeline-tab-button active" data-tab="foryou">${t('timeline.tab.foryou')}</button>
                                <button class="timeline-tab-button" data-tab="all">${t('timeline.tab.all')}</button>
                                <button class="timeline-tab-button" data-tab="following">${t('timeline.tab.following')}</button>
                            </div>
                        </div>
                        <div id="new-posts-indicator" class="new-posts-indicator hidden" aria-live="polite">
                            <button type="button" data-action="refresh-realtime-timeline">${t('timeline.new_posts')}</button>
                        </div>
                        <div class="post-form-sticky-container">
                            <div class="post-form-container"></div>
                        </div>
                        <div id="timeline"></div>
                    </div>
                    <div id="explore-screen" class="screen hidden">
                        <div id="explore-content"></div>
                    </div>
                    <div id="notifications-screen" class="screen hidden">
                        <div id="notifications-content"></div>
                    </div>
                    <div id="likes-screen" class="screen hidden">
                        <div id="likes-content"></div>
                    </div>
                    <div id="stars-screen" class="screen hidden">
                        <div id="stars-content"></div>
                    </div>
                    <div id="profile-screen" class="screen hidden">
                        <div id="profile-header"></div>
                        <div id="profile-tabs"></div>
                        <div id="profile-content"></div>
                    </div>
                    <div id="stages-screen" class="screen hidden"><div id="stages-content"></div></div>
                    <div id="call-screen" class="screen hidden"><div id="call-content"></div></div>
                    <div id="groups-screen" class="screen hidden">
                        <div id="groups-content"></div>
                    </div>
                    <div id="settings-screen" class="screen hidden"></div>
                    <div id="post-detail-screen" class="screen hidden">
                        <div id="post-detail-content"></div>
                    </div>
                    <div id="post-activity-screen" class="screen hidden">
                        <div id="post-activity-content"></div>
                    </div>
                    <div id="search-results-screen" class="screen hidden">
                        <div id="search-results-content"></div>
                    </div>
                    <div id="dm-screen" class="screen hidden">
                        <div id="dm-content"></div>
                    </div>
                    <div id="admin-logs-screen" class="screen hidden">
                        <div id="admin-logs-content"></div>
                    </div>
                    <div id="admin-reports-screen" class="screen hidden">
                        <div id="admin-reports-content"></div>
                    </div>
                    <div id="rule-screen" class="screen hidden">
                        <div id="rule-content" class="rule-content-container"></div>
                    </div>
                    <div id="nyaitter-auth-screen" class="screen hidden">
                        <div id="nyaitter-auth-content" class="nyaitter-auth-content-container"></div>
                    </div>
                    <div id="docs-portal-screen" class="screen hidden">
                        <div id="docs-portal-content" class="docs-portal-container"></div>
                    </div>
                    <div id="docs-api-screen" class="screen hidden">
                        <div id="docs-api-content" class="docs-api-container"></div>
                    </div>
                    <div id="doc-detail-screen" class="screen hidden">
                        <div id="doc-detail-content" class="doc-detail-container"></div>
                    </div>
                </div>
            </main>
            <!-- 右側サイドバー -->
            <aside id="right-sidebar">
                <div id="right-sidebar-search-widget-container"></div>
                <div id="recommendations-widget-container"></div>
                <div id="right-sidebar-links-container"></div>
            </aside>
        </div>

        <!-- ログインバナー -->
        <div id="login-banner" class="hidden">
            <div class="login-banner-content">
                <h2>${t('login.banner.title')}</h2>
                <h4>${t('login.banner.subtitle')}</h4>
            </div>
            <div class="login-banner-actions">
                <button id="banner-login-button" class="nui-button">${t('login.login')}</button>
                <button id="banner-signup-button" class="nui-button-secondary">${t('login.signup')}</button>
            </div>
        </div>

        <!-- ログインモーダル -->
        <div id="login-modal" class="modal-overlay nui-modal-backdrop hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="login-title" tabindex="-1">
            <div class="modal-content login-modal-content nui-modal" style="width: min(520px, calc(100vw - 2rem)); max-height: min(760px, calc(100dvh - 2rem)); padding: clamp(1.25rem, 4vw, 2rem); border-radius: 20px;">
                <button type="button" class="modal-close-btn" aria-label="${t('common.close')}">×</button>
                <div class="login-modal-heading">
                    <button type="button" id="login-back-btn" class="login-modal-back-btn hidden" aria-label="${t('login.back_to_methods')}">←</button>
                    <h3 id="login-title">${t('login.title.select')}</h3>
                </div>

                <!-- Provider Selection Screen -->
                <div id="auth-provider-select">
                    <p class="settings-help-text nui-help-text">${t('login.select_provider')}</p>
                    <div id="login-provider-buttons" class="login-provider-list"></div>
                </div>

                <!-- Scratch Flow -->
                <div id="auth-scratch-panel" class="hidden">
                    <div id="auth-step1">
                        <p id="login-instruction" class="settings-help-text nui-help-text">${t('login.scratch.instruction')}</p>
                        <label class="login-modal-field" for="username-input">ScratchID</label>
                        <input type="text" id="username-input" class="nui-input" placeholder="ScratchID" autocomplete="username" />
                        <button type="button" id="get-code-btn" class="settings-primary-button login-auth-action nui-button">${t('login.scratch.get_code')}</button>
                    </div>
                    <div id="auth-step2" class="hidden">
                        <p class="settings-help-text nui-help-text">${t('login.scratch.step2')}</p>
                        <button type="button" id="verification-code" class="login-verification-code" title="${t('login.scratch.copy_title')}"></button>
                        <div class="login-modal-links">
                            <a class="login-secondary-button nui-button-secondary" href="https://scratch.mit.edu/projects/1239738451/" target="_blank" rel="noopener noreferrer" id="projlink">${t('login.scratch.open_project')}</a>
                            <a class="login-secondary-button nui-button-secondary" href="https://scratch.mit.edu/" target="_blank" rel="noopener noreferrer" id="pflink">${t('login.scratch.open_profile')}</a>
                        </div>
                        <button type="button" id="verify-comment-btn" class="settings-primary-button login-auth-action nui-button">${t('login.scratch.verify')}</button>
                    </div>
                </div>

                <!-- Email Flow -->
                <div id="auth-email-panel" class="hidden">
                    <div id="auth-email-step1">
                        <p class="settings-help-text nui-help-text">${t('login.email.instruction')}</p>
                        <label class="login-modal-field" for="login-email-input">${t('login.email.address')}</label>
                        <input type="email" id="login-email-input" class="nui-input" placeholder="you@example.com" autocomplete="email" />
                        <button type="button" id="get-email-code-btn" class="settings-primary-button login-auth-action nui-button">${t('login.email.send_code')}</button>
                    </div>
                    <div id="auth-email-step2" class="hidden">
                        <p class="settings-help-text nui-help-text">${t('login.email.step2')}</p>
                        <label class="login-modal-field" for="login-email-code-input">${t('login.email.code')}</label>
                        <input type="text" id="login-email-code-input" class="nui-input" placeholder="123456" maxlength="8" autocomplete="one-time-code" />
                        <button type="button" id="verify-email-code-btn" class="settings-primary-button login-auth-action nui-button">${t('login.login')}</button>
                        <div class="login-modal-links">
                            <button type="button" id="resend-email-code-btn" class="login-secondary-button nui-button-secondary">${t('login.email.resend')}</button>
                        </div>
                    </div>
                    <div id="auth-email-step3" class="hidden">
                        <p class="settings-help-text nui-help-text">${t('login.email.name_instruction')}</p>
                        <label class="login-modal-field" for="login-email-name-input">${t('login.email.username')}</label>
                        <input type="text" id="login-email-name-input" class="nui-input" placeholder="${t('login.email.username')}" maxlength="50" autocomplete="nickname" />
                        <button type="button" id="submit-email-signup-btn" class="settings-primary-button login-auth-action nui-button">${t('login.email.finish')}</button>
                    </div>
                </div>

                <!-- Passkey Flow -->
                <div id="auth-passkey-panel" class="hidden">
                    <p class="settings-help-text nui-help-text">${t('login.passkey.instruction')}</p>
                    <button type="button" id="passkey-signin-btn" class="settings-primary-button login-auth-action nui-button">${t('login.passkey.signin')}</button>
                </div>

                <!-- NyaitterAuth Flow -->
                <div id="auth-nyaitter-panel" class="hidden">
                    <p class="settings-help-text nui-help-text">${t('login.nyaitter.instruction')}</p>
                    <label class="login-modal-field" for="login-nyaitter-server-input">${t('login.nyaitter.url')}</label>
                    <input type="url" id="login-nyaitter-server-input" class="nui-input" placeholder="https://example.com" autocomplete="url" required />
                    <button type="button" id="nyaitter-signin-btn" class="settings-primary-button login-auth-action nui-button">${t('login.login')}</button>
                </div>

                <div id="login-turnstile-container" class="login-turnstile-container hidden">
                    <p class="login-turnstile-hint settings-help-text nui-help-text">${t('login.turnstile.hint')}</p>
                    <div id="login-turnstile-widget"></div>
                </div>

                <p id="error-message" class="login-modal-message login-modal-error hidden" role="alert"></p>
                <p id="copy-message" class="login-modal-message login-modal-copy hidden" role="status">${t('login.copied')}</p>
                <div id="login-loading-overlay" class="login-loading-overlay hidden" aria-live="polite"><div class="spinner"></div></div>
            </div>
        </div>

        <div id="login-approval-wait-modal" class="modal-overlay nui-modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="login-approval-wait-title">
            <section class="modal-content login-approval-modal-content login-approval-wait-content nui-modal" style="width: min(480px, calc(100vw - 2rem)); padding: 1.7rem 1.25rem 1.25rem;">
                <div class="login-modal-heading">
                    <h3 id="login-approval-wait-title">${t('login.approval.title')}</h3>
                </div>
                <p id="login-approval-wait-description" class="settings-help-text nui-help-text">${t('login.approval.description')}</p>
                <div class="login-approval-wait-progress" aria-hidden="true"><div class="spinner"></div><span id="login-approval-wait-progress-label">${t('login.approval.checking')}</span></div>
                <p id="login-approval-wait-status" class="login-approval-detail login-approval-wait-status" role="status">${t('login.approval.waiting')}</p>
                <div id="login-approval-recovery-section" class="login-approval-recovery hidden">
                    <p class="settings-help-text nui-help-text">${t('login.approval.no_device_help')}</p>
                    <button type="button" id="account-recovery-start-btn" class="login-secondary-button nui-button-secondary">${t('login.recovery.start')}</button>
                </div>
                <p id="account-recovery-wait-status" class="login-approval-detail login-approval-wait-status hidden" role="status"></p>
                <div class="login-approval-actions login-approval-wait-actions">
                    <button type="button" id="login-approval-wait-cancel-btn" class="login-secondary-button nui-button-secondary">${t('login.cancel')}</button>
                </div>
            </section>
        </div>

        <div id="post-modal" class="modal-overlay nui-modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="${t('composer.create')}">
            <div class="modal-content" style="width: min(600px, calc(100vw - 2rem));">
                <div class="post-form-container-modal"></div>
            </div>
        </div>

        <div id="image-preview-modal" class="modal-overlay nui-modal-backdrop hidden" role="dialog" aria-modal="true" aria-label="${t('image.preview')}">
            <button type="button" class="modal-close-btn" aria-label="${t('common.close')}">×</button>
            <button type="button" class="image-modal-nav-btn image-modal-prev-btn hidden" aria-label="${t('image.prev')}">
                <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="image-preview-wrapper">
                <img id="image-preview-modal-content" src="" alt="${t('image.enlarged')}" />
            </div>
            <button type="button" class="image-modal-nav-btn image-modal-next-btn hidden" aria-label="${t('image.next')}">
                <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="image-modal-counter hidden"></div>
        </div>

        <div id="edit-post-modal" class="modal-overlay nui-modal-backdrop hidden">
            <div class="modal-content" style="width: min(600px, calc(100vw - 2rem));">
                <div id="edit-post-modal-content"></div>
            </div>
        </div>

        <div id="create-dm-modal" class="modal-overlay nui-modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="create-dm-modal-title">
            <div class="modal-content dm-modal-content nui-modal" style="width: min(520px, calc(100vw - 2rem)); padding: 1.5rem;">
                <button type="button" class="modal-close-btn" aria-label="${t('common.close')}">×</button>
                <div id="create-dm-modal-content"></div>
            </div>
        </div>

        <div id="dm-manage-modal" class="modal-overlay nui-modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="dm-manage-modal-title">
            <div class="modal-content dm-modal-content nui-modal" style="width: min(520px, calc(100vw - 2rem)); padding: 1.5rem;">
                <button type="button" class="modal-close-btn" aria-label="${t('common.close')}">×</button>
                <div id="dm-manage-modal-content"></div>
            </div>
        </div>

        <div id="report-modal" class="modal-overlay nui-modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
            <div class="modal-content report-modal-content nui-modal" style="width: min(520px, calc(100vw - 2rem)); padding: 1.6rem;">
                <button type="button" class="modal-close-btn" aria-label="${t('common.close')}">×</button>
                <div class="report-modal-heading">
                    <h3 id="report-modal-title" class="nui-modal-title">${t('report.title')}</h3>
                    <p id="report-modal-target" class="settings-help-text nui-help-text"></p>
                </div>
                <form id="report-form">
                    <label for="report-description">${t('report.description_label')}</label>
                    <textarea id="report-description" class="nui-input" maxlength="2000" rows="5" placeholder="${t('report.placeholder')}"></textarea>
                    <p class="report-modal-note">${t('report.note')}</p>
                    <div class="report-modal-actions">
                        <button type="button" class="login-secondary-button nui-button-secondary" data-action="close-report-modal">${t('common.cancel')}</button>
                        <button type="submit" class="settings-primary-button nui-button">${t('common.send')}</button>
                    </div>
                    <p id="report-modal-error" class="login-modal-message login-modal-error hidden" role="alert"></p>
                </form>
            </div>
        </div>

        <div id="account-switcher-modal" class="modal-overlay nui-modal-backdrop hidden">
            <div class="modal-content nui-modal" style="max-width: 400px; width: min(400px, calc(100vw - 2rem));">
                <button class="modal-close-btn">×</button>
                <div id="account-switcher-modal-content"></div>
            </div>
        </div>

        <div id="login-approval-modal" class="modal-overlay nui-modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="login-approval-modal-title">
            <div class="modal-content login-approval-modal-content nui-modal" style="width: min(480px, calc(100vw - 2rem)); padding: 1.7rem 1.25rem 1.25rem;">
                <button type="button" class="modal-close-btn" aria-label="${t('common.close')}">×</button>
                <div id="login-approval-modal-body"></div>
            </div>
        </div>

        <div id="account-recovery-modal" class="modal-overlay nui-modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="account-recovery-modal-title">
            <div class="modal-content login-approval-modal-content account-recovery-modal-content nui-modal" style="width: min(480px, calc(100vw - 2rem)); padding: 1.7rem 1.25rem 1.25rem;">
                <button type="button" class="modal-close-btn" aria-label="${t('common.close')}">×</button>
                <div id="account-recovery-modal-body"></div>
            </div>
        </div>

        <div id="app-dialog-modal" class="modal-overlay app-dialog-overlay nui-modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message">
            <div class="modal-content app-dialog-content nui-modal" style="width: min(420px, calc(100vw - 2rem)); padding: 1.7rem 1.25rem 1.25rem;">
                <button type="button" id="app-dialog-close-btn" class="modal-close-btn" aria-label="${t('common.close')}">×</button>
                <div class="login-modal-heading">
                    <h3 id="app-dialog-title" class="nui-modal-title">通知</h3>
                </div>
                <p id="app-dialog-message" class="app-dialog-message" role="alert"></p>
                <div id="app-dialog-input-group" class="app-dialog-input-group hidden">
                    <label for="app-dialog-input">${t('dialog.input_label')}</label>
                    <input id="app-dialog-input" class="nui-input" type="text" autocomplete="off" />
                </div>
                <div class="app-dialog-actions">
                    <button type="button" id="app-dialog-cancel-btn" class="login-secondary-button nui-button-secondary">${t('common.cancel')}</button>
                    <button type="button" id="app-dialog-submit-btn" class="settings-primary-button nui-button">${t('common.close')}</button>
                </div>
            </div>
        </div>

        <div id="freeze-overlay" class="modal-overlay freeze-overlay hidden">
            <section class="freeze-panel" aria-labelledby="freeze-title">
                <div class="freeze-panel-mark" aria-hidden="true">!</div>
                <p class="freeze-panel-eyebrow">ACCOUNT RESTRICTED</p>
                <h2 id="freeze-title">アカウントは凍結されています</h2>
                <p class="freeze-panel-lead">現在、このアカウントからNyaitterの機能を利用することはできません。</p>
                <div class="freeze-reason-card">
                    <span>凍結理由</span>
                    <p id="freeze-reason"></p>
                </div>
                <p id="freeze-appeal-status" class="freeze-appeal-status hidden" role="status"></p>
                <button id="open-freeze-appeal-btn" type="button" class="freeze-appeal-button nui-button">異議申し立てを行う</button>
                <p class="freeze-panel-help">判断に誤りがあると思われる場合は、説明を添えて再審査を申し立てられます。</p>
            </section>
        </div>

        <div id="freeze-appeal-modal" class="modal-overlay nui-modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="freeze-appeal-title">
            <section class="modal-content freeze-appeal-modal-content nui-modal" style="width: min(100% - 2rem, 34rem); padding: 0;">
                <button type="button" class="modal-close-btn" data-action="close-freeze-appeal" aria-label="${t('common.close')}">×</button>
                <p class="freeze-panel-eyebrow">REVIEW REQUEST</p>
                <h2 id="freeze-appeal-title">異議申し立てを送信</h2>
                <p>凍結の判断について、再審査を希望する理由を説明してください。内容は担当管理者が確認します。</p>
                <form id="freeze-appeal-form">
                    <label for="freeze-appeal-description">説明 <span aria-hidden="true">*</span></label>
                    <textarea id="freeze-appeal-description" class="nui-input" maxlength="2000" rows="7" required placeholder="再審査を希望する理由や、確認してほしい事情を入力してください。"></textarea>
                    <p id="freeze-appeal-error" class="login-modal-message login-modal-error hidden" role="alert"></p>
                    <div class="freeze-appeal-modal-actions">
                        <button type="button" class="cancel-button" data-action="close-freeze-appeal">キャンセル</button>
                        <button type="submit" class="freeze-appeal-button nui-button">送信する</button>
                    </div>
                </form>
            </section>
        </div>

        <div id="edit-dm-message-modal" class="modal-overlay nui-modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="edit-dm-modal-title">
            <div class="modal-content dm-modal-content nui-modal" style="width: min(520px, calc(100vw - 2rem)); padding: 1.5rem;">
                <button type="button" class="modal-close-btn" aria-label="${t('common.close')}">×</button>
                <div id="edit-dm-message-modal-content"></div>
            </div>
        </div>
    `;
}

let isAppShellMounted = false;

export function mountAppShell() {
    if (isAppShellMounted) return;
    const root = document.getElementById('app-root') || document.body;
    const container = document.getElementById('app-root');
    if (container) {
        container.innerHTML = renderAppShellHTML();
    } else {
        const div = document.createElement('div');
        div.id = 'app-root';
        div.innerHTML = renderAppShellHTML();
        root.appendChild(div);
    }
    isAppShellMounted = true;
    if (typeof globalThis.initNyaitterLoginModal === 'function') {
        globalThis.initNyaitterLoginModal();
    }
}
