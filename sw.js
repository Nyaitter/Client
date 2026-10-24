const STATIC_ASSET_PATTERN = /\.(?:html|css|js|mjs|json|webmanifest|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf)$/i;
importScripts('./config.js');

const { apiUrl } = self.NyaitterClientConfig;
// configReady解決前は未設定。fetchハンドラはnullを許容する。
let apiEndpointPath = null;
let userFileEndpointPath = null;
const configReady = self.NyaitterClientConfig.ready.then(() => {
  apiEndpointPath = getSameOriginEndpointPath(apiUrl('/'));
  userFileEndpointPath = getSameOriginEndpointPath(self.NyaitterClientConfig.userFileEndpoint || '');
});

// bootstrap.js と同じ規則で nyaitter.js の読み込み先を決める。
// URL が指定されていればそれを、そうでなければ nyaitter_js (既定 latest) を
// jsDelivr のバージョンとして使う。
function resolveNyaitterJsUrl(value) {
  const source = String(value || '').trim();
  if (/^(?:https?:)?\/\//i.test(source)) return source;
  const version = source || 'latest';
  return `https://cdn.jsdelivr.net/npm/nyaitter.js@${encodeURIComponent(version)}/dist/nyaitter.js`;
}

// configReady 解決後に Nyaitter.js SDK を importScripts で読み込み、
// NyaitterClient を遅延生成して使い回す。既に読み込み済みなら再ロードしない。
let sdkClientPromise;
function getSdkClient() {
  if (!sdkClientPromise) {
    sdkClientPromise = (async () => {
      await configReady;
      if (!globalThis.Nyaitter?.NyaitterClient) {
        importScripts(resolveNyaitterJsUrl(self.NyaitterClientConfig.nyaitterJs));
      }
      const NyaitterClient = globalThis.Nyaitter?.NyaitterClient;
      if (!NyaitterClient) throw new Error('Nyaitter.js SDK の読み込みに失敗しました。');
      // 解決済みの API エンドポイントから SDK の baseUrl を組み立てる。
      const endpoint = new URL(self.NyaitterClientConfig.apiEndpoint, self.location.href);
      const baseUrl = `${endpoint.origin}${endpoint.pathname.replace(/\/+$/, '')}`;
      return new NyaitterClient({ baseUrl });
    })();
    // 失敗した Promise を握り続けず、次回の呼び出しで再試行できるようにする。
    sdkClientPromise.catch(() => {
      sdkClientPromise = null;
    });
  }
  return sdkClientPromise;
}

const CACHE_NAME = 'nyaitter-client';
const REVALIDATE_INTERVAL = 30_000;
let cachePromise;
const pendingFetches = new Map();
const revalidatedAt = new Map();

function openAssetCache() {
  if (!cachePromise) {
    cachePromise = caches.open(CACHE_NAME).catch(() => {
      cachePromise = null;
      return null;
    });
  }
  return cachePromise;
}

function fetchAsset(request, cacheKey, event) {
  const key = request.url;
  let pending = pendingFetches.get(key);
  if (!pending) {
    pending = fetch(request).then((response) => {
      if (isCacheableStaticResponse(response)) {
        const copy = response.clone();
        // Cache storage errors must not discard a successful network response.
        event.waitUntil(openAssetCache().then((cache) => cache?.put(cacheKey, copy)).catch(() => {}));
        if (revalidatedAt.size >= 256) revalidatedAt.delete(revalidatedAt.keys().next().value);
        revalidatedAt.set(key, Date.now());
      }
      return response;
    }).finally(() => pendingFetches.delete(key));
    pendingFetches.set(key, pending);
  }
  return pending.then((response) => response.clone());
}

function getSameOriginEndpointPath(value) {
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return null;
    const path = url.pathname.replace(/\/+$/, '');
    return path || '/';
  } catch (_) {
    return null;
  }
}

function matchesEndpointPath(url, endpointPath) {
  if (!endpointPath || endpointPath === '/') return false;
  return url.pathname === endpointPath || url.pathname.startsWith(`${endpointPath}/`);
}

// 配信ベース配下 (任意のリバースプロキシ接頭辞) でもパス接頭辞を保つよう、APP_SHELL は
// ルート直下絶対パスではなく SW スクリプト (self.location) 基準の相対で解決する。
const APP_SHELL_PATHS = [
  './',
  'index.html',
  'style.css',
  'config.js',
  'manifest.json',
  'js/main.js',
  'js/app.js',
  'js/state.js',
  'js/api.js',
  'js/dom.js',
  'js/icons.js',
  'manifest.webmanifest',
  'favicon.png',
  'pwa-icon-192.png',
  'pwa-icon-512.png',
];

const APP_SHELL = APP_SHELL_PATHS.map((path) => new URL(path, self.location.href).href);
// ナビゲーション要求のキャッシュキーも APP_SHELL の index.html と一致させる。
const INDEX_CACHE_KEY = new URL('index.html', self.location.href).href;

function base64UrlToUint8Array(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

function getSafeNotificationUrl(value) {
  try {
    const url = new URL(value || '#notifications', self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL('#notifications', self.location.origin).href;
  } catch (_) {
    return new URL('#notifications', self.location.origin).href;
  }
}

function getPushFallbackIconUrl() {
  return new URL('emoji/neko.svg', self.registration.scope || self.location.href).href;
}

function getPushBadgeUrl() {
  return new URL('pwa-icon-192.png', self.registration.scope || self.location.href).href;
}

function getSafePushIconUrl(value) {
  try {
    const url = new URL(value || getPushFallbackIconUrl(), self.location.origin);
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const isSafeHttp = url.protocol === 'https:' || url.origin === self.location.origin;
    return isHttp && isSafeHttp ? url.href : getPushFallbackIconUrl();
  } catch (_) {
    return getPushFallbackIconUrl();
  }
}

async function resolvePushIconUrl(value) {
  return getSafePushIconUrl(value);
}

function parsePushIdentifier(value, minimum) {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    String(value).trim() === ''
  )
    return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : null;
}

function getPushOpenUrl(value, userId, notificationId) {
  const url = new URL(getSafeNotificationUrl(value));
  const parsedUserId = parsePushIdentifier(userId, 0);
  const parsedNotificationId = parsePushIdentifier(notificationId, 1);
  if (parsedUserId !== null && parsedNotificationId !== null) {
    // URLはアプリ起動後ただちにHistory APIで消去される一時的な引き継ぎ情報。
    url.searchParams.set('push_user_id', String(parsedUserId));
    url.searchParams.set('push_notification_id', String(parsedNotificationId));
  }
  return url.href;
}

function isCacheableStaticResponse(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  const cacheControl = response.headers.get('Cache-Control') || '';
  return !/\bno-store\b/i.test(cacheControl) && !response.headers.has('Set-Cookie');
}

const CLIENT_MANIFEST_URL = new URL('manifest.json', self.location.href).href;

async function readCachedClientVersion() {
  try {
    const cache = await openAssetCache();
    const response = cache && await cache.match(CLIENT_MANIFEST_URL);
    if (!response) return '';
    const manifest = await response.json();
    return String(manifest?.client_version || '').trim();
  } catch (_) {
    return '';
  }
}

// SW 内からの fetch は自身の fetch ハンドラを通らないため、キャッシュに
// 邪魔されずサーバー上のマニフェストを直接読める。
async function readNetworkClientVersion() {
  try {
    const response = await fetch(CLIENT_MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) return '';
    const manifest = await response.json();
    return String(manifest?.client_version || '').trim();
  } catch (_) {
    return '';
  }
}

async function cacheAppShell() {
  const cache = await openAssetCache();
  if (!cache) return;
  await Promise.allSettled(APP_SHELL.map(async (path) => {
    const response = await fetch(path, { cache: 'reload' });
    if (isCacheableStaticResponse(response)) await cache.put(path, response);
  }));
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];
  if (data.type === 'nyaitter:client-version') {
    event.waitUntil((async () => {
      const version = await readCachedClientVersion();
      port?.postMessage({ version });
    })());
    return;
  }
  if (data.type === 'nyaitter:client-latest') {
    event.waitUntil((async () => {
      const version = await readNetworkClientVersion();
      port?.postMessage({ version });
    })());
    return;
  }
  if (data.type === 'nyaitter:client-update') {
    event.waitUntil((async () => {
      let ok = true;
      try {
        await caches.delete(CACHE_NAME);
        cachePromise = null;
        await cacheAppShell();
        await self.skipWaiting();
      } catch (_) {
        ok = false;
      }
      port?.postMessage({ ok });
    })());
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // 版名ではなく、更新のたびにキャッシュを破棄して作り直す。
    // 古いHTML/CSS/JSが混在して画面が崩れるのを防ぐ。
    // CacheStorage が使えない/拒否/容量不足で delete が reject しても、
    // 古い SW に固定されないよう install を失敗させてはならない。
    try {
      await caches.delete(CACHE_NAME);
      // 破棄できたときだけハンドルを捨て、次回 openAssetCache で作り直す。
      // (削除に失敗した場合は既存キャッシュが有効なためハンドルを保持する)
      cachePromise = null;
    } catch (_) {
      // パージ失敗を握りつぶし、activation を妨げない。
    }

    // 再キャッシュは allSettled で個別失敗を吸収済み。想定外の throw もここで吸収する。
    try {
      const cache = await openAssetCache();
      if (cache) {
        await Promise.allSettled(APP_SHELL.map(async (path) => {
          const response = await fetch(path);
          if (isCacheableStaticResponse(response)) await cache.put(path, response);
        }));
      }
    } catch (_) {
      // 再キャッシュ失敗でも activation は妨げない。
    }

    // パージ/再キャッシュの成否に関わらず、必ず skipWaiting を試みる。
    try {
      await self.skipWaiting();
    } catch (_) {
      // skipWaiting 自体の失敗で install を reject させない。
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => (key === 'nyaitter-client' || key.startsWith('nyaitter-client-')) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .catch(() => {})
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    matchesEndpointPath(url, apiEndpointPath) ||
    matchesEndpointPath(url, userFileEndpointPath)
  ) {
    return;
  }

  const isStaticAsset = STATIC_ASSET_PATTERN.test(url.pathname);
  if (request.mode === 'navigate' || isStaticAsset) {
    const cacheKey = request.mode === 'navigate' ? INDEX_CACHE_KEY : request;
    event.respondWith(
      openAssetCache().then((cache) => cache?.match(cacheKey)).catch(() => null).then((cachedResponse) => {
        if (cachedResponse) {
          if (Date.now() - (revalidatedAt.get(request.url) || 0) >= REVALIDATE_INTERVAL) {
            event.waitUntil(fetchAsset(request, cacheKey, event).catch(() => {}));
          }
          return cachedResponse;
        }
        return fetchAsset(request, cacheKey, event).catch(() =>
          new Response('Network unavailable', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
      }),
    );
    return;
  }

  // APIや任意のGETリクエストをキャッシュしない。静的アセット以外は通常のネットワーク要求として処理する。
  // apiEndpoint が / の場合でも、動的レスポンスをService Workerのキャッシュへ混入させない。
  return;
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil((async () => {
    const title = String(payload.title || 'Nyaitter').slice(0, 80);
    const iconUrl = await resolvePushIconUrl(payload.icon);
    const options = {
      body: String(payload.body || '').slice(0, 240),
      icon: iconUrl,
      badge: getPushBadgeUrl(),
      tag: String(payload.tag || 'nyaitter-notification').slice(0, 64),
      renotify: false,
      data: {
        url: getSafeNotificationUrl(payload.url),
        userId: payload.user_id || null,
        notificationId: payload.notification_id || null,
      },
    };

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notificationId = parsePushIdentifier(event.notification.data?.notificationId, 1);
  const targetUrl = getPushOpenUrl(
    event.notification.data?.url,
    event.notification.data?.userId,
    notificationId,
  );

  event.waitUntil((async () => {
    // 通知クリック時に自動でその通知を既読(clicked)にする
    if (notificationId) {
      try {
        const client = await getSdkClient();
        await client.notifications.markAsClicked(notificationId);
      } catch (_) {
        // オフラインまたはエラー時はアプリ起動側の処理へフォールバック
      }
    }

    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      if ('navigate' in existing) await existing.navigate(targetUrl);
      return existing.focus();
    }
    return clients.openWindow(targetUrl);
  })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const client = await getSdkClient();
      let subscription = event.newSubscription;
      if (!subscription) {
        const config = await client.push.getConfig();
        if (!config.enabled || !config.vapid_public_key) return;
        subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(config.vapid_public_key),
        });
      }

      await client.push.subscribe({ subscription });
    } catch (_) {
      // A later settings-page visit will reconcile the subscription if this background update fails.
    }
  })());
});
