import { getCustomColorsFromInputs, normalizeColorTheme } from '../../modules/theme.js';
import { normalizePostTimestampFormat } from '../../utils/helpers.js';
import { normalizeDmInvitation } from './config.js';

export function readSettingsForm(form, currentSettings = {}) {
    const ngWordsInput = form.querySelector('#setting-ng-words');
    return {
        name: form.querySelector('#setting-username')?.value.trim(),
        me: form.querySelector('#setting-me')?.value.trim(),
        settings: {
            ...currentSettings,
            lock: form.querySelector('#setting-lock')?.checked || false,
            show_like: form.querySelector('#setting-show-like')?.checked || false,
            show_follow: form.querySelector('#setting-show-follow')?.checked || false,
            show_follower: form.querySelector('#setting-show-follower')?.checked ?? true,
            show_star: form.querySelector('#setting-show-star')?.checked || false,
            show_scid: form.querySelector('#setting-show-scid')?.checked || false,
            reject_unknown_login: form.querySelector('#setting-reject-unknown-login')?.checked ?? true,
            dm_invitation: normalizeDmInvitation(form.querySelector('#setting-dm-invitation')?.value),
            post_timestamp_format: normalizePostTimestampFormat(form.querySelector('#setting-post-timestamp-format')?.value),
            emoji: form.querySelector('#setting-emoji-kind')?.value || 'twemoji',
            content_editor: form.querySelector('#setting-content-editor')?.value === 'nyaitter' ? 'nyaitter' : 'textarea',
            data_saver: form.querySelector('#setting-data-saver')?.checked || false,
            theme: form.querySelector('#setting-theme')?.value || 'light',
            color_theme: normalizeColorTheme(form.querySelector('#setting-color-theme')?.value),
            custom_colors: getCustomColorsFromInputs(form),
            ng_words: ngWordsInput
                ? (ngWordsInput.value || '').split(/[\n,]+/).map((word) => word.trim()).filter(Boolean)
                : (currentSettings.ng_words || []),
        },
    };
}
