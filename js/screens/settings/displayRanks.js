import { t } from '../../modules/i18n.js';
import { api } from '../../api.js';

const RANK_TYPES = Object.freeze(['trust']);
const TYPE_LABELS = Object.freeze({ trust: 'Trust' });
const rankIdLabel = (type, rank) => String(rank);

export function bindSettingsDisplayRanks(root, context, requestSave) {
    const container = root.querySelector('#settings-display-ranks');
    if (!container) return () => {};
    const form = root.querySelector('#settings-form');
    const controller = new AbortController();
    context?.addCleanup(() => controller.abort());
    let loaded = false;
    let pending = false;
    let message = null;

    form?.addEventListener('settings-rank-display-save', event => {
        if (!loaded) return;
        const { settings, failed } = event.detail;
        for (const type of RANK_TYPES) {
            const select = container.querySelector(`[data-display-rank-setting="${type}"]`);
            if (!select) continue;
            const value = settings?.display_ranks?.[type];
            select.value = value == null ? 'null' : JSON.stringify(value);
        }
        if (failed && message) {
            message.hidden = false;
            message.textContent = t('displayranks.save_failed');
        }
    }, { signal: controller.signal });

    const validDisplaySettings = data => {
        if (!data || data.display_rank_options === undefined || data.display_settings === undefined) return false;
        if (typeof data.display_rank_options !== 'object' || Array.isArray(data.display_rank_options)) return false;
        const settings = data.display_settings;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings) ||
            typeof settings.display_ranks !== 'object' || Array.isArray(settings.display_ranks)) return false;
        return RANK_TYPES.every(type => Array.isArray(data.display_rank_options[type]) && data[type]?.rank != null);
    };

    const render = data => {
        container.replaceChildren();
        const heading = document.createElement('h4');
        heading.className = 'nui-section-title';
        heading.textContent = t('displayranks.heading');
        const help = document.createElement('p');
        help.className = 'settings-help-text nui-help-text';
        help.textContent = t('displayranks.help');
        message = document.createElement('p');
        message.className = 'settings-help-text nui-help-text';
        message.setAttribute('role', 'status');
        message.hidden = true;
        container.append(heading, help, message);
        const overrides = data.display_settings.display_ranks;
        for (const type of RANK_TYPES) {
            const label = document.createElement('label');
            label.htmlFor = `settings-display-rank-${type}`;
            label.textContent = TYPE_LABELS[type];
            const select = document.createElement('select');
            select.id = label.htmlFor;
            select.className = 'settings-select nui-input';
            select.dataset.displayRankSetting = type;
            const actualOption = document.createElement('option');
            actualOption.value = 'null';
            actualOption.textContent = t('displayranks.actual_rank', { label: rankIdLabel(type, data[type].rank) });
            select.append(actualOption);
            for (const rank of data.display_rank_options[type]) {
                const option = document.createElement('option');
                option.value = JSON.stringify(rank);
                option.textContent = rankIdLabel(type, rank);
                select.append(option);
            }
            const current = overrides[type];
            select.value = current == null ? 'null' : JSON.stringify(current);
            select.addEventListener('change', () => requestSave?.());
            container.append(label, select);
        }
        container.hidden = false;
    };

    const load = async () => {
        if (loaded || pending || controller.signal.aborted) return;
        pending = true;
        try {
            const { data, error } = await api.users.status({ signal: controller.signal });
            if (controller.signal.aborted || !container.isConnected) return;
            if (error) throw error;
            if (!validDisplaySettings(data)) return;
            render(data);
            loaded = true;
        } catch (error) {
            if (controller.signal.aborted || !container.isConnected) return;
            console.error('[settings/displayRanks] 表示ランク設定を取得できませんでした', error);
        } finally {
            pending = false;
        }
    };

    return load;
}