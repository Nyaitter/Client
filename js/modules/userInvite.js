import { api } from '../api.js';
import { getCurrentUser } from '../state.js';
import { escapeHTML, getNyaitterId, getUserIconUrl } from '../utils/helpers.js';

const SEARCH_DEBOUNCE_MS = 250;

function renderChip(user) {
    return `<span class="user-invite-chip"><span class="user-invite-chip-name">${escapeHTML(user.name || `#${user.id}`)}</span> <small>${escapeHTML(getNyaitterId(user))}</small><button type="button" data-invite-remove="${Number(user.id)}" aria-label="${escapeHTML(user.name || `#${user.id}`)}を選択解除">×</button></span>`;
}

function renderOption(user) {
    return `<button type="button" class="user-invite-option" role="option" data-invite-user="${Number(user.id)}"><img src="${escapeHTML(getUserIconUrl(user))}" alt=""><span><strong>${escapeHTML(user.name || `#${user.id}`)}</strong><small>${escapeHTML(getNyaitterId(user))}${user.scid ? ` · @${escapeHTML(user.scid)}` : ''}</small></span></button>`;
}

export function createUserInvitePicker({ input, suggestions, selected, signal, excludeIds = [], initialUsers = [], emptyText = '招待するユーザーを検索してください。', onChange } = {}) {
    const selectedUsers = new Map();
    const excluded = new Set((excludeIds || []).map(Number));
    const currentUserId = Number(getCurrentUser()?.id);
    let searchTimer;
    let searchVersion = 0;
    for (const user of initialUsers || []) if (user && user.id !== undefined) selectedUsers.set(Number(user.id), user);

    function renderSelected() {
        if (selected) {
            selected.innerHTML = selectedUsers.size
                ? [...selectedUsers.values()].map(renderChip).join('')
                : `<span class="user-invite-empty">${escapeHTML(emptyText)}</span>`;
            for (const button of selected.querySelectorAll('[data-invite-remove]')) {
                button.onclick = () => {
                    selectedUsers.delete(Number(button.dataset.inviteRemove));
                    renderSelected();
                };
            }
        }
        if (typeof onChange === 'function') onChange(selectedUsers.size);
    }

    function drawSuggestions(users) {
        if (!suggestions) return;
        const matches = (users || []).filter((user) => !selectedUsers.has(Number(user.id)) && !excluded.has(Number(user.id)) && Number(user.id) !== currentUserId);
        suggestions.innerHTML = matches.length
            ? matches.map(renderOption).join('')
            : '<p class="user-invite-empty">一致するユーザーがいません。</p>';
        for (const option of suggestions.querySelectorAll('[data-invite-user]')) {
            option.onclick = () => {
                const user = matches.find((item) => Number(item.id) === Number(option.dataset.inviteUser));
                if (user) selectedUsers.set(Number(user.id), user);
                if (input) input.value = '';
                suggestions.innerHTML = '';
                renderSelected();
                input?.focus();
            };
        }
    }

    if (input) {
        input.oninput = () => {
            clearTimeout(searchTimer);
            const query = input.value.trim().replace(/^@/, '');
            const version = ++searchVersion;
            if (!query) { if (suggestions) suggestions.innerHTML = ''; return; }
            searchTimer = setTimeout(async () => {
                try {
                    const numericId = query.replace(/^#/, '');
                    const filter = /^\d+$/.test(numericId)
                        ? `name.ilike.%${query}%,scid.ilike.%${query}%,me.ilike.%${query}%,id.eq.${Number(numericId)}`
                        : `name.ilike.%${query}%,scid.ilike.%${query}%,me.ilike.%${query}%`;
                    const { data: users, error } = await api.from('user').select('id, name, scid, me, nyaitter_id, icon_data').or(filter).neq('id', currentUserId).limit(8);
                    if (signal?.aborted || version !== searchVersion) return;
                    if (error) throw error;
                    drawSuggestions(users);
                } catch (error) {
                    if (!signal?.aborted && version === searchVersion && suggestions) suggestions.innerHTML = `<p class="user-invite-empty" role="alert">${escapeHTML(error.message)}</p>`;
                }
            }, SEARCH_DEBOUNCE_MS);
        };
    }

    renderSelected();

    return {
        get size() { return selectedUsers.size; },
        get ids() { return [...selectedUsers.keys()]; },
        get users() { return [...selectedUsers.values()]; },
        add(user) { if (user) { selectedUsers.set(Number(user.id), user); renderSelected(); } },
        clear() {
            selectedUsers.clear();
            if (input) input.value = '';
            if (suggestions) suggestions.innerHTML = '';
            searchVersion += 1;
            renderSelected();
        },
    };
}
