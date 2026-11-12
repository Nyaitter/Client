export class NyaitterClient {
    /**
     * @param {object} options
     * @param {string} options.baseUrl - Nyaitter サーバーの URL
     * @param {string} [options.token] - Bot トークンまたはアクセストークン
     * @param {string} [options.extensionKey] - 拡張 API キー（`client.extensions` 用）
     * @param {typeof fetch} [options.fetch] - カスタム fetch 関数
     * @param {any} [options.WebSocket] - カスタム WebSocket クラス
     */
    constructor({ baseUrl, token, extensionKey, fetch: customFetch, WebSocket: customWebSocket }?: {
        baseUrl: string;
        token?: string;
        extensionKey?: string;
        fetch?: typeof fetch;
        WebSocket?: any;
    });
    _baseUrl: string;
    _token: string;
    _extensionKey: string;
    _fetch: any;
    _WebSocket: any;
    auth: AuthAPI;
    posts: PostsAPI;
    notes: NotesAPI;
    polls: PollsAPI;
    users: UsersAPI;
    dm: DmAPI;
    calls: CallsAPI;
    spaces: SpacesAPI;
    notifications: NotificationsAPI;
    groups: GroupsAPI;
    uploads: UploadsAPI;
    ranking: RankingAPI;
    reports: ReportsAPI;
    appeals: AppealsAPI;
    verification: VerificationAPI;
    imposters: ImpostersAPI;
    push: PushAPI;
    rules: RulesAPI;
    urlCards: UrlCardsAPI;
    oembed: OEmbedAPI;
    ui: UIAPI;
    system: SystemAPI;
    nyaitterAuth: NyaitterAuthAPI;
    extensions: ExtensionsAPI;
    /**
     * アクセストークンを設定します。
     * @param {string|null} token
     */
    setToken(token: string | null): void;
    /**
     * 現在のアクセストークンを取得します。
     * @returns {string|null}
     */
    getToken(): string | null;
    /**
     * 拡張 API キーを設定します（`client.extensions` の既定キー）。
     * @param {string|null} extensionKey
     */
    setExtensionKey(extensionKey: string | null): void;
    /**
     * 現在の拡張 API キーを取得します。
     * @returns {string|null}
     */
    getExtensionKey(): string | null;
    /**
     * 認証中のユーザーの情報を取得します。
     * `client.users.getMe()` のエイリアスです。
     *
     * @returns {Promise<{ user: object, isBot: boolean, tokenType: string }>}
     */
    getMe(): Promise<{
        user: object;
        isBot: boolean;
        tokenType: string;
    }>;
    /**
     * ユーザーオブジェクトまたはユーザー ID から、適切なアカウントアイコン URL を返します。
     *
     * @param {object|number|string} user - ユーザーオブジェクトまたはユーザー ID
     * @returns {string} アイコンの URL
     */
    getUserIconUrl(user: object | number | string): string;
    /**
     * グループオブジェクトまたはアイコン文字列から、適切なグループアイコン URL を返します。
     *
     * @param {object|string} group - グループオブジェクトまたはアイコン文字列
     * @returns {string} グループアイコンの URL
     */
    getGroupIconUrl(group: object | string): string;
    /**
     * リアルタイムイベントを受信するためのクライアントを作成します。
     *
     * @param {object} [options]
     * @param {boolean} [options.autoReconnect=true] - 切断時の自動再接続
     * @param {number} [options.reconnectDelayMs=3000] - 再接続待機時間
     * @returns {RealtimeClient}
     */
    realtime(options?: {
        autoReconnect?: boolean;
        reconnectDelayMs?: number;
    }): RealtimeClient;
    /**
     * API リクエストを送信する内部メソッド。
     *
     * @param {string} method - HTTP メソッド
     * @param {string} path - エンドポイントのパス
     * @param {object} [options]
     * @param {any} [options.body] - 送信する JSON ボディ
     * @param {object} [options.query] - URL クエリパラメータ
     * @param {Record<string, string>} [options.headers] - 追加ヘッダー
     * @returns {Promise<any>}
     */
    request(method: string, path: string, { body, query, headers }?: {
        body?: any;
        query?: object;
        headers?: Record<string, string>;
    }): Promise<any>;
    /**
     * API リクエストをレスポンス情報付きで送信します。
     * @param {string} methodOrPath HTTP メソッド、または直接指定するエンドポイント
     * @param {string|object} [pathOrOptions] エンドポイント、または GET 用オプション
     * @param {object} [requestOptions]
     * @example
     * await client.requestResponse('/api/custom-endpoint');
     * @returns {Promise<Response>}
     */
    requestResponse(methodOrPath: string, pathOrOptions?: string | object, requestOptions?: object): Promise<Response>;
    _parseResponse(response: any): Promise<any>;
    /** @internal */
    _get(path: any, query: any): Promise<any>;
    /** @internal */
    _post(path: any, body: any, query: any): Promise<any>;
    /** @internal */
    _put(path: any, body: any, query: any): Promise<any>;
    /** @internal */
    _patch(path: any, body: any, query: any): Promise<any>;
    /** @internal */
    _delete(path: any, body: any, query: any): Promise<any>;
}
/**
 * Nyaitter API のエラーを表す例外クラスです。
 */
export class NyaitterError extends Error {
    /**
     * @param {string} message - エラーメッセージ
     * @param {number} status - HTTP ステータスコード
     * @param {any} data - サーバーからのレスポンスデータ
     */
    constructor(message: string, status: number, data: any);
    status: number;
    data: any;
}
import { AuthAPI } from './api/AuthAPI.cjs';
import { PostsAPI } from './api/PostsAPI.cjs';
import { NotesAPI } from './api/NotesAPI.cjs';
import { PollsAPI } from './api/PollsAPI.cjs';
import { UsersAPI } from './api/UsersAPI.cjs';
import { DmAPI } from './api/DmAPI.cjs';
import { CallsAPI } from './api/CallsAPI.cjs';
import { SpacesAPI } from './api/SpacesAPI.cjs';
import { NotificationsAPI } from './api/NotificationsAPI.cjs';
import { GroupsAPI } from './api/GroupsAPI.cjs';
import { UploadsAPI } from './api/UploadsAPI.cjs';
import { RankingAPI } from './api/RankingAPI.cjs';
import { ReportsAPI } from './api/ReportsAPI.cjs';
import { AppealsAPI } from './api/AppealsAPI.cjs';
import { VerificationAPI } from './api/VerificationAPI.cjs';
import { ImpostersAPI } from './api/ImpostersAPI.cjs';
import { PushAPI } from './api/PushAPI.cjs';
import { RulesAPI } from './api/RulesAPI.cjs';
import { UrlCardsAPI } from './api/UrlCardsAPI.cjs';
import { OEmbedAPI } from './api/OEmbedAPI.cjs';
import { UIAPI } from './api/UIAPI.cjs';
import { SystemAPI } from './api/SystemAPI.cjs';
import { NyaitterAuthAPI } from './api/NyaitterAuthAPI.cjs';
import { ExtensionsAPI } from './api/ExtensionsAPI.cjs';
import { RealtimeClient } from './RealtimeClient.cjs';
