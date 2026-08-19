import { apiRequest } from '../api.js';
import {
    getPwaRegistrationPromise,
    setPwaRegistrationPromise,
} from '../state.js';
import { showAppAlert } from '../utils/helpers.js';

export function supportsWebPush() {
    return (
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window &&
        window.isSecureContext
    );
}

export function base64UrlToUint8Array(base64UrlData) {
    const padding = '='.repeat((4 - (base64UrlData.length % 4)) % 4);
    const base64 = (base64UrlData + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i += 1) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function registerPwaServiceWorker() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    if (!getPwaRegistrationPromise()) {
        const registrationPromise = navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            .catch((error) => {
                console.warn('Service Worker registration failed:', error);
                return null;
            });
        setPwaRegistrationPromise(registrationPromise);
    }
    return getPwaRegistrationPromise();
}

export function setPushSettingsUi({
    supported = true,
    enabled = false,
    permission = 'default',
    loading = false,
    statusText = '',
} = {}) {
    const toggle = document.getElementById('push-notifications-toggle');
    const status = document.getElementById('push-notifications-status');
    if (!toggle || !status) return;

    toggle.disabled = loading || !supported;
    toggle.checked = Boolean(enabled);
    if (!supported) {
        status.textContent = 'この環境はWeb Push通知に対応していません。';
        return;
    }
    if (permission === 'denied') {
        status.textContent = 'ブラウザで通知がブロックされています。通知設定を許可してください。';
        return;
    }
    if (statusText) {
        status.textContent = statusText;
        return;
    }
    status.textContent = enabled ? '有効（この端末で受信中）' : '無効';
}

export async function loadPushSettingsState() {
    if (!supportsWebPush()) {
        setPushSettingsUi({ supported: false });
        return;
    }

    setPushSettingsUi({ loading: true, statusText: '設定を確認中…' });
    try {
        const registration = await registerPwaServiceWorker();
        if (!registration) {
            setPushSettingsUi({ supported: false });
            return;
        }

        const subscription = await registration.pushManager.getSubscription();
        const permission = Notification.permission;
        setPushSettingsUi({
            supported: true,
            enabled: Boolean(subscription) && permission === 'granted',
            permission,
        });
    } catch (error) {
        console.error('Failed to load push notification state:', error);
        setPushSettingsUi({
            supported: true,
            enabled: false,
            permission: Notification.permission,
            statusText: '設定の取得に失敗しました',
        });
    }
}

export async function togglePushSubscription(wantsEnabled) {
    if (!supportsWebPush()) {
        await showAppAlert('この環境はWeb Push通知に対応していません。');
        return;
    }

    setPushSettingsUi({
        loading: true,
        statusText: wantsEnabled ? '通知を設定中…' : '通知を解除中…',
    });

    try {
        const registration = await registerPwaServiceWorker();
        if (!registration) {
            throw new Error('Service Worker を初期化できませんでした。');
        }

        if (wantsEnabled) {
            let permission = Notification.permission;
            if (permission !== 'granted') {
                permission = await Notification.requestPermission();
            }
            if (permission !== 'granted') {
                setPushSettingsUi({
                    supported: true,
                    enabled: false,
                    permission,
                });
                await showAppAlert('通知権限が許可されませんでした。ブラウザのサイト設定を確認してください。');
                return;
            }

            const { data: configData, error: configError } = await apiRequest('/server/api/push/public-key');
            if (configError || !configData?.publicKey) {
                throw new Error(configError?.message || 'プッシュ公開鍵の取得に失敗しました。');
            }

            let subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
            }

            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: base64UrlToUint8Array(configData.publicKey),
            });

            const subscriptionJson = subscription.toJSON();
            const { error: subscribeError } = await apiRequest('/server/api/push/subscribe', {
                method: 'POST',
                body: { subscription: subscriptionJson },
            });

            if (subscribeError) {
                await subscription.unsubscribe().catch(() => {});
                throw new Error(subscribeError.message || 'プッシュ通知の登録に失敗しました。');
            }

            setPushSettingsUi({
                supported: true,
                enabled: true,
                permission: 'granted',
            });
            await showAppAlert('プッシュ通知を有効にしました。');
        } else {
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                const endpoint = subscription.endpoint;
                await subscription.unsubscribe().catch(() => {});
                if (endpoint) {
                    await apiRequest('/server/api/push/unsubscribe', {
                        method: 'POST',
                        body: { endpoint },
                    }).catch((error) => console.warn('Unsubscribe API call failed:', error));
                }
            }
            setPushSettingsUi({
                supported: true,
                enabled: false,
                permission: Notification.permission,
            });
            await showAppAlert('プッシュ通知を解除しました。');
        }
    } catch (error) {
        console.error('Failed to toggle push notifications:', error);
        await showAppAlert(`プッシュ通知の設定変更に失敗しました: ${error.message || '不明なエラー'}`);
        await loadPushSettingsState();
    }
}

export function getPendingPushNotificationOpen() {
    const currentUrl = new URL(window.location.href);
    const openType = currentUrl.searchParams.get('push_open_type');
    const openTarget = currentUrl.searchParams.get('push_open_target');
    if (!openType && !openTarget) return null;
    return { openType, openTarget, currentUrl };
}

export function replaceCurrentLocation(url) {
    const target = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, document.title, target);
}

export async function handlePendingPushNotificationOpen() {
    const pending = getPendingPushNotificationOpen();
    if (!pending) return false;
    const { openType, openTarget, currentUrl } = pending;
    currentUrl.searchParams.delete('push_open_type');
    currentUrl.searchParams.delete('push_open_target');

    if (openType === 'dm') {
        const dmId = String(openTarget || '').trim();
        if (dmId) currentUrl.hash = `#dm/${encodeURIComponent(dmId)}`;
        replaceCurrentLocation(currentUrl);
        return false;
    }
    if (openType === 'post') {
        const postId = String(openTarget || '').trim();
        if (postId) currentUrl.hash = `#post/${encodeURIComponent(postId)}`;
        replaceCurrentLocation(currentUrl);
        return false;
    }
    if (openType === 'notifications') {
        currentUrl.hash = '#notifications';
        replaceCurrentLocation(currentUrl);
        return false;
    }
    replaceCurrentLocation(currentUrl);
    return false;
}
