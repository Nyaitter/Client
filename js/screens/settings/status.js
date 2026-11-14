import { t } from '../../modules/i18n.js';
import { api } from '../../api.js';

const STATUS_TABS = [
    ['trust', 'Trust'],
];

const TRUST_COLORS = {
    Trusted: '#6416ff',
    Reliable: '#80b3ff',
    Credible: '#c2ffb3',
    Neutral: '#cccccc',
    Questionable: '#f20000',
    Suspicious: '#b30000',
    Banned: '#660000',
    Unknown: '#808080',
};

export function bindSettingsStatus(root, context) {
    const group = root.querySelector('[data-settings-panel="status"]');
    if (!group) return () => {};
    group.querySelector('.settings-status-root')?.remove();
    const statusRoot = document.createElement('div');
    statusRoot.className = 'settings-status-root';
    statusRoot.innerHTML = `
        <div class="settings-status-tabs-container">
            <div class="settings-status-tabs nui-tabs" role="tablist" aria-label="${t('status.tabs_label')}" data-nui="tabs">
                ${STATUS_TABS.map(([key, label], index) => `
                    <button type="button" class="settings-status-tab nui-tab" role="tab" id="settings-status-tab-${key}" aria-controls="settings-status-panel-${key}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${label}</button>
                `).join('')}
            </div>
        </div>
        <p class="settings-help-text nui-help-text" role="status" aria-live="polite" id="settings-status-message"></p>
        ${STATUS_TABS.map(([key]) => `<section class="settings-status-category" id="settings-status-panel-${key}" role="tabpanel" aria-labelledby="settings-status-tab-${key}" tabindex="0" hidden></section>`).join('')}`;
    group.prepend(statusRoot);

    const tabs = [...group.querySelectorAll('[role="tab"]')];
    const panels = [...group.querySelectorAll('[role="tabpanel"]')];
    const message = group.querySelector('#settings-status-message');
    const controller = new AbortController();
    context?.addCleanup(() => controller.abort());
    let selected = 0;
    let loaded = false;
    let pending = false;

    const select = index => {
        selected = index;
        tabs.forEach((tab, i) => {
            tab.setAttribute('aria-selected', String(i === index));
            tab.tabIndex = i === index ? 0 : -1;
            panels[i].hidden = !loaded || i !== index;
        });
    };
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => select(index));
        tab.addEventListener('keydown', event => {
            let next;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            else return;
            event.preventDefault();
            select(next);
            tabs[next].focus();
        });
    });

    const rankColor = (key, item) => TRUST_COLORS[String(item?.rank ?? item)] || TRUST_COLORS.Unknown;

    const renderDetails = (detail, status, key) => {
        const selectedLabel = document.createElement('p');
        selectedLabel.className = 'settings-help-text nui-help-text';
        selectedLabel.textContent = t('status.selected_rank');
        const rank = document.createElement('h4');
        rank.className = 'settings-status-rank';
        rank.style.color = rankColor(key, status);
        rank.textContent = status.label;
        const description = document.createElement('p');
        description.className = 'settings-help-text nui-help-text';
        description.textContent = status.description;
        detail.replaceChildren(selectedLabel, rank, description);
        const section = document.createElement('div');
        section.className = 'settings-status-details';
        const heading = document.createElement('h5');
        heading.id = `settings-status-details-heading-${key}`;
        heading.textContent = t('status.situation');
        const list = document.createElement('ul');
        const items = [...(status.benefits || []), ...(status.restrictions || [])];
        for (const text of items.length ? items : [t('status.none')]) {
            const item = document.createElement('li');
            item.textContent = text;
            list.append(item);
        }
        const scroll = document.createElement('div');
        scroll.className = 'settings-status-details-scroll';
        scroll.tabIndex = 0;
        scroll.setAttribute('role', 'group');
        scroll.setAttribute('aria-labelledby', heading.id);
        scroll.append(list);
        section.append(heading, scroll);
        detail.append(section);
    };

    const render = (panel, status, key) => {
        const current = document.createElement('p');
        current.className = 'settings-status-current';
        current.id = `settings-status-current-${key}`;
        current.textContent = t('status.current_rank', { label: status.label });
        const layout = document.createElement('div');
        layout.className = 'settings-status-layout';
        const rankList = document.createElement('div');
        rankList.className = 'settings-status-list nui-card';
        const heading = document.createElement('h4');
        heading.textContent = t('status.rank_list');
        const list = document.createElement('ul');
        list.className = 'settings-status-ranks';
        rankList.append(heading, list);
        const detail = document.createElement('div');
        detail.id = `settings-status-detail-${key}`;
        detail.className = 'settings-status-card nui-card';
        detail.setAttribute('role', 'region');
        detail.setAttribute('aria-label', t('status.selected_detail_label'));
        detail.setAttribute('aria-live', 'polite');
        const ranks = Array.isArray(status.ranks) && status.ranks.length ? status.ranks : [status];
        const buttons = [];
        for (const item of ranks) {
            const isCurrent = item.rank === status.rank;
            const entry = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'settings-status-rank-button';
            button.setAttribute('aria-controls', detail.id);
            button.setAttribute('aria-pressed', String(isCurrent));
            const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            indicator.setAttribute('class', 'settings-status-indicator');
            indicator.setAttribute('viewBox', '0 0 16 16');
            indicator.setAttribute('aria-hidden', 'true');
            indicator.setAttribute('focusable', 'false');
            indicator.style.color = rankColor(key, item);
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '8');
            circle.setAttribute('cy', '8');
            circle.setAttribute('r', '5.5');
            circle.setAttribute('fill', isCurrent ? 'currentColor' : 'none');
            circle.setAttribute('stroke', 'currentColor');
            circle.setAttribute('stroke-width', '2.5');
            indicator.append(circle);
            const label = document.createElement('span');
            label.textContent = item.label;
            button.append(indicator, label);
            if (isCurrent) {
                const badge = document.createElement('span');
                badge.className = 'settings-status-current-badge';
                badge.textContent = t('status.current_badge');
                button.append(badge);
            }
            button.addEventListener('click', () => {
                for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
                renderDetails(detail, item, key);
            });
            buttons.push(button);
            entry.append(button);
            list.append(entry);
        }
        renderDetails(detail, ranks.find(item => item.rank === status.rank) || status, key);
        layout.append(rankList, detail);
        panel.replaceChildren(current, layout);
    };

    const validRank = (status, key) => status &&
        typeof status.rank === 'string' &&
        typeof status.label === 'string' && typeof status.description === 'string' &&
        (status.requirements === undefined || (Array.isArray(status.requirements) && status.requirements.every(item => typeof item === 'string'))) &&
        ['benefits', 'restrictions'].every(field => Array.isArray(status[field]) && status[field].every(item => typeof item === 'string'));

    const load = async () => {
        if (loaded || pending || controller.signal.aborted) return;
        pending = true;
        group.setAttribute('aria-busy', 'true');
        message.hidden = false;
        message.textContent = t('status.loading');
        try {
            const { data, error } = await api.users.status({ signal: controller.signal });
            if (controller.signal.aborted || !group.isConnected) return;
            if (error) throw error;
            const normalized = {};
            for (const [key] of STATUS_TABS) {
                const status = data?.[key];
                if (!validRank(status, key) || (status.ranks !== undefined &&
                    (!Array.isArray(status.ranks) || !status.ranks.every(item => validRank(item, key)) ||
                    !status.ranks.some(item => item.rank === status.rank) ||
                    new Set(status.ranks.map(item => item.rank)).size !== status.ranks.length))) {
                    throw new Error('Invalid status response');
                }
                normalized[key] = { ...status, ranks: status.ranks ?? [status] };
            }
            STATUS_TABS.forEach(([key], index) => render(panels[index], normalized[key], key));
            loaded = true;
            message.textContent = '';
            message.hidden = true;
            select(selected);
        } catch (error) {
            if (controller.signal.aborted || !group.isConnected) return;
            console.error('[settings/status] ステータスの表示に失敗しました', error);
            message.textContent = t('status.load_failed');
        } finally {
            pending = false;
            group.setAttribute('aria-busy', 'false');
        }
    };
    return load;
}
