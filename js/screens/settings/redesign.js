import { SETTINGS_GROUP_DETAILS } from './config.js';
import { ICONS } from '../../icons.js';
import { getNetworkUsage, subscribeNetworkUsage, resetNetworkUsage } from '../../modules/networkUsage.js';

const NAVIGATION = [
    ['あなたの情報', [['overview', 'settings'], ['profile', 'profile'], ['account', 'profile'], ['privacy', 'post_lock']]],
    ['使い心地', [['ui', 'stars'], ['editor', 'post'], ['home', 'home_outline'], ['filters', 'search'], ['notifications', 'notifications'], ['connection', 'explore']]],
    ['管理と連携', [['storage', 'post'], ['apps', 'globe'], ['imposter', 'profile'], ['api', 'post'], ['resources', 'globe']]],
];

export function rebuildSettings(root) {
    root.classList.add('settings-redesigned');
    const form = root.querySelector('#settings-form');
    const panel = key => form.querySelector(`[data-settings-panel="${key}"]`);
    for (const key of ['overview', 'account', 'editor', 'filters', 'connection']) {
        const section = document.createElement('section');
        section.className = 'settings-group-panel';
        section.dataset.settingsPanel = key;
        section.hidden = true;
        form.append(section);
    }
    const move = (selector, group) => {
        const node = form.querySelector(selector);
        if (node) panel(group).append(node);
    };
    for (const selector of ['.settings-login-security', '.settings-auth-providers', '.settings-sessions', '.settings-danger-zone']) move(selector, 'account');
    move('.settings-verification-application', 'profile');
    move('.settings-ng-words', 'filters');
    move('.settings-data-saver', 'connection');
    const usage = document.createElement('section');
    usage.className = 'settings-network-usage';
    usage.innerHTML = `<h4>このブラウザーの通信量</h4>
        <p class="settings-help-text">今日と今月の送受信量です。計測開始後の通信だけを、この端末・ブラウザーに記録します。</p>
        <div class="settings-usage-totals"><div><span>今日</span><strong data-usage="today"></strong></div><div><span>今月</span><strong data-usage="month"></strong></div></div>
        <dl class="settings-usage-breakdown"><div><dt>ページ・画像・APIの受信（今月）</dt><dd data-usage="httpReceived"></dd></div><div><dt>投稿・ファイルなどの送信（今月）</dt><dd data-usage="httpSent"></dd></div><div><dt>Realtimeの受信（今月）</dt><dd data-usage="realtimeReceived"></dd></div><div><dt>Realtimeの送信（今月）</dt><dd data-usage="realtimeSent"></dd></div></dl>
        <p data-usage="coverage" class="settings-help-text" role="status"></p>
        <p class="settings-help-text">ブラウザーが取得できる受信転送サイズと送信本文を集計しています。送信ヘッダー、ファイル送信の区切り、Realtimeの通信ヘッダーは含みません。サイズを取得できない外部リソースなどもあり、通信会社の請求量とは一致しません。</p>
        <button type="button" class="settings-secondary-button" id="settings-reset-network-usage">計測履歴をリセット</button>`;
    panel('connection').prepend(usage);
    const dangerZone = form.querySelector('.settings-danger-zone');
    if (dangerZone) {
        const advanced = document.createElement('details');
        advanced.className = 'settings-danger-details';
        const summary = document.createElement('summary');
        summary.textContent = 'IDの再割り当て・アカウント削除';
        advanced.append(summary);
        for (const section of dangerZone.querySelectorAll('.settings-account-identity, .settings-account-delete')) advanced.append(section);
        dangerZone.append(advanced);
    }

    // Move complete label/control/help groups so all existing IDs and handlers survive.
    for (const id of ['setting-content-editor', 'setting-post-timestamp-format']) {
        const control = form.querySelector(`#${id}`);
        if (!control) continue;
        const label = form.querySelector(`label[for="${id}"]`);
        const help = control.nextElementSibling?.matches('.settings-help-text') ? control.nextElementSibling : null;
        if (label) panel('editor').append(label);
        panel('editor').append(control);
        if (help) panel('editor').append(help);
    }
    const timestamp = form.querySelector('#setting-post-timestamp-format');
    const dateLabels = ['経過時間（3分前）', '詳しい経過時間（3分20秒前）', '日時・24時間表示', '日時・12時間表示'];
    Array.from(timestamp?.options || []).forEach((option, index) => { option.textContent = dateLabels[index]; });
    const editor = form.querySelector('#setting-content-editor');
    if (editor) {
        editor.querySelector('[value="textarea"]').textContent = 'シンプルな入力欄';
        editor.querySelector('[value="nyaitter"]').textContent = 'Nyaitterエディタ（Markdown・IME）';
        const help = editor.nextElementSibling;
        if (help?.matches('.settings-help-text')) help.textContent = 'Nyaitterエディタは、Markdownや絵文字の見た目を確認しながら入力でき、NyaitterIMEも使えます。シンプルな入力欄はブラウザ標準のエディタです。';
    }
    const nav = root.querySelector('.settings-group-list');
    nav.innerHTML = '';
    const search = document.createElement('div');
    search.className = 'settings-search';
    search.innerHTML = '<label for="settings-search-input">設定を探す</label><input id="settings-search-input" type="search" placeholder="色、DM、ログイン…" autocomplete="off"><div id="settings-search-results" role="region" aria-label="検索結果" hidden></div>';
    nav.append(search);
    const mobileCategory = document.createElement('select');
    mobileCategory.id = 'settings-mobile-category';
    mobileCategory.className = 'settings-mobile-category';
    mobileCategory.setAttribute('aria-label', '設定カテゴリ');
    nav.append(mobileCategory);
    for (const [title, entries] of NAVIGATION) {
        const section = document.createElement('div');
        section.className = 'settings-navigation-section';
        const heading = document.createElement('p');
        heading.className = 'settings-navigation-label';
        heading.textContent = title;
        section.append(heading);
        const optionGroup = document.createElement('optgroup');
        optionGroup.label = title;
        mobileCategory.append(optionGroup);
        for (const [key, icon] of entries) {
            const link = document.createElement('a');
            link.href = `#settings/${key}`;
            link.className = 'settings-group-button';
            link.dataset.settingsGroup = key;
            link.innerHTML = `<span class="settings-category-icon" aria-hidden="true">${ICONS[icon] || ICONS.settings || ''}</span><span></span>`;
            link.lastElementChild.textContent = key === 'overview' ? '設定トップ' : SETTINGS_GROUP_DETAILS[key].title;
            const option = document.createElement('option');
            option.value = key;
            option.textContent = link.lastElementChild.textContent;
            optionGroup.append(option);
            section.append(link);
        }
        nav.append(section);
    }
    const status = document.createElement('div');
    status.className = 'settings-save-bar';
    status.innerHTML = '<span id="settings-save-status" role="status" aria-live="polite">変更は自動保存されます</span><button type="button" id="settings-save-retry" class="settings-secondary-button" hidden>保存を再試行</button>';
    form.querySelector('.settings-detail-heading').append(status);
    const overview = panel('overview');
    const cards = document.createElement('div');
    cards.className = 'settings-overview-grid';
    for (const [, entries] of NAVIGATION) for (const [key, icon] of entries) {
        if (key === 'overview') continue;
        const details = SETTINGS_GROUP_DETAILS[key];
        const link = document.createElement('a');
        link.href = `#settings/${key}`;
        link.className = 'settings-overview-card';
        link.dataset.settingsDestination = key;
        link.innerHTML = `<span class="settings-category-icon" aria-hidden="true">${ICONS[icon] || ''}</span><strong></strong><span class="settings-card-description"></span><span class="settings-card-arrow" aria-hidden="true">↗</span>`;
        link.querySelector('strong').textContent = details.title;
        link.querySelector('.settings-card-description').textContent = details.description;
        cards.append(link);
    }
    overview.append(cards);
    for (const section of form.querySelectorAll('.settings-group-panel')) {
        for (const label of Array.from(section.children).filter(node => node.matches('label[for]'))) {
            const control = form.querySelector(`#${label.htmlFor}`);
            if (!control || control.parentElement !== section) continue;
            const help = control.nextElementSibling?.matches('.settings-help-text') ? control.nextElementSibling : null;
            const row = document.createElement('div');
            row.className = 'settings-field-card';
            label.before(row);
            row.append(label, control);
            if (help) row.append(help);
        }
    }
    for (const label of form.querySelectorAll('label')) {
        const input = label.querySelector('input[type="checkbox"]');
        if (!input) continue;
        label.classList.add('settings-switch-row');
        const text = document.createElement('span');
        text.className = 'settings-switch-copy';
        for (const node of Array.from(label.childNodes)) if (node !== input) text.append(node);
        const track = document.createElement('span');
        track.className = 'settings-toggle-track';
        track.setAttribute('aria-hidden', 'true');
        label.append(text, input, track);
        input.setAttribute('role', 'switch');
    }
}

export function bindSettingsDiscovery(root, selectGroup, requestSave) {
    const search = root.querySelector('#settings-search-input');
    const results = root.querySelector('#settings-search-results');
    const navigate = (group, targetId = null) => {
        selectGroup(group);
        history.replaceState(history.state, '', `#settings/${group}`);
        results.hidden = true;
        let target = targetId ? root.querySelector(`#${targetId}`) : root.querySelector('#settings-group-title');
        if (target?.closest('#settings-custom-colors[hidden]')) target = root.querySelector('#setting-color-theme');
        if (target) {
            target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            if (!target.matches('input, select, textarea, button, a')) target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        }
    };
    root.addEventListener('click', event => {
        const link = event.target.closest('[data-settings-group], [data-settings-destination]');
        if (!link) return;
        event.preventDefault();
        navigate(link.dataset.settingsGroup || link.dataset.settingsDestination, link.dataset.settingsTarget);
    });
    search.addEventListener('input', () => {
        const query = search.value.trim().normalize('NFKC').toLowerCase();
        results.replaceChildren();
        results.hidden = !query;
        if (!query) return;
        let count = 0;
        for (const panel of root.querySelectorAll('.settings-group-panel')) {
            const group = panel.dataset.settingsPanel;
            if (group === 'overview') continue;
            const details = SETTINGS_GROUP_DETAILS[group];
            const candidates = [{ title: details.title, text: details.description, target: null }];
            for (const label of panel.querySelectorAll('label[for]')) {
                const control = root.querySelector(`#${label.htmlFor}`);
                candidates.push({ title: label.textContent.trim(), text: `${control?.textContent || ''} ${label.parentElement.textContent}`, target: label.htmlFor });
            }
            if (!candidates.some(item => `${item.title} ${item.text}`.normalize('NFKC').toLowerCase().includes(query)) &&
                !panel.textContent.normalize('NFKC').toLowerCase().includes(query)) continue;
            const matches = candidates.filter(item => `${item.title} ${item.text}`.normalize('NFKC').toLowerCase().includes(query));
            for (const item of (matches.length ? matches : [candidates[0]]).slice(0, 3)) {
                const link = document.createElement('a');
                link.href = `#settings/${group}`;
                link.dataset.settingsDestination = group;
                if (item.target) link.dataset.settingsTarget = item.target;
                link.textContent = `${item.title} · ${details.title}`;
                results.append(link);
                count += 1;
            }
        }
        if (!count) results.textContent = '一致する設定がありません。別の言葉で検索してください。';
    });
    root.querySelector('#settings-save-retry').addEventListener('click', () => requestSave());
    root.querySelector('#settings-mobile-category').addEventListener('change', event => navigate(event.target.value));
}

export function showSettingsSaveStatus(form, state) {
    const status = form?.querySelector('#settings-save-status');
    if (!status) return;
    status.dataset.state = state;
    status.textContent = ({ saving: '保存しています…', saved: '保存しました', error: '保存できませんでした。再試行してください。' })[state];
    form.querySelector('#settings-save-retry').hidden = state !== 'error';
}

export function bindSettingsNetworkUsage(root) {
    const format = value => {
        if (value < 1024) return `${Math.round(value)} B`;
        if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`;
        if (value < 1073741824) return `${(value / 1048576).toFixed(1)} MB`;
        return `${(value / 1073741824).toFixed(2)} GB`;
    };
    const total = value => value.httpReceived + value.httpSent + value.realtimeReceived + value.realtimeSent;
    const update = () => {
        const { today, month } = getNetworkUsage();
        root.querySelector('[data-usage="today"]').textContent = format(total(today));
        root.querySelector('[data-usage="month"]').textContent = format(total(month));
        for (const key of ['httpReceived', 'httpSent', 'realtimeReceived', 'realtimeSent']) root.querySelector(`[data-usage="${key}"]`).textContent = format(month[key]);
        root.querySelector('[data-usage="coverage"]').textContent = `今月：キャッシュ利用 ${month.cached} 件、サイズを取得できなかった通信 ${month.unmeasured} 件`;
    };
    root.querySelector('#settings-reset-network-usage').addEventListener('click', resetNetworkUsage);
    return subscribeNetworkUsage(update);
}
