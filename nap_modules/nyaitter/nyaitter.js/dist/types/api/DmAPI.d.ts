/**
 * ダイレクトメッセージAPI
 * DM グループの作成・取得・編集・脱退・メッセージ送受信・未読管理などを行います。
 * メンバーの追加はルーム更新（updateRoom の member）、退出は leave で行います。
 */
export class DmAPI {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.js").NyaitterClient);
    _client: import("../NyaitterClient.js").NyaitterClient;
    /**
     * DM の一覧を取得します。
     *
     * @param {object} [params]
     * @param {number} [params.limit=50] - 取得件数（Server の既定値）
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ dm: object[], members: object[], unread_total: number }>}
     *
     * @example
     * const { dm, unread_total } = await client.dm.list();
     */
    list({ limit, offset }?: {
        limit?: number;
        offset?: number;
    }): Promise<{
        dm: object[];
        members: object[];
        unread_total: number;
    }>;
    /**
     * `list()` のエイリアスです。
     */
    getRooms(params: any): Promise<{
        dm: object[];
        members: object[];
        unread_total: number;
    }>;
    /**
     * 全体の DM 未読件数を取得します。
     *
     * @returns {Promise<{ unread_count: number }>}
     */
    getUnreadCount(): Promise<{
        unread_count: number;
    }>;
    /**
     * DM グループごとの未読件数マップを取得します。
     *
     * @returns {Promise<{ unread_total: number, unread_by_dm: Record<string, number> }>}
     */
    getUnreadCounts(): Promise<{
        unread_total: number;
        unread_by_dm: Record<string, number>;
    }>;
    /** 指定ユーザーの DM 公開鍵を取得します。 */
    getKeys(userIds: any): Promise<any>;
    /** 自分の DM 公開鍵を登録します。 */
    setKey(publicKey: any): Promise<any>;
    /** DM を削除します。 */
    delete(dmId: any): Promise<any>;
    /** DM の招待を受諾します。 */
    accept(dmId: any): Promise<any>;
    /** DM の招待を拒否します。 */
    decline(dmId: any): Promise<any>;
    /**
     * 指定ユーザーとの既存の 1対1 DM グループを検索します。
     *
     * @param {number|{ userId: number }} params - 相手のユーザー ID
     * @returns {Promise<{ dm: object|null }>}
     */
    find(params: number | {
        userId: number;
    }): Promise<{
        dm: object | null;
    }>;
    /**
     * DM グループの詳細を取得します。
     *
     * @param {string} dmId - DM グループ ID
     * @param {object} [params]
     * @param {number} [params.limit] - 互換のため受け取るだけです。現行Serverの GET /dm/:dmId は limit/offset を無視して全メッセージを返すため、送信しません。
     * @param {number} [params.offset] - 同上（送信しません）
     * @param {boolean} [params.markRead] - 取得時に既読にする
     * @returns {Promise<{ dm: object[], members: object[], unread_total: number }>}
     */
    get(dmId: string, { limit, offset, markRead }?: {
        limit?: number;
        offset?: number;
        markRead?: boolean;
    }): Promise<{
        dm: object[];
        members: object[];
        unread_total: number;
    }>;
    /**
     * `get()` のエイリアスです。
     */
    getRoom(dmId: any, params: any): Promise<{
        dm: object[];
        members: object[];
        unread_total: number;
    }>;
    /**
     * 新しい DM グループを作成します。
     *
     * @param {object} params
     * @param {number[]} params.members - 招待するユーザー ID の配列
     * @param {string} [params.title] - グループ名
     * @param {string} [params.name] - グループ名
     * @returns {Promise<{ dm: object, created: boolean }>}
     */
    create({ members, title, name }?: {
        members: number[];
        title?: string;
        name?: string;
    }): Promise<{
        dm: object;
        created: boolean;
    }>;
    /**
     * DM グループのタイトルや設定を更新します。
     *
     * @param {string} dmId - DM グループ ID
     * @param {object} params
     * @param {string} [params.title] - グループ名
     * @param {number[]} [params.members]
     * @param {number[]} [params.member]
     * @param {number} [params.hostId]
     * @param {object[]} [params.post]
     * @param {string} [params.stateVersion] - 取得した DM の state_version。post を更新するときは必須です。競合時は再取得してください。
     * @returns {Promise<{ dm: object }>}
     */
    updateRoom(dmId: string, { title, members, member, hostId, post, stateVersion }?: {
        title?: string;
        members?: number[];
        member?: number[];
        hostId?: number;
        post?: object[];
        stateVersion?: string;
    }): Promise<{
        dm: object;
    }>;
    /**
     * DM グループから脱退します。
     *
     * @param {string} dmId - DM グループ ID
     * @returns {Promise<{ success: boolean }>}
     */
    leave(dmId: string): Promise<{
        success: boolean;
    }>;
    /**
     * DM グループにメッセージを送信します。
     *
     * @param {string} dmId - DM グループ ID
     * @param {object} params
     * @param {string} [params.content] - メッセージ本文
     * @param {Array<object>} [params.attachments] - 添付ファイル
     * @param {object} [params.e2e] - E2E 暗号化ペイロード
     * @param {string} [params.reply_to] - 同じ会話内の返信先メッセージ ID
     * @param {string} [params.requestId] - 再送時に再利用する UUID（サーバーの対応が必要）
     * @param {{content?: string, attachments?: Array<object>, e2e?: object, reply_to?: string}} [params.message]
     * @returns {Promise<{ dm: object, message: object }>}
     */
    sendMessage(dmId: string, { message, requestId, ...fields }?: {
        content?: string;
        attachments?: Array<object>;
        e2e?: object;
        reply_to?: string;
        requestId?: string;
        message?: {
            content?: string;
            attachments?: Array<object>;
            e2e?: object;
            reply_to?: string;
        };
    }): Promise<{
        dm: object;
        message: object;
    }>;
    /**
     * 送信済みメッセージを編集します。
     *
     * @param {string} dmId - DM グループ ID
     * @param {string|number} messageId - メッセージ ID
     * @param {object} params
     * @param {string} params.content - 編集後のメッセージ本文
     * @returns {Promise<{ success: boolean, message: object }>}
     */
    editMessage(dmId: string, messageId: string | number, { content }?: {
        content: string;
    }): Promise<{
        success: boolean;
        message: object;
    }>;
    /**
     * 自分の送信済みメッセージを削除します。
     *
     * @param {string} dmId - DM グループ ID
     * @param {string|number} messageId - 削除するメッセージ ID
     * @returns {Promise<{ success: boolean }>}
     */
    deleteMessage(dmId: string, messageId: string | number): Promise<{
        success: boolean;
    }>;
    /**
     * DM グループのメッセージを既読にします。
     *
     * @param {string} dmId - DM グループ ID
     * @param {object} [params]
     * @param {string|number} [params.messageId] - 互換用（サーバーは指定を無視します）
     * @returns {Promise<{ success: boolean }>}
     */
    markAsRead(dmId: string, { messageId }?: {
        messageId?: string | number;
    }): Promise<{
        success: boolean;
    }>;
}
