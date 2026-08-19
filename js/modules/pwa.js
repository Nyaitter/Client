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
    status = '',
    actionLabel = 'この環境では利用できません',
    actionDisabled = true,
} = {}) {
    const statusEl = document.getElementById('push-notification-status');
    const button = document.getElementById('push-notification-action');
    if (statusEl) statusEl.textContent = status;
    if (button) {
        button.textContent = actionLabel;
        button.disabled = actionDisabled;
    }
}

export async function loadPushSettingsState() {
    if (!supportsWebPush()) {
        setPushSettingsUi({
            status: 'この環境はWeb Push通知に対応していません。',
        });
        return null;
    }

    setPushSettingsUi({
        status: '通知の状態を確認しています…',
        actionLabel: '読み込み中…',
    });
    try {
        const [registration, configResult] = await Promise.all([
            registerPwaServiceWorker(),
            apiRequest('/server/api/push/config'),
        ]);
        if (!registration) {
            setPushSettingsUi({
                status: 'サービスワーカーを登録できませんでした。',
                actionLabel: '利用できません',
            });
            return null;
        }
        if (
            configResult.error ||
            !configResult.data?.enabled ||
            !configResult.data?.vapid_public_key
        ) {
            setPushSettingsUi({
                status: 'このサーバーではプッシュ通知がまだ設定されていません。',
                actionLabel: 'サーバー設定待ち',
            });
            return null;
        }

        const subscription = await registration.pushManager.getSubscription();
        const permission = Notification.permission;
        const subscriptionCount = Math.max(
            0,
            Number(configResult.data.subscription_count) || 0,
        );
        const hasServerSubscription = subscriptionCount > 0;
        if (permission === 'denied') {
            setPushSettingsUi({
                status: hasServerSubscription
                    ? `このアカウントではプッシュ通知を購読中です（${subscriptionCount}端末）。ただし、この端末のブラウザでは通知が拒否されています。`
                    : 'ブラウザで通知が拒否されています。ブラウザ設定から許可してください。',
                actionLabel: '通知が拒否されています',
            });
            return {
                registration,
                config: configResult.data,
                subscription,
                subscriptionCount,
                permission,
            };
        }

        setPushSettingsUi({
            status: subscription
                ? 'この端末でプッシュ通知を購読中です。'
                : hasServerSubscription
                  ? `このアカウントではプッシュ通知を購読中です（${subscriptionCount}端末）。この端末では未購読です。`
                  : 'この端末ではプッシュ通知を購読していません。',
            actionLabel: subscription
                ? 'この端末の購読を解除'
                : 'この端末で通知を有効化',
            actionDisabled: false,
        });
        return {
            registration,
            config: configResult.data,
            subscription,
            subscriptionCount,
            permission,
        };
    } catch (error) {
        console.error('Failed to load push notification state:', error);
        setPushSettingsUi({
            status: '通知設定を取得できませんでした。',
            actionLabel: 'もう一度試す',
            actionDisabled: false,
        });
        return null;
    }
}

export async function togglePushSubscription() {
    const button = document.getElementById('push-notification-action');
    if (button) button.disabled = true;

    try {
        const state = await loadPushSettingsState();
        if (!state) return;

        if (state.subscription) {
            const endpoint = state.subscription.endpoint;
            const unsubscribed = await state.subscription.unsubscribe();
            if (!unsubscribed) {
                throw new Error('ブラウザ側の購読解除に失敗しました。');
            }
            const { error } = await apiRequest('/server/api/push/subscriptions', {
                method: 'DELETE',
                body: { endpoint },
            });
            if (error) throw error;
            await loadPushSettingsState();
            return;
        }

        const permission =
            Notification.permission === 'default'
                ? await Notification.requestPermission()
                : Notification.permission;
        if (permission !== 'granted') {
            await loadPushSettingsState();
            return;
        }

        const subscription = await state.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(
                state.config.vapid_public_key,
            ),
        });
        const { error } = await apiRequest('/server/api/push/subscriptions', {
            method: 'POST',
            body: { subscription: subscription.toJSON() },
        });
        if (error) {
            await subscription.unsubscribe();
            throw error;
        }
        await loadPushSettingsState();
    } catch (error) {
        console.error('Failed to toggle push notifications:', error);
        setPushSettingsUi({
            status: `通知設定を更新できませんでした: ${error.message || '不明なエラー'}`,
            actionLabel: 'もう一度試す',
            actionDisabled: false,
        });
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
