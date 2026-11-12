/**
 * 通知 API
 * 通知の取得・作成・既読・クリック状態管理・削除などを行います。
 */
export class NotificationsAPI {
    /** @param {import('../NyaitterClient.cjs').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.cjs").NyaitterClient);
    _client: import("../NyaitterClient.cjs").NyaitterClient;
    /**
     * 通知一覧を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数
     * @param {number} [params.offset=0] - 取得開始位置
     * @param {string|Date} [params.since] - この日時以降の通知のみ取得
     * @returns {Promise<{ notifications: object[], notification_unread_count: number }>}
     *
     * @example
     * const { notifications, notification_unread_count } = await client.notifications.list();
     * console.log(`未読: ${notification_unread_count} 件`);
     */
    list({ limit, offset, since }?: {
        limit?: number;
        offset?: number;
        since?: string | Date;
    }): Promise<{
        notifications: object[];
        notification_unread_count: number;
    }>;
    /**
     * 未読の通知件数を取得します。
     *
     * @returns {Promise<{ unread_count: number }>}
     *
     * @example
     * const { unread_count } = await client.notifications.getUnreadCount();
     */
    getUnreadCount(): Promise<{
        unread_count: number;
    }>;
    /**
     * 新しい通知を送信します。
     *
     * @param {object} params
     * @param {number} params.recipientId - 送信先ユーザー ID
     * @param {string} params.type - 通知タイプ。一般ユーザーにはサーバー側の種別・対象制限があります。
     * @param {object} [params.target] - 通知対象
     * @returns {Promise<{ success: boolean, notification: object|null }>}
     *
     * @example
     * await client.notifications.create({
     *   recipientId: 12,
     *   type: 'mention',
     *   target: { kind: 'post', id: 123 },
     * });
     */
    create({ recipientId, type, target }?: {
        recipientId: number;
        type: string;
        target?: object;
    }): Promise<{
        success: boolean;
        notification: object | null;
    }>;
    /**
     * 通知を既読にします。
     *
     * @param {number} notificationId - 通知 ID
     * @returns {Promise<{ success: boolean, notification_unread_count: number }>}
     */
    markAsRead(notificationId: number): Promise<{
        success: boolean;
        notification_unread_count: number;
    }>;
    /**
     * 通知をクリック済みにマークします。
     *
     * @param {number} notificationId - 通知 ID
     * @returns {Promise<{ success: boolean, read: boolean, clicked: boolean, notification_unread_count: number }>}
     */
    markAsClicked(notificationId: number): Promise<{
        success: boolean;
        read: boolean;
        clicked: boolean;
        notification_unread_count: number;
    }>;
    /**
     * すべての通知を既読にします。
     *
     * @returns {Promise<{ success: boolean, notification_unread_count: number }>}
     *
     * @example
     * await client.notifications.markAllAsRead();
     */
    markAllAsRead(): Promise<{
        success: boolean;
        notification_unread_count: number;
    }>;
    /**
     * すべての通知をクリック済みにします。
     *
     * @returns {Promise<{ success: boolean, notification_unread_count: number }>}
     */
    markAllAsClicked(): Promise<{
        success: boolean;
        notification_unread_count: number;
    }>;
    /**
     * 通知を削除します。
     *
     * @param {number} notificationId - 削除する通知 ID
     * @returns {Promise<{ success: boolean }>}
     */
    delete(notificationId: number): Promise<{
        success: boolean;
    }>;
}
