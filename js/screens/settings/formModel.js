import { getCustomColorsFromInputs, normalizeColorTheme } from '../../modules/theme.js';
import { normalizePostTimestampFormat } from '../../utils/helpers.js';
import { normalizeDmInvitation } from './config.js';

export function readSettingsForm(form, currentSettings = {}) {
    const ngWordsInput = form.querySelector('#setting-ng-words');
    const displayRanks = { ...(currentSettings.display_ranks || {}) };
    form.querySelectorAll('[data-display-rank-setting]').forEach(control => {
        displayRanks[control.dataset.displayRankSetting] = JSON.parse(control.value);
    });
    return {
        name: form.querySelector('#setting-username')?.value.trim(),
        me: form.querySelector('#setting-me')?.value.trim(),
        settings: {
            ...currentSettings,
            show_ranks: form.querySelector('#setting-show-ranks')?.checked ?? (currentSettings.show_ranks === true),
            display_ranks: displayRanks,
            lock: form.querySelector('#setting-lock')?.checked || false,
            show_like: form.querySelector('#setting-show-like')?.checked || false,
            show_follow: form.querySelector('#setting-show-follow')?.checked || false,
            show_follower: form.querySelector('#setting-show-follower')?.checked ?? true,
            show_star: form.querySelector('#setting-show-star')?.checked || false,
            show_scid: form.querySelector('#setting-show-scid')?.checked || false,
            reject_unknown_login: form.querySelector('#setting-reject-unknown-login')?.checked ?? false,
            dm_invitation: normalizeDmInvitation(form.querySelector('#setting-dm-invitation')?.value),
            post_timestamp_format: normalizePostTimestampFormat(form.querySelector('#setting-post-timestamp-format')?.value),
            emoji: form.querySelector('#setting-emoji-kind')?.value || 'twemoji',
            content_editor: form.querySelector('#setting-content-editor')?.value === 'nyaitter' ? 'nyaitter' : 'textarea',
            data_saver: form.querySelector('#setting-data-saver')?.checked || false,
            show_community_notes:
                form.querySelector('#setting-show-community-notes')?.checked ??
                (currentSettings.show_community_notes !== false),
            ui_mode: form.querySelector('#setting-ui-mode')?.value === 'legacy' ? 'legacy' : 'nui',
            theme: form.querySelector('#setting-theme')?.value || 'light',
            color_theme: normalizeColorTheme(form.querySelector('#setting-color-theme')?.value),
            custom_colors: getCustomColorsFromInputs(form),
            ng_words: ngWordsInput
                ? (ngWordsInput.value || '').split(/[\n,]+/).map((word) => word.trim()).filter(Boolean)
                : (currentSettings.ng_words || []),
        },
    };
}
