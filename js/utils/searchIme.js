const IME_ENTER_SUPPRESS_MS = 1000;

function isImeEvent(event, composing) {
    if (composing) return true;
    if (!event) return false;
    if (event.isComposing) return true;
    // Android Gboard 等では変換中のキーが keyCode 229 や key 'Process' で届く。変換中は composition 状態でも判定する。
    if (event.keyCode === 229) return true;
    if (event.key === 'Process') return true;
    return false;
}

export function trackSearchComposition(element) {
    let composing = false;
    element.addEventListener('compositionstart', () => { composing = true; });
    element.addEventListener('compositionupdate', () => { composing = true; });
    element.addEventListener('compositionend', () => { composing = false; });
    // compositionend を取りこぼす環境でも、フォーカスを失えば変換中扱いを解除する。
    element.addEventListener('blur', () => { composing = false; }, true);
    return (event) => isImeEvent(event, composing);
}

export function guardSearchFormComposition(form) {
    const isComposing = trackSearchComposition(form);
    let imeEnterAt = 0;
    let imeEnterPending = false;
    form.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') {
            if (!isImeEvent(event, false)) imeEnterPending = false;
            return;
        }
        if (isComposing(event)) {
            imeEnterPending = true;
            imeEnterAt = Date.now();
        }
    });
    form.addEventListener('submit', (event) => {
        // 確定 Enter の直後に届く submit を1回だけ止める。発火順に依存しないよう時刻で判定する。
        const recentImeEnter = imeEnterPending && Date.now() - imeEnterAt <= IME_ENTER_SUPPRESS_MS;
        if (!recentImeEnter && !isComposing(event)) return;
        imeEnterPending = false;
        event.preventDefault();
        event.stopImmediatePropagation();
    });
}
