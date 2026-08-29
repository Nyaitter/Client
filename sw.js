const STATIC_ASSET_PATTERN = /\.(?:html|css|js|mjs|json|webmanifest|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf)$/i;
importScripts('./config.js');

const { apiUrl } = self.NyaitterClientConfig;
let apiEndpointPath = getSameOriginEndpointPath(apiUrl('/'));
let userFileEndpointPath = null;
let nyaitterClient = null;

function getNyaitterJsUrl(value) {
  const source = String(value || '').trim();
  if (/^(?:https?:)?\/\//i.test(source)) return source;
  return `https://cdn.jsdelivr.net/npm/nyaitter.js@${encodeURIComponent(source || 'latest')}/dist/nyaitter.js`;
}

const nyaitterClientReady = self.NyaitterClientConfig.ready.then(() => {
  importScripts(getNyaitterJsUrl(self.NyaitterClientConfig.nyaitterJs));
  const endpoint = new URL(self.NyaitterClientConfig.apiEndpoint, self.location.href);
  nyaitterClient = new self.Nyaitter.NyaitterClient({
    baseUrl: `${endpoint.origin}${endpoint.pathname.replace(/\/+$/, '')}`,
  });
  apiEndpointPath = getSameOriginEndpointPath(apiUrl('/'));
  userFileEndpointPath = getSameOriginEndpointPath(self.NyaitterClientConfig.userFileEndpoint || '');
});

function sdkRequest(method, path, options = {}) {
  return nyaitterClientReady.then(() => nyaitterClient.request(method, path, options));
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

const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/config.js',
  '/manifest.json',
  '/js/main.js',
  '/js/app.js',
  '/js/state.js',
  '/js/api.js',
  '/js/dom.js',
  '/js/icons.js',
  '/manifest.webmanifest',
  '/favicon.png',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
];

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

function getSafePushIconUrl(value) {
  try {
    const url = new URL(value || '/pwa-icon-192.png', self.location.origin);
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const isSafeHttp = url.protocol === 'https:' || url.origin === self.location.origin;
    return isHttp && isSafeHttp ? url.href : new URL('/pwa-icon-192.png', self.location.origin).href;
  } catch (_) {
    return new URL('/pwa-icon-192.png', self.location.origin).href;
  }
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('nyaitter-client')
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('nyaitter-client-'))
        .map((key) => caches.delete(key))))
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
    const cacheKey = request.mode === 'navigate' ? '/index.html' : request;
    event.respondWith(
      caches.match(cacheKey).then((cachedResponse) => {
        const updateCache = fetch(request).then((response) => {
          if (isCacheableStaticResponse(response)) {
            const copy = response.clone();
            return caches.open('nyaitter-client')
              .then((cache) => cache.put(cacheKey, copy))
              .then(() => response);
          }
          return response;
        });

        if (cachedResponse) {
          event.waitUntil(updateCache.catch(() => {}));
          return cachedResponse;
        }

        return updateCache.catch(() => caches.match(cacheKey));
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

  const title = String(payload.title || 'Nyaitter').slice(0, 80);
  const iconUrl = getSafePushIconUrl(payload.icon);
  const options = {
    body: String(payload.body || '新しい通知があります').slice(0, 240),
    icon: iconUrl,
    badge: '/pwa-icon-192.png',
    tag: String(payload.tag || 'nyaitter-notification').slice(0, 64),
    renotify: false,
    data: {
      url: getSafeNotificationUrl(payload.url),
      userId: payload.user_id || null,
      notificationId: payload.notification_id || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
        await sdkRequest('PUT', apiUrl(`/server/api/notifications/${encodeURIComponent(String(notificationId))}/clicked`));
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
      let subscription = event.newSubscription;
      if (!subscription) {
        const config = await sdkRequest('GET', apiUrl('/server/api/push/config'));
        if (!config.enabled || !config.vapid_public_key) return;
        subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(config.vapid_public_key),
        });
      }

      await sdkRequest('POST', apiUrl('/server/api/push/subscriptions'), {
        body: { subscription: subscription.toJSON() },
      });
    } catch (_) {
      // A later settings-page visit will reconcile the subscription if this background update fails.
    }
  })());
});
