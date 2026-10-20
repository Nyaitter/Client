const quote = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function readAdvancedSearch(query = '') {
    const values = { keywords: '', phrase: '', from: '', excludeFrom: false, dateMode: 'any', at: '', since: '', until: '', media: '', links: '', kind: '' };
    const keywords = [];
    const seen = new Set();
    const tokens = String(query).match(/(?:-?\w+:)?"(?:\\.|[^"\\])*"|\S+/g) || [];
    const fallback = () => ({ ...values, keywords: String(query), phrase: '', from: '', excludeFrom: false, dateMode: 'any', at: '', since: '', until: '', media: '', links: '', kind: '' });
    for (const raw of tokens) {
        const operator = /^(-?)(from|at|since|until|has|is):(.+)$/i.exec(raw);
        if (!operator) {
            if (/^"(?:\\.|[^"\\])*"$/.test(raw)) {
                if (seen.has('phrase')) return fallback();
                seen.add('phrase'); values.phrase = raw.slice(1, -1).replace(/\\(["\\])/g, '$1');
            } else keywords.push(raw);
            continue;
        }
        const [, negative, rawType, rawValue] = operator;
        const type = rawType.toLowerCase();
        const value = /^"/.test(rawValue) ? rawValue.slice(1, -1).replace(/\\(["\\])/g, '$1') : rawValue;
        const key = type === 'has' ? (value === 'link' ? 'links' : value) : type;
        if (seen.has(key)) return fallback();
        seen.add(key);
        if (type === 'from') { values.from = value; values.excludeFrom = Boolean(negative); }
        else if (['at', 'since', 'until'].includes(type)) {
            if (negative || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) return fallback();
            if ((type === 'at' && (seen.has('since') || seen.has('until'))) || (type !== 'at' && seen.has('at'))) return fallback();
            values[type] = value; values.dateMode = type === 'at' ? 'day' : 'range';
        } else if (type === 'has' && ['media', 'links'].includes(key)) values[key] = negative ? 'exclude' : 'include';
        else if (type === 'is' && ['reply', 'quote', 'repost'].includes(value)) values.kind = negative ? `-${value}` : value;
        else return fallback();
    }
    values.keywords = keywords.join(' ');
    return values;
}

export function buildAdvancedSearch(values) {
    const parts = [String(values.keywords || '').trim()];
    if (values.phrase?.trim()) parts.push(quote(values.phrase.trim()));
    if (values.from?.trim()) {
        const from = values.from.trim();
        parts.push(`${values.excludeFrom ? '-' : ''}from:${/[\s"\\]/.test(from) ? quote(from) : from}`);
    }
    if (values.dateMode === 'day' && values.at) parts.push(`at:${values.at}`);
    if (values.dateMode === 'range') {
        if (values.since) parts.push(`since:${values.since}`);
        if (values.until) parts.push(`until:${values.until}`);
    }
    for (const type of ['media', 'links']) if (values[type]) parts.push(`${values[type] === 'exclude' ? '-' : ''}has:${type}`);
    if (values.kind) parts.push(values.kind.startsWith('-') ? `-is:${values.kind.slice(1)}` : `is:${values.kind}`);
    return parts.filter(Boolean).join(' ');
}

export function bindAdvancedSearch(header, context) {
    const button = header?.querySelector('.advanced-search-button');
    if (!button) return;
    let closeModal = null;
    const open = () => {
        if (closeModal) return;
        const initial = readAdvancedSearch(header.querySelector('#search-input')?.value || '');
        const modal = document.createElement('div');
        modal.className = 'modal-overlay advanced-search-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'advanced-search-title');
        modal.innerHTML = `<section class="modal-content nui-modal advanced-search-modal" data-nui="modal">
            <header class="advanced-search-heading"><h2 id="advanced-search-title">高度な検索</h2><button type="button" class="advanced-search-close" aria-label="閉じる">×</button></header>
            <form class="advanced-search-form nui-form">
                <div class="advanced-search-fields">
                    <label>キーワード・検索式<input name="keywords" type="text" placeholder="例：猫 写真" autocomplete="off"></label>
                    <label>完全一致する語句<input name="phrase" type="text" placeholder="例：今日の猫" autocomplete="off"></label>
                    <fieldset><legend>投稿者</legend><label>NyaitterID または Scratchユーザー名<input name="from" type="text" placeholder="#1234 またはユーザー名" autocomplete="off"></label><label class="advanced-search-checkbox"><input name="excludeFrom" type="checkbox"><span>この投稿者を除く</span></label></fieldset>
                    <fieldset><legend>投稿日 <small>UTC</small></legend><label>期間<select name="dateMode"><option value="any">指定しない</option><option value="day">特定の日</option><option value="range">期間を指定</option></select></label>
                        <label data-search-date="day" hidden>日付<input name="at" type="date"></label>
                        <div class="advanced-search-date-range" data-search-date="range" hidden><label>開始日（含む）<input name="since" type="date"></label><label>終了日（含まない）<input name="until" type="date"></label></div>
                    </fieldset>
                    <fieldset class="advanced-search-filters"><legend>投稿の内容</legend>
                        <label>添付ファイル<select name="media"><option value="">指定しない</option><option value="include">添付あり</option><option value="exclude">添付なし</option></select></label>
                        <label>リンク<select name="links"><option value="">指定しない</option><option value="include">リンクあり</option><option value="exclude">リンクなし</option></select></label>
                        <label class="advanced-search-kind">投稿の種類<select name="kind"><option value="">すべて</option><option value="reply">返信</option><option value="quote">引用</option><option value="repost">リポスト</option><option value="-reply">返信を除く</option><option value="-quote">引用を除く</option><option value="-repost">リポストを除く</option></select></label>
                    </fieldset>
                    <p class="advanced-search-error" role="alert" hidden></p>
                </div>
                <footer class="advanced-search-actions"><button type="button" class="nui-button-secondary" data-search-cancel>キャンセル</button><button type="submit" class="nui-button settings-primary-button">検索</button></footer>
            </form>
        </section>`;
        const previousOverflow = document.body.style.overflow;
        const form = modal.querySelector('form');
        for (const [name, value] of Object.entries(initial)) {
            const input = form.elements.namedItem(name);
            if (input.type === 'checkbox') input.checked = value;
            else input.value = value;
        }
        const readValues = () => Object.fromEntries([...form.elements].filter(input => input.name).map(input => [input.name, input.type === 'checkbox' ? input.checked : input.value]));
        const updateDates = () => {
            form.elements.at.required = form.elements.dateMode.value === 'day';
            for (const row of modal.querySelectorAll('[data-search-date]')) row.hidden = row.dataset.searchDate !== form.elements.dateMode.value;
        };
        updateDates();
        form.elements.dateMode.addEventListener('change', updateDates);
        const close = () => {
            if (!closeModal) return;
            document.removeEventListener('keydown', onKeyDown, true);
            document.body.style.overflow = previousOverflow;
            modal.remove();
            closeModal = null;
            if (button.isConnected) button.focus({ preventScroll: true });
        };
        const onKeyDown = event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
            if (event.key !== 'Tab') return;
            const controls = [...modal.querySelectorAll('button,input,select')].filter(input => !input.disabled && !input.closest('[hidden]'));
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
        };
        closeModal = close;
        document.addEventListener('keydown', onKeyDown, true);
        modal.querySelector('.advanced-search-close').addEventListener('click', close);
        modal.querySelector('[data-search-cancel]').addEventListener('click', close);
        modal.addEventListener('click', event => { if (event.target === modal) close(); });
        form.addEventListener('submit', event => {
            event.preventDefault();
            const values = readValues();
            const query = buildAdvancedSearch(values);
            const error = modal.querySelector('.advanced-search-error');
            const message = !query ? '検索条件を入力してください。' : values.dateMode === 'range' && values.since && values.until && values.since >= values.until ? '終了日は開始日より後の日付を指定してください。' : '';
            error.hidden = !message; error.textContent = message;
            if (message) { form.elements[!query ? 'keywords' : 'until'].focus(); return; }
            close();
            const searchInput = header.querySelector('#search-input');
            if (searchInput) searchInput.value = query;
            window.location.hash = `#search/${encodeURIComponent(query)}`;
        });
        document.body.append(modal);
        document.body.style.overflow = 'hidden';
        form.elements.keywords.focus({ preventScroll: true });
    };
    button.addEventListener('click', open);
    context?.addCleanup(() => { closeModal?.(); button.removeEventListener('click', open); });
}
