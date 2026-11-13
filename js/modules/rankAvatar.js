import { t } from './i18n.js';


const SVG_NS = "http://www.w3.org/2000/svg";
const instances = new WeakMap();
let nextId = 0;

const RING = "M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0 Z";

function portalScale(element) {
    if (typeof element.currentCSSZoom === "number") return element.currentCSSZoom || 1;
    let scale = 1;
    for (let node = element; node; node = node.parentElement) {
        const zoom = element.ownerDocument.defaultView.getComputedStyle(node).zoom;
        const value = parseFloat(zoom);
        if (Number.isFinite(value) && value > 0) scale *= zoom.endsWith("%") ? value / 100 : value;
    }
    return scale;
}

// ランク取得や本人判定は呼出元で行い、公開してよいIDだけを渡す。
export function attachRankAvatar(image, options = {}) {
    if (!image || image.tagName !== "IMG") throw new TypeError(t('rankavatar.image_required'));
    const previous = instances.get(image);
    if (previous) {
        previous.update(options);
        return previous;
    }

    const document = image.ownerDocument;
    const window = document.defaultView;
    let settings = { enabled: false, isSelf: true, ranks: null, focusTarget: null, ...options };
    let overlay = null;
    let host = null;
    let hostMode = null;
    let frame = null;
    let positionedEl = null;
    let wrapStyles = null;
    let savedImageStyle;
    let tooltip = null;
    let panel = null;
    let trigger = null;
    let controller = null;
    let popupController = null;
    let tooltipTimer = 0;
    let destroyed = false;
    let entries = [];
    let paths = [];
    const id = "rank-avatar-" + (++nextId);

    const focusImage = () => {
        const target = settings.focusTarget || image.closest("a[href], button, [tabindex]") || image;
        if (!target?.isConnected || typeof target.focus !== "function") return;
        const temporary = !target.hasAttribute("tabindex") && target.tabIndex < 0;
        if (temporary) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        if (temporary) target.removeAttribute("tabindex");
    };

    const hideTooltip = () => {
        window.clearTimeout(tooltipTimer);
        if (tooltip) tooltip.hidden = true;
        for (const path of paths) path.removeAttribute("aria-describedby");
        if (!panel) untrackPopups();
    };

    const deferHideTooltip = () => {
        window.clearTimeout(tooltipTimer);
        tooltipTimer = window.setTimeout(hideTooltip, 150);
    };

    // ポップアップは body 直下に置くため、画像が属する重なり文脈へ z-index を合わせる。
    const contextZ = () => {
        for (let parent = image.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const style = window.getComputedStyle(parent);
            const z = Number.parseInt(style.zIndex, 10);
            if (Number.isFinite(z) || ["fixed", "sticky"].includes(style.position) ||
                style.transform !== "none" || style.filter !== "none" ||
                style.isolation === "isolate" || Number(style.opacity) < 1 ||
                /paint|layout|strict|content/.test(style.contain)) return Number.isFinite(z) ? z : 0;
        }
        return null;
    };

    const positionPopup = popup => {
        if (!popup || popup.hidden) return;
        const rect = image.getBoundingClientRect();
        const bounds = popup.getBoundingClientRect();
        const viewport = window.visualViewport;
        const left = viewport?.offsetLeft || 0;
        const top = viewport?.offsetTop || 0;
        const width = viewport?.width || window.innerWidth;
        const height = viewport?.height || window.innerHeight;
        const scale = portalScale(popup);
        popup.style.zIndex = String(Math.max(2100, (contextZ() ?? 0) + 1));
        popup.style.left = (Math.max(left + 8, Math.min(rect.left, left + width - bounds.width - 8)) / scale) + "px";
        const below = rect.bottom + 10;
        popup.style.top = (Math.max(top + 8, Math.min(below + bounds.height <= top + height - 8 ? below : rect.top - bounds.height - 10, top + height - bounds.height - 8)) / scale) + "px";
    };

    const repositionPopups = () => {
        if (!image.isConnected) {
            closePanel();
            hideTooltip();
            return;
        }
        positionPopup(tooltip);
        positionPopup(panel);
    };

    // ポップアップ表示中だけ、スクロールへの追従を行う。
    const trackPopups = () => {
        if (popupController) return;
        popupController = new window.AbortController();
        const signal = popupController.signal;
        window.addEventListener("scroll", repositionPopups, { capture: true, passive: true, signal });
        window.addEventListener("resize", repositionPopups, { passive: true, signal });
        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", repositionPopups, { passive: true, signal });
            window.visualViewport.addEventListener("scroll", repositionPopups, { passive: true, signal });
        }
    };

    const untrackPopups = () => {
        popupController?.abort();
        popupController = null;
    };

    const closePanel = (restoreFocus = false) => {
        if (!panel) return;
        const oldTrigger = trigger;
        panel.remove();
        panel = null;
        trigger = null;
        for (const path of paths) path.setAttribute("aria-expanded", "false");
        if (!tooltip || tooltip.hidden) untrackPopups();
        if (restoreFocus) {
            if (oldTrigger?.isConnected) oldTrigger.focus({ preventScroll: true });
            else focusImage();
        }
    };

    const showTooltip = (path, entry) => {
        if (panel || !tooltip || !overlay || overlay.style.display === "none") return;
        hideTooltip();
        tooltip.textContent = entry.label;
        tooltip.hidden = false;
        path.setAttribute("aria-describedby", tooltip.id);
        trackPopups();
        positionPopup(tooltip);
    };

    const openPanel = path => {
        if (panel) {
            closePanel(true);
            return;
        }
        hideTooltip();
        trigger = path;
        panel = document.createElement("div");
        panel.className = "rank-avatar-panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", typeof settings.label === "string" ? settings.label + t('rankavatar.info_suffix') : t('rankavatar.info_fallback'));
        const list = document.createElement("ul");
        for (const entry of entries) {
            const item = document.createElement("li");
            item.textContent = entry.label;
            list.append(item);
        }
        const close = document.createElement("button");
        close.type = "button";
        close.textContent = t('common.close');
        close.addEventListener("click", () => closePanel(true));
        panel.append(list, close);
        document.body.append(panel);
        path.setAttribute("aria-expanded", "true");
        trackPopups();
        positionPopup(panel);
        close.focus({ preventScroll: true });
    };

    const restoreImageStyle = () => {
        if (savedImageStyle === undefined) return;
        if (savedImageStyle === null) image.removeAttribute("style");
        else image.setAttribute("style", savedImageStyle);
        savedImageStyle = undefined;
    };

    const syncOverframe = () => {
        if (hostMode !== "overframe" || !frame || !overlay) return;
        overlay.style.left = frame.offsetLeft + "px";
        overlay.style.top = frame.offsetTop + "px";
        overlay.style.width = frame.offsetWidth + "px";
        overlay.style.height = frame.offsetHeight + "px";
    };

    const unwrapHost = () => {
        if (positionedEl) {
            positionedEl.style.position = "";
            positionedEl = null;
        }
        if (hostMode === "wrap" && host) {
            const parent = host.parentElement;
            if (parent && image.parentElement === host) parent.insertBefore(image, host);
            host.remove();
        }
        restoreImageStyle();
        host = null;
        hostMode = null;
        frame = null;
        wrapStyles = null;
    };

    // 親が flex / grid の場合、画像が受けていたアイテム配置をラッパーへ引き継ぐ。
    const adoptItemPlacement = (wrap, parentStyle, imageStyle) => {
        const applied = [];
        const set = (prop, value) => {
            wrap.style[prop] = value;
            applied.push([prop, value]);
        };
        if (parentStyle.display.includes("grid")) {
            set("gridColumnStart", imageStyle.gridColumnStart);
            set("gridColumnEnd", imageStyle.gridColumnEnd);
            set("gridRowStart", imageStyle.gridRowStart);
            set("gridRowEnd", imageStyle.gridRowEnd);
        }
        if (parentStyle.display.includes("flex") || parentStyle.display.includes("grid")) {
            set("flexGrow", imageStyle.flexGrow);
            set("flexShrink", imageStyle.flexShrink);
            set("flexBasis", imageStyle.flexBasis);
            set("alignSelf", imageStyle.alignSelf);
            set("justifySelf", imageStyle.justifySelf);
            set("order", imageStyle.order);
        }
        if (imageStyle.marginTop !== "0px" || imageStyle.marginRight !== "0px" ||
            imageStyle.marginBottom !== "0px" || imageStyle.marginLeft !== "0px") {
            set("margin", imageStyle.marginTop + " " + imageStyle.marginRight + " " + imageStyle.marginBottom + " " + imageStyle.marginLeft);
            savedImageStyle = image.getAttribute("style");
            image.style.margin = "0px";
        }
        if (imageStyle.position === "absolute" || imageStyle.position === "fixed") {
            // 重ねアイコン等の絶対配置は、配置ごとラッパーへ移して画像と一緒に動かす。
            if (savedImageStyle === undefined) savedImageStyle = image.getAttribute("style");
            set("position", imageStyle.position);
            set("top", imageStyle.top);
            set("right", imageStyle.right);
            set("bottom", imageStyle.bottom);
            set("left", imageStyle.left);
            set("width", image.offsetWidth + "px");
            set("height", image.offsetHeight + "px");
            set("boxSizing", "border-box");
            if (imageStyle.zIndex !== "auto") set("zIndex", imageStyle.zIndex);
            image.style.position = "static";
            image.style.width = "100%";
            image.style.height = "100%";
            image.style.boxSizing = "border-box";
            image.style.transform = "";
        }
        return applied;
    };

    const buildHost = () => {
        const parent = image.parentElement;
        if (!parent || !overlay) return;
        const imageStyle = window.getComputedStyle(image);
        const parentStyle = window.getComputedStyle(parent);
        const ir = image.getBoundingClientRect();
        const pr = parent.getBoundingClientRect();
        const fills = ir.width > 0 && ir.height > 0 &&
            Math.abs(pr.width - ir.width) <= 1.5 && Math.abs(pr.height - ir.height) <= 1.5 &&
            Math.abs(pr.left - ir.left) <= 1.5 && Math.abs(pr.top - ir.top) <= 1.5;
        const inFlow = imageStyle.position !== "absolute" && imageStyle.position !== "fixed";
        if (fills && inFlow && parent.childElementCount === 1 && parent.tagName !== "A" && parent.tagName !== "BUTTON") {
            const clips = /(hidden|clip)/.test(parentStyle.overflowX) || /(hidden|clip)/.test(parentStyle.overflowY);
            const hiddenRoot = parent.closest("[aria-hidden=\"true\"]");
            const grand = parent.parentElement;
            // 切り抜くフレームと aria-hidden なフレームでは、リングをフレームの外（親側）へ出す。
            if ((clips || hiddenRoot === parent) && grand && !grand.closest("[aria-hidden=\"true\"]")) {
                host = grand;
                hostMode = "overframe";
                frame = parent;
                if (window.getComputedStyle(grand).position === "static") {
                    grand.style.position = "relative";
                    positionedEl = grand;
                }
                overlay.style.inset = "auto";
                grand.append(overlay);
                syncOverframe();
                return;
            }
            if (!clips) {
                host = parent;
                hostMode = "frame";
                if (parentStyle.position === "static") {
                    parent.style.position = "relative";
                    positionedEl = parent;
                }
                parent.append(overlay);
                return;
            }
        }
        const wrap = document.createElement("span");
        wrap.className = "rank-avatar-wrap";
        wrapStyles = adoptItemPlacement(wrap, parentStyle, imageStyle);
        parent.insertBefore(wrap, image);
        wrap.append(image, overlay);
        host = wrap;
        hostMode = "wrap";
    };

    const refresh = () => {
        if (!overlay) return;
        if (!overlay.isConnected || (host && !host.contains(image))) {
            // 画像だけが外部から移動された場合は、ホストを作り直して追随する。
            overlay.remove();
            unwrapHost();
            buildHost();
        }
        if (hostMode === "wrap" && host && wrapStyles) {
            for (const [prop, value] of wrapStyles) {
                if (host.style[prop] !== value) host.style[prop] = value;
            }
        }
        if (hostMode === "overframe") syncOverframe();
        const style = window.getComputedStyle(image);
        const gone = !image.isConnected || !image.getClientRects().length || style.display === "none";
        overlay.style.display = gone ? "none" : "";
        overlay.style.visibility = style.visibility !== "visible" ? "hidden" : "";
        if (gone) {
            hideTooltip();
            const focused = panel?.contains(document.activeElement);
            closePanel();
            if (focused) focusImage();
        } else {
            repositionPopups();
        }
    };

    const clear = () => {
        const focused = overlay?.contains(document.activeElement) || panel?.contains(document.activeElement);
        controller?.abort();
        controller = null;
        untrackPopups();
        window.clearTimeout(tooltipTimer);
        closePanel();
        tooltip?.remove();
        tooltip = null;
        overlay?.remove();
        overlay = null;
        unwrapHost();
        paths = [];
        if (focused) focusImage();
    };

    const render = () => {
        clear();
        if (settings.enabled !== true || settings.isSelf !== false) return;
        entries = [getRankAppearance("trust", settings.ranks?.trust)].filter(Boolean);
        if (!entries.length) return;
        controller = new window.AbortController();
        const listen = (target, event, callback, extra = {}) => target.addEventListener(event, callback, { ...extra, signal: controller.signal });
        overlay = document.createElement("span");
        overlay.className = "rank-avatar-layer";
        overlay.setAttribute("role", "group");
        overlay.setAttribute("aria-label", typeof settings.label === "string" ? settings.label : t('rankavatar.display_rank'));
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("preserveAspectRatio", "none");
        svg.setAttribute("class", "rank-avatar-rings");
        for (const [index, entry] of entries.entries()) {
            const group = document.createElementNS(SVG_NS, "g");
            group.setAttribute("class", "rank-avatar-segment");
            group.style.color = entry.color;
            const line = document.createElementNS(SVG_NS, "path");
            line.setAttribute("d", RING);
            line.setAttribute("class", "rank-avatar-line");
            line.setAttribute("aria-hidden", "true");
            const hit = document.createElementNS(SVG_NS, "path");
            hit.setAttribute("d", RING);
            hit.setAttribute("class", "rank-avatar-hit");
            hit.dataset.rankType = entry.type;
            hit.setAttribute("role", "button");
            hit.setAttribute("aria-label", entry.label + t('rankavatar.open_info_suffix'));
            hit.setAttribute("aria-haspopup", "dialog");
            hit.setAttribute("aria-expanded", "false");
            hit.setAttribute("tabindex", index === 0 ? "0" : "-1");
            const activate = event => {
                event.preventDefault();
                event.stopPropagation();
                openPanel(hit);
            };
            listen(hit, "click", activate);
            listen(hit, "pointerenter", event => {
                if (event.pointerType !== "touch") showTooltip(hit, entry);
            });
            listen(hit, "pointerleave", () => {
                if (document.activeElement !== hit) deferHideTooltip();
            });
            listen(hit, "focus", () => {
                paths.forEach(path => path.setAttribute("tabindex", path === hit ? "0" : "-1"));
                showTooltip(hit, entry);
            });
            listen(hit, "blur", hideTooltip);
            listen(hit, "keydown", event => {
                if (event.key === "Enter" || event.key === " ") return activate(event);
                let next;
                if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % paths.length;
                else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + paths.length - 1) % paths.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = paths.length - 1;
                else return;
                event.preventDefault();
                event.stopPropagation();
                paths[next].focus();
            });
            paths.push(hit);
            group.append(line, hit);
            svg.append(group);
        }
        overlay.append(svg);
        tooltip = document.createElement("span");
        tooltip.id = id + "-tooltip";
        tooltip.className = "rank-avatar-tooltip";
        tooltip.setAttribute("role", "tooltip");
        tooltip.hidden = true;
        listen(tooltip, "pointerenter", () => window.clearTimeout(tooltipTimer));
        listen(tooltip, "pointerleave", deferHideTooltip);
        document.body.append(tooltip);
        buildHost();
        listen(document, "pointerdown", event => {
            if (!overlay?.contains(event.target) && !panel?.contains(event.target)) {
                closePanel(Boolean(panel?.contains(document.activeElement)));
                hideTooltip();
            }
        }, { capture: true });
        listen(document, "keydown", event => {
            if (event.key === "Escape" && (panel || (tooltip && !tooltip.hidden))) {
                event.preventDefault();
                event.stopPropagation();
                closePanel(true);
                hideTooltip();
            }
        });
        listen(document, "focusin", event => {
            if (panel && !panel.contains(event.target) && !overlay?.contains(event.target)) closePanel();
        });
        refresh();
    };

    const handle = {
        update(next = {}) {
            if (destroyed) return;
            settings = { ...settings, ...next };
            render();
        },
        refresh,
        destroy() {
            if (destroyed) return;
            clear();
            destroyed = true;
            instances.delete(image);
        },
    };
    instances.set(image, handle);
    render();
    return handle;
}

export const TRUST_COLORS = Object.freeze({
    Trusted: '#6416ff',
    Reliable: '#80b3ff',
    Credible: '#c2ffb3',
    Neutral: '#cccccc',
    Questionable: '#f20000',
    Suspicious: '#b30000',
    Banned: '#660000',
    Unknown: '#808080',
});

export const RANK_TYPES = Object.freeze(['trust']);
const TRUST_IDS = Object.freeze({
    T: 'Trusted', R: 'Reliable', C: 'Credible', N: 'Neutral',
    Q: 'Questionable', S: 'Suspicious', B: 'Banned', U: 'Unknown',
});
export function getRankAppearance(type, rankId) {
    if (!RANK_TYPES.includes(type)) return null;
    if (typeof rankId !== 'string') return null;
    const name = Object.hasOwn(TRUST_IDS, rankId) ? TRUST_IDS[rankId] : rankId;
    if (!Object.hasOwn(TRUST_COLORS, name)) return null;
    return { type, id: rankId, color: TRUST_COLORS[name], label: `${name} User` };
}
