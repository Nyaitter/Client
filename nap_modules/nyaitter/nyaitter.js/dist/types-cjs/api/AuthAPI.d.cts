/**
 * 認証 API
 * 現行Serverのプロバイダー認証、ログイン承認、セッション管理などを行います。
 */
export class AuthAPI {
    /** @param {import('../NyaitterClient.cjs').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.cjs").NyaitterClient);
    _client: import("../NyaitterClient.cjs").NyaitterClient;
    getProviders(): Promise<any>;
    verifyProvider(provider: any, body?: {}): Promise<any>;
    pollLoginApproval(id: any, approvalToken: any): Promise<any>;
    getLinkedProviders(): Promise<any>;
    initiateProvider(provider: any, body?: {}): Promise<any>;
    initiateProviderLink(provider: any, body?: {}): Promise<any>;
    verifyProviderLink(provider: any, body?: {}): Promise<any>;
    unlinkProvider(provider: any, providerUserId: any): Promise<any>;
    getLoginApproval(id: any): Promise<any>;
    decideLoginApproval(id: any, decision: any): Promise<any>;
    /** @param {{approvalId?: string, approvalToken?: string}} [params] */
    startAccountRecovery({ approvalId, approvalToken }?: {
        approvalId?: string;
        approvalToken?: string;
    }): Promise<any>;
    pollAccountRecovery(id: any, recoveryToken: any): Promise<any>;
    getAccountRecovery(id: any): Promise<any>;
    decideAccountRecovery(id: any, decision: any): Promise<any>;
    getBlockedIps(): Promise<any>;
    deleteBlockedIp(hash: any): Promise<any>;
    trustCurrentIp(): Promise<any>;
    revokeSessionIp(id: any): Promise<any>;
    switchImposter(id: any): Promise<any>;
    verifyTurnstile(token: any): Promise<any>;
    devLogin(username: any): Promise<any>;
    testProtected(): Promise<any>;
    createBotToken(name: any): Promise<any>;
    getBotTokens(): Promise<any>;
    deleteBotToken(id: any): Promise<any>;
    getProvidersResponse(): Promise<Response>;
    pollLoginApprovalResponse(approvalId: any, approvalToken: any): Promise<Response>;
    generateScratchResponse(username: any): Promise<Response>;
    verifyScratchResponse(body: any): Promise<Response>;
    initiateEmailResponse(email: any): Promise<Response>;
    verifyEmailResponse(body: any): Promise<Response>;
    initiatePasskeyResponse(body?: {}): Promise<Response>;
    verifyPasskeyResponse(body: any): Promise<Response>;
    initiateNyaitterResponse(body: any): Promise<Response>;
    verifyProviderResponse(provider: any, body: any): Promise<Response>;
    /**
     * ログアウトします。
     *
     * @returns {Promise<{ message: string }>}
     */
    logout(): Promise<{
        message: string;
    }>;
    /**
     * ログイン中のユーザー情報を取得します。
     *
     * @returns {Promise<{ user: object, isBot: boolean, tokenType: string }>}
     */
    getMe(): Promise<{
        user: object;
        isBot: boolean;
        tokenType: string;
    }>;
    /**
     * 連携されているサブアカウント一覧を取得します。
     *
     * @returns {Promise<{ accounts: object[] }>}
     */
    getAccounts(): Promise<{
        accounts: object[];
    }>;
    /**
     * 操作対象のアカウントを切り替えます。
     *
     * @param {object} params
     * @param {number} params.accountId - 切り替え先のアカウント ID
     * @param {number} [params.userId] - 切り替え先のユーザー ID
     * @returns {Promise<{ success: boolean, user: object }>}
     */
    switchAccount({ accountId, userId }?: {
        accountId: number;
        userId?: number;
    }): Promise<{
        success: boolean;
        user: object;
    }>;
    /**
     * 記憶済みアカウントを解除します（provider連携の解除ではありません）。
     *
     * @param {number} accountId - 解除するアカウント ID
     * @returns {Promise<{ success: boolean }>}
     */
    unlinkAccount(accountId: number): Promise<{
        success: boolean;
    }>;
    /**
     * アクティブなログインセッション一覧を取得します。
     *
     * @returns {Promise<{ sessions: object[] }>}
     */
    getSessions(): Promise<{
        sessions: object[];
    }>;
    /**
     * 指定したログインセッションを取り消しします。
     *
     * @param {string} sessionId - セッション ID
     * @returns {Promise<{ success: boolean }>}
     */
    revokeSession(sessionId: string): Promise<{
        success: boolean;
    }>;
}
