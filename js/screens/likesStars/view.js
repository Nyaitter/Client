import { t } from '../../modules/i18n.js';
import { DOM } from '../../dom.js';
import { escapeHTML } from '../../utils/helpers.js';

export function renderHeader(title) {
    DOM.pageHeader.innerHTML = `<h2 id="page-title" class="nui-heading">${escapeHTML(title)}</h2>`;
}

export function renderLoggedOut(content) {
    if (content) {
        content.innerHTML = `<p class="list-empty-message nui-empty-text">${t('common.login_required')}</p>`;
    }
}

export function clearContent(content) {
    content?.replaceChildren();
}
