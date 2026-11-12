var NyaitterUI = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name2 in all)
      __defProp(target, name2, { get: all[name2], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.js
  var index_exports = {};
  __export(index_exports, {
    Fragment: () => Fragment,
    addMessages: () => addMessages,
    classForKind: () => classForKind,
    components: () => components_exports,
    computed: () => computed,
    configure: () => configure,
    createApp: () => createApp,
    default: () => index_default,
    defineComponent: () => defineComponent,
    description: () => description,
    effect: () => effect,
    enhance: () => enhance,
    getConfig: () => getConfig,
    getLocale: () => getLocale,
    h: () => h,
    injectStyles: () => injectStyles,
    name: () => name,
    ref: () => ref,
    render: () => render,
    repository: () => repository,
    resetConfig: () => resetConfig,
    setLocale: () => setLocale,
    setMessages: () => setMessages,
    start: () => start,
    stop: () => stop,
    t: () => t,
    translateNodes: () => translateNodes,
    upgradeElement: () => upgradeElement,
    useI18n: () => useI18n,
    version: () => version,
    watch: () => watch
  });

  // src/reactivity.js
  var activeEffect = null;
  function track(dep) {
    if (!activeEffect) return;
    dep.add(activeEffect);
    activeEffect.deps.add(dep);
  }
  function trigger(dep) {
    for (const listener of [...dep]) {
      if (listener.scheduler) listener.scheduler();
      else listener.run();
    }
  }
  function cleanup(listener) {
    for (const dep of listener.deps) dep.delete(listener);
    listener.deps.clear();
  }
  function effect(fn, scheduler = null) {
    const listener = {
      fn,
      scheduler,
      deps: /* @__PURE__ */ new Set(),
      active: true,
      run() {
        if (!listener.active) return;
        cleanup(listener);
        const previous = activeEffect;
        activeEffect = listener;
        try {
          listener.fn();
        } finally {
          activeEffect = previous;
        }
      },
      stop() {
        cleanup(listener);
        listener.active = false;
      }
    };
    listener.run();
    return listener;
  }
  function ref(initial) {
    let value = initial;
    const dep = /* @__PURE__ */ new Set();
    return {
      __isRef: true,
      get value() {
        track(dep);
        return value;
      },
      set value(next) {
        if (Object.is(next, value)) return;
        value = next;
        trigger(dep);
      }
    };
  }
  function computed(getter) {
    const dep = /* @__PURE__ */ new Set();
    let value;
    let dirty = true;
    const runner = effect(
      () => {
        value = getter();
        dirty = false;
      },
      () => {
        dirty = true;
        trigger(dep);
      }
    );
    return {
      __isRef: true,
      get value() {
        track(dep);
        if (dirty) runner.run();
        return value;
      }
    };
  }
  function watch(source, callback) {
    const getter = typeof source === "function" ? source : () => source.value;
    let oldValue;
    let initialized = false;
    const runner = effect(() => {
      const value = getter();
      if (!initialized) {
        initialized = true;
        oldValue = value;
        return;
      }
      const previous = oldValue;
      oldValue = value;
      callback(value, previous);
    });
    return () => runner.stop();
  }

  // src/runtime.js
  var Fragment = Symbol("Fragment");
  var TEXT = null;
  function isComponentType(type) {
    return Boolean(type) && (type.__nuiComponent === true || typeof type === "function");
  }
  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function wrapText(value) {
    return { type: TEXT, text: String(value), props: null, children: [], key: null, els: [] };
  }
  function normalizeVNode(input) {
    if (input === null || input === void 0 || typeof input === "boolean") return wrapText("");
    if (Array.isArray(input)) {
      return { type: Fragment, props: null, children: flattenChildren([input]), key: null, els: [] };
    }
    if (typeof input === "string" || typeof input === "number") return wrapText(input);
    return input;
  }
  function flattenChildren(input, out = []) {
    for (const child of input) {
      if (Array.isArray(child)) flattenChildren(child, out);
      else if (child === null || child === void 0 || typeof child === "boolean") continue;
      else if (typeof child === "string" || typeof child === "number") out.push(wrapText(child));
      else out.push(child);
    }
    return out;
  }
  function h(type, props, ...children) {
    let rawProps = props;
    if (rawProps && !isObject(rawProps)) {
      children.unshift(rawProps);
      rawProps = null;
    }
    rawProps = rawProps || {};
    const cleanProps = {};
    for (const name2 in rawProps) {
      if (name2 === "key" || name2 === "children") continue;
      cleanProps[name2] = rawProps[name2];
    }
    const kids = flattenChildren(children);
    if (kids.length === 0 && rawProps.children != null) {
      flattenChildren([rawProps.children], kids);
    }
    return {
      type,
      props: cleanProps,
      children: kids,
      key: rawProps.key != null ? rawProps.key : null,
      els: []
    };
  }
  function collectEls(children) {
    const els = [];
    for (const child of children) {
      for (const el of child.els) els.push(el);
    }
    return els;
  }
  function moveBefore(parent, vnode, reference) {
    for (const el of vnode.els) {
      if (el.parentNode !== parent || el === reference) continue;
      parent.insertBefore(el, reference);
    }
  }
  function patch(oldVNode, vnode, parent, anchor) {
    if (!oldVNode) {
      mount(vnode, parent, anchor);
      return;
    }
    if (oldVNode.type !== vnode.type || oldVNode.key !== vnode.key) {
      const reference = oldVNode.els.length ? oldVNode.els[0] : anchor;
      unmount(oldVNode, parent);
      mount(vnode, parent, reference);
      return;
    }
    if (vnode.type === TEXT) {
      vnode.els = oldVNode.els;
      if (oldVNode.text !== vnode.text) oldVNode.els[0].nodeValue = vnode.text;
      return;
    }
    if (vnode.type === Fragment) {
      patchChildren(parent, oldVNode.children, vnode.children, anchor);
      vnode.els = collectEls(vnode.children);
      return;
    }
    if (isComponentType(vnode.type)) {
      patchComponent(oldVNode, vnode, parent, anchor);
      return;
    }
    vnode.el = oldVNode.el;
    vnode.els = [vnode.el];
    applyProps(vnode.el, oldVNode.props, vnode.props);
    patchChildren(vnode.el, oldVNode.children, vnode.children, null);
  }
  function patchChildren(parent, oldChildren, newChildren, anchor) {
    const keyed = /* @__PURE__ */ new Map();
    const unkeyed = [];
    for (const child of oldChildren) {
      if (child.key != null) keyed.set(child.key, child);
      else unkeyed.push(child);
    }
    const matched = new Array(newChildren.length).fill(null);
    const used = /* @__PURE__ */ new Set();
    for (let i = 0; i < newChildren.length; i++) {
      const next = newChildren[i];
      let previous = null;
      if (next.key != null) previous = keyed.get(next.key) || null;
      else {
        const candidate = unkeyed[i];
        if (candidate && !used.has(candidate)) previous = candidate;
      }
      if (previous) {
        used.add(previous);
        matched[i] = previous;
      }
    }
    let reference = anchor;
    for (let i = newChildren.length - 1; i >= 0; i--) {
      const next = newChildren[i];
      const previous = matched[i];
      if (previous) {
        patch(previous, next, parent, reference);
        moveBefore(parent, next, reference);
      } else {
        mount(next, parent, reference);
      }
      reference = next.els.length ? next.els[0] : reference;
    }
    for (const child of oldChildren) {
      if (!used.has(child)) unmount(child, parent);
    }
  }
  function unmount(vnode, parent) {
    if (!vnode) return;
    if (vnode.type === Fragment) {
      for (const child of vnode.children) unmount(child, parent);
      return;
    }
    if (isComponentType(vnode.type)) {
      unmountComponent(vnode, parent);
      return;
    }
    for (const el of vnode.els) {
      if (el.parentNode === parent) parent.removeChild(el);
    }
  }
  function mount(vnode, parent, anchor) {
    const type = vnode.type;
    if (type === TEXT) {
      const node = document.createTextNode(vnode.text);
      parent.insertBefore(node, anchor);
      vnode.els = [node];
      return;
    }
    if (type === Fragment) {
      for (const child of vnode.children) mount(child, parent, anchor);
      vnode.els = collectEls(vnode.children);
      return;
    }
    if (isComponentType(type)) {
      mountComponent(vnode, parent, anchor);
      return;
    }
    const el = document.createElement(type);
    vnode.el = el;
    vnode.els = [el];
    parent.insertBefore(el, anchor);
    applyProps(el, null, vnode.props);
    for (const child of vnode.children) mount(child, el, null);
  }
  var ROOT = Symbol("nui-root");
  function defineComponent(options) {
    return { __nuiComponent: true, name: "Component", ...options };
  }
  function renderFunctionFor(options, instance) {
    if (typeof options === "function") return () => options(instance.props, instance);
    if (typeof options.render === "function") return () => options.render(instance);
    return () => null;
  }
  function syncProps(instance, props) {
    const target = instance.props;
    for (const name2 in props) target[name2] = props[name2];
    for (const name2 in target) {
      if (!(name2 in props)) delete target[name2];
    }
  }
  function scheduleUpdate(instance) {
    if (instance.scheduled) return;
    instance.scheduled = true;
    queueMicrotask(() => {
      instance.scheduled = false;
      if (instance.mounted) updateInstance(instance);
    });
  }
  function makeInstance(options, vnode, parent, anchor) {
    const instance = {
      name: options.name || "Component",
      options,
      props: {},
      children: vnode.children,
      parent,
      anchor,
      mounted: false,
      scheduled: false,
      subtree: null,
      nextSubtree: null,
      vnode,
      effect: null
    };
    syncProps(instance, vnode.props);
    if (typeof options.setup === "function") {
      const state = options.setup(instance.props, instance);
      if (isObject(state)) Object.assign(instance, state);
    }
    const run = renderFunctionFor(options, instance);
    instance.effect = effect(
      () => {
        instance.nextSubtree = normalizeVNode(run());
      },
      () => scheduleUpdate(instance)
    );
    return instance;
  }
  function updateInstance(instance) {
    const previous = instance.subtree;
    instance.effect.run();
    const next = instance.nextSubtree;
    patch(previous, next, instance.parent, instance.anchor);
    instance.subtree = next;
    if (instance.vnode) instance.vnode.els = next.els;
    if (instance.mounted && typeof instance.options.onUpdate === "function") {
      instance.options.onUpdate(instance);
    }
  }
  function mountComponent(vnode, parent, anchor) {
    const options = isObject(vnode.type) && vnode.type.__nuiComponent ? vnode.type : { render: vnode.type };
    const instance = makeInstance(options, vnode, parent, anchor);
    vnode.component = instance;
    instance.subtree = instance.nextSubtree;
    mount(instance.subtree, parent, anchor);
    vnode.els = instance.subtree.els;
    instance.mounted = true;
    if (typeof options.onMount === "function") options.onMount(instance);
  }
  function patchComponent(oldVNode, vnode, parent, anchor) {
    const instance = oldVNode.component;
    vnode.component = instance;
    instance.vnode = vnode;
    instance.parent = parent;
    instance.anchor = anchor;
    instance.children = vnode.children;
    syncProps(instance, vnode.props);
    updateInstance(instance);
    vnode.els = instance.subtree.els;
  }
  function unmountComponent(vnode, parent) {
    const instance = vnode.component;
    if (!instance) return;
    instance.mounted = false;
    instance.effect.stop();
    if (typeof instance.options.onUnmount === "function") instance.options.onUnmount(instance);
    unmount(instance.subtree, parent);
  }
  function render(vnode, container) {
    const previous = container[ROOT];
    const next = normalizeVNode(vnode);
    if (previous) patch(previous, next, container, null);
    else mount(next, container, null);
    container[ROOT] = next;
    return next;
  }
  function createApp(rootComponent, rootProps = {}) {
    let container = null;
    let root = null;
    return {
      mount(target) {
        container = target;
        if (container.classList) container.classList.add("nui-root");
        root = render(h(rootComponent, rootProps), container);
        return root.component || null;
      },
      unmount() {
        if (root && container) {
          unmount(root, container);
          container[ROOT] = null;
        }
        root = null;
      }
    };
  }
  function classString(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(classString).filter(Boolean).join(" ");
    if (isObject(value)) {
      return Object.keys(value).filter((name2) => value[name2]).join(" ");
    }
    return String(value);
  }
  function setStyle(el, style) {
    el.removeAttribute("style");
    if (typeof style === "string") {
      el.setAttribute("style", style);
      return;
    }
    if (!isObject(style)) return;
    for (const name2 in style) {
      const value = style[name2];
      if (value == null) continue;
      const cssName = name2.startsWith("--") ? name2 : name2.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      el.style.setProperty(cssName, value);
    }
  }
  var BOOLEAN_PROPS = /* @__PURE__ */ new Set(["checked", "disabled", "selected", "readOnly", "multiple", "hidden"]);
  function setEvent(el, name2, handler) {
    const type = name2.slice(2).toLowerCase();
    el._nuiEvents = el._nuiEvents || {};
    const previous = el._nuiEvents[type];
    if (previous) el.removeEventListener(type, previous);
    if (handler) {
      el.addEventListener(type, handler);
      el._nuiEvents[type] = handler;
    } else {
      delete el._nuiEvents[type];
    }
  }
  function setProp(el, name2, next) {
    if (name2 === "ref") return;
    if (name2 === "class" || name2 === "className") {
      el.className = classString(next);
      return;
    }
    if (name2 === "style") {
      setStyle(el, next);
      return;
    }
    if (/^on[A-Z]/.test(name2)) {
      setEvent(el, name2, next);
      return;
    }
    if (name2 === "value") {
      const value = next == null ? "" : next;
      if (el.value !== value) el.value = value;
      return;
    }
    if (BOOLEAN_PROPS.has(name2)) {
      el[name2] = Boolean(next);
      if (next) el.setAttribute(name2, "");
      else el.removeAttribute(name2);
      return;
    }
    if (next == null || next === false) {
      el.removeAttribute(name2);
      return;
    }
    el.setAttribute(name2, next === true ? "" : String(next));
  }
  function removeProp(el, name2) {
    if (name2 === "class" || name2 === "className") {
      el.className = "";
      return;
    }
    if (name2 === "style") {
      el.removeAttribute("style");
      return;
    }
    if (/^on[A-Z]/.test(name2)) {
      setEvent(el, name2, null);
      return;
    }
    if (name2 === "value") {
      el.value = "";
      return;
    }
    if (BOOLEAN_PROPS.has(name2)) {
      el[name2] = false;
      el.removeAttribute(name2);
      return;
    }
    el.removeAttribute(name2);
  }
  function applyProps(el, oldProps, newProps) {
    const previous = oldProps || {};
    for (const name2 in previous) {
      if (!(name2 in newProps)) removeProp(el, name2);
    }
    for (const name2 in newProps) {
      if (previous[name2] !== newProps[name2]) setProp(el, name2, newProps[name2]);
    }
  }

  // src/config.js
  var THEMES = ["auto", "light", "dark"];
  var DEFAULTS = Object.freeze({
    theme: "auto",
    accent: "",
    features: Object.freeze({}),
    locale: "",
    fallbackLocale: "ja",
    messages: Object.freeze({}),
    styleUrl: ""
  });
  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function normalizeFeatures(value) {
    const features = {};
    if (!isPlainObject(value)) return features;
    for (const [key, entry] of Object.entries(value)) {
      features[key] = entry !== false;
    }
    return features;
  }
  function normalizeMessages(value) {
    if (!isPlainObject(value)) return {};
    const messages = {};
    for (const [locale, dict] of Object.entries(value)) {
      if (isPlainObject(dict)) messages[locale] = dict;
    }
    return messages;
  }
  function normalizeLocale(value, fallback) {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }
  function createDefaultConfig() {
    return {
      theme: DEFAULTS.theme,
      accent: DEFAULTS.accent,
      features: {},
      locale: DEFAULTS.locale,
      fallbackLocale: DEFAULTS.fallbackLocale,
      messages: {},
      styleUrl: DEFAULTS.styleUrl
    };
  }
  function mergeConfig(current, options) {
    const source = isPlainObject(options) ? options : {};
    return {
      theme: THEMES.includes(source.theme) ? source.theme : current.theme,
      accent: typeof source.accent === "string" ? source.accent.trim() : current.accent,
      features: { ...current.features, ...normalizeFeatures(source.features) },
      locale: source.locale === void 0 ? current.locale : normalizeLocale(source.locale, ""),
      fallbackLocale: normalizeLocale(source.fallbackLocale, current.fallbackLocale),
      messages: isPlainObject(source.messages) ? { ...current.messages, ...normalizeMessages(source.messages) } : current.messages,
      styleUrl: typeof source.styleUrl === "string" ? source.styleUrl.trim() : current.styleUrl
    };
  }
  var config = null;
  var listeners = /* @__PURE__ */ new Set();
  function getConfig() {
    if (!config) config = createDefaultConfig();
    return config;
  }
  function onConfigChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function notify() {
    const active = getConfig();
    for (const listener of listeners) listener(active);
  }
  function applyTheme() {
    if (typeof document === "undefined") return;
    const active = getConfig();
    const root = document.documentElement;
    root.dataset.nuiTheme = active.theme;
    if (active.accent) root.style.setProperty("--nui-accent", active.accent);
    else root.style.removeProperty("--nui-accent");
  }
  function configure(options = {}) {
    config = mergeConfig(getConfig(), options);
    applyTheme();
    notify();
    return config;
  }
  function resetConfig() {
    config = createDefaultConfig();
    applyTheme();
    notify();
    return config;
  }

  // src/i18n.js
  var DEFAULT_MESSAGES = {
    ja: { common: { close: "\u9589\u3058\u308B" } },
    en: { common: { close: "Close" } }
  };
  var localeRef = ref(null);
  var store = {};
  function isObject2(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function deepMerge(target, source) {
    for (const [key, value] of Object.entries(source)) {
      if (isObject2(value)) {
        if (!isObject2(target[key])) target[key] = {};
        deepMerge(target[key], value);
      } else {
        target[key] = value;
      }
    }
    return target;
  }
  function detectLocale() {
    if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
    return null;
  }
  function getLocale() {
    return localeRef.value || detectLocale() || getConfig().fallbackLocale;
  }
  function setLocale(locale) {
    localeRef.value = locale || null;
  }
  function localeChain(locale) {
    const chain = [];
    const add = (value) => {
      if (value && !chain.includes(value)) chain.push(value);
    };
    add(locale);
    if (locale && locale.includes("-")) add(locale.split("-")[0]);
    add(getConfig().fallbackLocale);
    return chain;
  }
  function lookup(dictionary, key) {
    if (!isObject2(dictionary)) return void 0;
    if (Object.prototype.hasOwnProperty.call(dictionary, key)) {
      const value = dictionary[key];
      return isObject2(value) ? void 0 : value;
    }
    let current = dictionary;
    for (const part of key.split(".")) {
      if (isObject2(current) && Object.prototype.hasOwnProperty.call(current, part)) current = current[part];
      else return void 0;
    }
    return isObject2(current) ? void 0 : current;
  }
  function interpolate(text, params) {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name2) => Object.prototype.hasOwnProperty.call(params, name2) ? String(params[name2]) : match);
  }
  function t(key, params) {
    const locale = localeRef.value || detectLocale() || getConfig().fallbackLocale;
    for (const name2 of localeChain(locale)) {
      const value = lookup(store[name2], key);
      if (value != null) return interpolate(String(value), params);
    }
    return key;
  }
  function addMessages(locale, dictionary) {
    if (!locale || !isObject2(dictionary)) return;
    store[locale] = deepMerge(store[locale] || {}, dictionary);
  }
  function setMessages(messages) {
    for (const locale of Object.keys(store)) delete store[locale];
    deepMerge(store, DEFAULT_MESSAGES);
    if (isObject2(messages)) {
      for (const [locale, dictionary] of Object.entries(messages)) addMessages(locale, dictionary);
    }
  }
  function translateNodes(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    for (const el of root.querySelectorAll("[data-i18n]")) {
      const key = el.getAttribute("data-i18n");
      if (!key) continue;
      const text = t(key);
      const attribute = el.getAttribute("data-i18n-attr");
      if (attribute) el.setAttribute(attribute, text);
      else el.textContent = text;
    }
  }
  function useI18n() {
    return { t, locale: localeRef, setLocale, getLocale };
  }
  function applyConfig() {
    const config2 = getConfig();
    if (isObject2(config2.messages)) {
      for (const [locale, dictionary] of Object.entries(config2.messages)) addMessages(locale, dictionary);
    }
    if (config2.locale) localeRef.value = config2.locale;
  }
  setMessages(null);
  onConfigChange(applyConfig);
  applyConfig();

  // src/enhance.js
  var CLASS_BY_KIND = Object.freeze({
    page: "nui-page",
    "page-heading": "nui-page-heading",
    section: "nui-section",
    card: "nui-card",
    cover: "nui-cover",
    list: "nui-list",
    "list-item": "nui-list-item",
    nav: "nui-nav",
    "nav-item": "nui-nav-item",
    split: "nui-split",
    toolbar: "nui-toolbar",
    tabs: "nui-tabs",
    form: "nui-form",
    field: "nui-field",
    heading: "nui-heading",
    badge: "nui-badge",
    avatar: "nui-avatar",
    icon: "nui-icon",
    button: "nui-button",
    "button-secondary": "nui-button-secondary",
    "button-danger": "nui-button-danger",
    "empty-text": "nui-empty-text"
  });
  function classForKind(kind) {
    return CLASS_BY_KIND[kind] || "";
  }
  var SELECTOR = "[data-nui], [data-nui-feature]";
  function addClass(element, name2) {
    if (name2 && !element.classList.contains(name2)) element.classList.add(name2);
  }
  function applyFeature(element) {
    const name2 = element.dataset.nuiFeature;
    const features = getConfig().features || {};
    element.hidden = features[name2] === false;
  }
  function upgradeElement(element) {
    if (!element || element.nodeType !== 1) return false;
    let upgraded = false;
    const kind = element.dataset.nui;
    if (kind && CLASS_BY_KIND[kind]) {
      const before = element.className;
      addClass(element, CLASS_BY_KIND[kind]);
      if (element.className !== before) upgraded = true;
    }
    if (element.hasAttribute("data-nui-feature")) {
      applyFeature(element);
      upgraded = true;
    }
    return upgraded;
  }
  function enhance(root) {
    if (typeof document === "undefined") return 0;
    const scope = root || document;
    let count = 0;
    for (const element of scope.querySelectorAll(SELECTOR)) {
      if (upgradeElement(element)) count += 1;
    }
    if (scope.nodeType === 1 && upgradeElement(scope)) count += 1;
    return count;
  }
  var observer = null;
  var started = false;
  function refreshFeatures() {
    if (typeof document === "undefined") return;
    for (const element of document.querySelectorAll("[data-nui-feature]")) applyFeature(element);
  }
  function start(root) {
    if (typeof document === "undefined" || started) return;
    started = true;
    const runEnhance = () => enhance(document);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", runEnhance, { once: true });
    } else {
      runEnhance();
    }
    const target = root || document.body || document.documentElement;
    if (typeof MutationObserver !== "undefined" && target) {
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "attributes") {
            upgradeElement(mutation.target);
            continue;
          }
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.matches?.(SELECTOR)) upgradeElement(node);
            enhance(node);
          }
        }
      });
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-nui", "data-nui-feature"]
      });
    }
    onConfigChange(refreshFeatures);
  }
  function stop() {
    if (observer) observer.disconnect();
    observer = null;
    started = false;
  }

  // src/components.js
  var components_exports = {};
  __export(components_exports, {
    Button: () => Button,
    Card: () => Card,
    Input: () => Input,
    Modal: () => Modal,
    Tabs: () => Tabs,
    Toggle: () => Toggle
  });
  var Button = defineComponent({
    name: "NuiButton",
    render(ctx) {
      const props = ctx.props;
      const variant = props.variant || "primary";
      const className = variant === "secondary" ? "nui-button-secondary" : variant === "danger" ? "nui-button-danger" : "nui-button";
      return h("button", {
        type: props.type || "button",
        class: [className, props.class],
        disabled: props.disabled,
        onClick: props.onClick
      }, ctx.children.length ? ctx.children : props.label != null ? props.label : "");
    }
  });
  var Input = defineComponent({
    name: "NuiInput",
    render(ctx) {
      const props = ctx.props;
      return h("input", {
        class: ["nui-input", props.class],
        type: props.type || "text",
        name: props.name,
        value: props.value,
        placeholder: props.placeholder,
        disabled: props.disabled,
        onInput: props.onInput,
        onChange: props.onChange
      });
    }
  });
  var Card = defineComponent({
    name: "NuiCard",
    render(ctx) {
      const props = ctx.props;
      return h("div", {
        class: ["nui-card", props.interactive && "is-interactive", props.danger && "nui-danger-card", props.class]
      }, ctx.children);
    }
  });
  var Modal = defineComponent({
    name: "NuiModal",
    render(ctx) {
      const props = ctx.props;
      if (!props.open) return null;
      const close = props.onClose;
      return h("div", {
        class: ["nui-modal-backdrop", props.class],
        onClick: (event) => {
          if (close && event.target === event.currentTarget) close();
        }
      }, h(
        "div",
        { class: "nui-modal", role: "dialog", "aria-modal": "true" },
        props.title != null ? h("h3", { class: "nui-modal-title" }, props.title) : null,
        h("div", { class: "nui-modal-body" }, ctx.children),
        close ? h("button", {
          type: "button",
          class: "nui-button-secondary",
          onClick: close
        }, props.closeLabel != null ? props.closeLabel : t("common.close")) : null
      ));
    }
  });
  var Tabs = defineComponent({
    name: "NuiTabs",
    render(ctx) {
      const props = ctx.props;
      const tabs = props.tabs || [];
      const active = props.active != null ? props.active : tabs[0] && tabs[0].key;
      return h(
        "div",
        { class: ["nui-tabs", props.class], role: "tablist" },
        tabs.map((tab) => h("button", {
          key: tab.key,
          type: "button",
          role: "tab",
          class: ["nui-tab", active === tab.key && "is-active"],
          "aria-selected": active === tab.key ? "true" : "false",
          onClick: () => props.onSelect && props.onSelect(tab.key)
        }, tab.label))
      );
    }
  });
  var Toggle = defineComponent({
    name: "NuiToggle",
    render(ctx) {
      const props = ctx.props;
      return h(
        "label",
        { class: ["nui-toggle", props.disabled && "is-disabled", props.class] },
        h("input", {
          type: "checkbox",
          class: "nui-toggle-input",
          checked: props.checked,
          disabled: props.disabled,
          onChange: (event) => props.onChange && props.onChange(event.target.checked)
        }),
        h("span", { class: "nui-toggle-track" }, h("span", { class: "nui-toggle-thumb" })),
        props.label != null ? h("span", { class: "nui-toggle-label" }, props.label) : null
      );
    }
  });

  // src/version.js
  var name = "nyaitter-ui";
  var version = "0.2.0";
  var description = "\u4F9D\u5B58\u306A\u3057\u306E\u5C0F\u3055\u306A UI \u30D5\u30EC\u30FC\u30E0\u30EF\u30FC\u30AF\uFF08\u30B3\u30F3\u30DD\u30FC\u30CD\u30F3\u30C8 + \u7FFB\u8A33\u3064\u304D\uFF09";
  var repository = "https://github.com/Nyaitter/NyaitterUI";

  // src/index.js
  function resolveStyleUrl(url) {
    if (url) return url;
    const configured = getConfig().styleUrl;
    if (configured) return configured;
    const script = typeof document !== "undefined" ? document.currentScript : null;
    if (script && script.src) return script.src.replace(/\.js(?=$|[?#])/, ".css");
    return "";
  }
  function injectStyles(url) {
    if (typeof document === "undefined") return null;
    const href = resolveStyleUrl(url);
    if (!href) return null;
    const existing = document.querySelector("link[data-nui-styles]");
    if (existing) {
      if (url) existing.href = href;
      return existing;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-nui-styles", "");
    document.head.append(link);
    return link;
  }
  var NyaitterUI = Object.freeze({
    name,
    version,
    description,
    repository,
    h,
    Fragment,
    render,
    defineComponent,
    createApp,
    ref,
    computed,
    effect,
    watch,
    t,
    useI18n,
    setLocale,
    getLocale,
    addMessages,
    setMessages,
    translateNodes,
    configure,
    getConfig,
    resetConfig,
    injectStyles,
    enhance,
    upgradeElement,
    classForKind,
    start,
    stop,
    components: components_exports
  });
  if (typeof globalThis !== "undefined") globalThis.NyaitterUI = NyaitterUI;
  if (typeof document !== "undefined") start();
  var index_default = NyaitterUI;
  return __toCommonJS(index_exports);
})();
