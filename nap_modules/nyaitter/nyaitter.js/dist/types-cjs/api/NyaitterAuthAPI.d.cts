/**
 * NyaitterAuth API
 * 自分のアプリに他のユーザーを連携させるための機能です。
 *
 * **Bot トークンが必要です。**
 * このクラスのメソッドは、Bot トークンで認証した `NyaitterClient` から呼び出してください。
 *
 * ## 使い方の流れ
 * 1. `initiate()` で認証 URL を生成し、ユーザーをそこへ案内する
 * 2. ユーザーが許可すると `redirect_uri` に認証コードが届く
 * 3. `exchangeToken()` で認証コードをアクセストークンと交換する
 * 4. 以降はそのトークンで別の `NyaitterClient` を作り、そのユーザーとして API を呼び出せる
 */
export class NyaitterAuthAPI {
    /** @param {import('../NyaitterClient.cjs').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.cjs").NyaitterClient);
    _client: import("../NyaitterClient.cjs").NyaitterClient;
    getRequest(requestId: any): Promise<any>;
    approve(body: any): Promise<any>;
    deny(body: any): Promise<any>;
    autoPass(requestId: any): Promise<any>;
    checkGrant(query?: {}): Promise<any>;
    getRequestResponse(requestId: any, options: any): Promise<Response>;
    approveResponse(body: any): Promise<Response>;
    denyResponse(body: any): Promise<Response>;
    /**
     * 認証 URL を生成します。返ってきた `auth_url` にユーザーをリダイレクトしてください。
     *
     * @param {object} params
     * @param {string} params.appId - アプリ ID
     * @param {string} params.redirectUri - 許可後にリダイレクトされる URL
     * @param {string[]} params.scopes - 要求する権限のリスト
     * @param {string} [params.name] - 認証画面に表示されるアプリ名
     * @param {string} [params.iconUrl] - 認証画面に表示されるアイコン URL
     * @param {string} [params.state] - CSRF 対策用の任意文字列
     * @returns {Promise<{ request_id: string, auth_url: string, expires_at: string }>}
     *
     * @example
     * const { auth_url } = await client.nyaitterAuth.initiate({
     *   appId: 'my_app',
     *   redirectUri: 'https://example.com/callback',
     *   scopes: ['profile:read', 'posts:write', 'continuous_access'],
     *   name: '私のアプリ',
     * });
     * // ユーザーを auth_url へ案内する
     */
    initiate({ appId, redirectUri, scopes, name, iconUrl, state }?: {
        appId: string;
        redirectUri: string;
        scopes: string[];
        name?: string;
        iconUrl?: string;
        state?: string;
    }): Promise<{
        request_id: string;
        auth_url: string;
        expires_at: string;
    }>;
    /**
     * ユーザーが許可した後に届いた `code` をアクセストークンと交換します。
     * 取得したトークンで新しい `NyaitterClient` を作成して、そのユーザーとして API を呼び出せます。
     *
     * @param {object} params
     * @param {string} params.appId - アプリ ID
     * @param {string} params.code - コールバック URL の `?code=` の値
     * @returns {Promise<{ user: object, granted_scopes: string[], access_token?: string }>}
     *
     * @example
     * const code = new URLSearchParams(window.location.search).get('code');
     *
     * const { user, access_token } = await client.nyaitterAuth.exchangeToken({
     *   appId: 'my_app',
     *   code,
     * });
     *
     * // 取得したトークンで別クライアントを作る
     * const userClient = new NyaitterClient({
     *   baseUrl: 'https://nyaitter.example.com',
     *   token: access_token,
     * });
     * await userClient.posts.create({ content: 'ユーザーとして投稿！' });
     */
    exchangeToken({ appId, code }?: {
        appId: string;
        code: string;
    }): Promise<{
        user: object;
        granted_scopes: string[];
        access_token?: string;
    }>;
    /**
     * 連携済みアプリの一覧を取得します。
     *
     * @returns {Promise<{ apps: object[] }>}
     */
    getAuthorizedApps(): Promise<{
        apps: object[];
    }>;
    /**
     * 現在のアクセストークンで認可されたユーザー情報とスコープを取得します。
     *
     * @returns {Promise<{ success: boolean, user: object, scopes: string[], app_id: string|null }>}
     *
     * @example
     * const info = await userClient.nyaitterAuth.getUserInfo();
     * console.log(`連携ユーザー: ${info.user.name}, スコープ:`, info.scopes);
     */
    getUserInfo(): Promise<{
        success: boolean;
        user: object;
        scopes: string[];
        app_id: string | null;
    }>;
    /**
     * 連携済みアプリのスコープを更新します。
     *
     * @param {string} appAuthId - 連携 ID
     * @param {string[]} scopes - 新しいスコープ一覧
     * @returns {Promise<{ success: boolean }>}
     */
    updateAuthorizedApp(appAuthId: string, scopes: string[]): Promise<{
        success: boolean;
    }>;
    /**
     * 連携済みアプリを解除します。
     *
     * @param {string} appAuthId - 連携 ID
     * @returns {Promise<{ success: boolean }>}
     */
    revokeAuthorizedApp(appAuthId: string): Promise<{
        success: boolean;
    }>;
}
