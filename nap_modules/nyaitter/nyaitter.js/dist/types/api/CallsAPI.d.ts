/**
 * ステージ・通話 API
 * ステージ（公開/グループ限定の音声ルーム）の作成・検索・参加情報取得・終了や、
 * DM 通話の参加情報取得、ゲスト参加セッションの発行を行います。
 *
 * WebRTC のシグナリングは `client.realtime()` の `call:*` メッセージで行い、
 * ここで取得した `ice_servers` / `ice_transport_policy` を RTCPeerConnection に渡します。
 */
export class CallsAPI {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.js").NyaitterClient);
    _client: import("../NyaitterClient.js").NyaitterClient;
    /**
     * 参加可能なステージを検索・取得します。
     *
     * @param {object} [params]
     * @param {string} [params.query] - 検索キーワード（最大200文字）
     * @param {number} [params.offset=0] - 取得開始位置
     * @returns {Promise<{ stages: object[], has_more: boolean }>}
     *
     * @example
     * const { stages } = await client.calls.listStages({ query: '雑談' });
     */
    listStages({ query, offset }?: {
        query?: string;
        offset?: number;
    }): Promise<{
        stages: object[];
        has_more: boolean;
    }>;
    /**
     * ステージを開始、または未来の日時で予約します。
     *
     * @param {object} params
     * @param {string} params.name - ステージ名
     * @param {string} [params.description] - 説明（最大2000文字）
     * @param {'public'|'group'|'private'} [params.visibility='public'] - 公開範囲
     * @param {string} [params.group_id] - `visibility` が `'group'` のときの対象グループ ID
     * @param {string} [params.groupId]
     * @param {string} [params.scheduled_at] - 予約開始日時（ISO 8601、未来のみ）
     * @param {string} [params.scheduledAt]
     * @param {number[]} [params.invite_ids] - 招待するユーザー ID の配列
     * @param {number[]} [params.inviteIds]
     * @param {number[]} [params.speaker_ids] - スピーカーにするユーザー ID の配列
     * @param {number[]} [params.speakerIds]
     * @param {boolean} [params.allow_guest_join] - ゲスト参加を許可するか
     * @param {boolean} [params.allowGuestJoin]
     * @returns {Promise<{ stage: object }>}
     *
     * @example
     * const { stage } = await client.calls.createStage({ name: 'はじめてのステージ' });
     */
    createStage({ name, description, visibility, group_id, groupId, scheduled_at, scheduledAt, invite_ids, inviteIds, speaker_ids, speakerIds, allow_guest_join, allowGuestJoin, }?: {
        name: string;
        description?: string;
        visibility?: "public" | "group" | "private";
        group_id?: string;
        groupId?: string;
        scheduled_at?: string;
        scheduledAt?: string;
        invite_ids?: number[];
        inviteIds?: number[];
        speaker_ids?: number[];
        speakerIds?: number[];
        allow_guest_join?: boolean;
        allowGuestJoin?: boolean;
    }): Promise<{
        stage: object;
    }>;
    /**
     * ステージの参加情報を取得します。
     * 応答には WebRTC 接続に使う `ice_servers` と `ice_transport_policy` が含まれます。
     *
     * @param {string} id - ステージ ID
     * @returns {Promise<{ stage: object, role: string, guest: boolean, host: object, participants: object[], ice_transport_policy: string, bundle_policy: string, rtcp_mux_policy: string, ice_servers: object[] }>}
     *
     * @example
     * const info = await client.calls.getStage(stage.id);
     */
    getStage(id: string): Promise<{
        stage: object;
        role: string;
        guest: boolean;
        host: object;
        participants: object[];
        ice_transport_policy: string;
        bundle_policy: string;
        rtcp_mux_policy: string;
        ice_servers: object[];
    }>;
    /**
     * ステージの状態・スピーカー・招待・ゲスト参加設定を更新します（ホストのみ）。
     *
     * @param {string} id - ステージ ID
     * @param {object} [params]
     * @param {'live'|'ended'} [params.status] - ステージの状態
     * @param {number[]} [params.speaker_ids] - スピーカーにするユーザー ID の配列
     * @param {number[]} [params.speakerIds]
     * @param {number[]} [params.invite_ids] - 追加で招待するユーザー ID の配列
     * @param {number[]} [params.inviteIds]
     * @param {boolean} [params.allow_guest_join] - ゲスト参加を許可するか
     * @param {boolean} [params.allowGuestJoin]
     * @returns {Promise<{ stage: object }>}
     */
    updateStage(id: string, { status, speaker_ids, speakerIds, invite_ids, inviteIds, allow_guest_join, allowGuestJoin }?: {
        status?: "live" | "ended";
        speaker_ids?: number[];
        speakerIds?: number[];
        invite_ids?: number[];
        inviteIds?: number[];
        allow_guest_join?: boolean;
        allowGuestJoin?: boolean;
    }): Promise<{
        stage: object;
    }>;
    /**
     * 未ログインのゲストとしてステージに参加するためのセッションを発行します。
     * 実際の制御は `client.realtime()` の `call:*` メッセージで行います。
     *
     * @param {string} id - ステージ ID
     * @returns {Promise<{ guest_id: string }>}
     */
    createGuestSession(id: string): Promise<{
        guest_id: string;
    }>;
    /**
     * 発行済みのゲスト参加セッションを終了します。
     *
     * @returns {Promise<{ ok: boolean }>}
     */
    deleteGuestSession(): Promise<{
        ok: boolean;
    }>;
    /**
     * DM 通話の参加情報を取得します。
     * 応答には WebRTC 接続に使う `ice_servers` と `ice_transport_policy` が含まれます。
     *
     * @param {string} dmId - DM グループ ID
     * @returns {Promise<{ title: string, members: object[], participants: object[], active: boolean, ice_transport_policy: string, bundle_policy: string, rtcp_mux_policy: string, ice_servers: object[] }>}
     *
     * @example
     * const call = await client.calls.getDmCall('dm_group_id');
     */
    getDmCall(dmId: string): Promise<{
        title: string;
        members: object[];
        participants: object[];
        active: boolean;
        ice_transport_policy: string;
        bundle_policy: string;
        rtcp_mux_policy: string;
        ice_servers: object[];
    }>;
    /**
     * 参加情報レスポンスから WebRTC 用の ICE 設定を取り出します。
     *
     * @param {object} info - `getStage()` または `getDmCall()` の戻り値
     * @returns {{ iceServers: object[], iceTransportPolicy: string, bundlePolicy: string, rtcpMuxPolicy: string }}
     *
     * @example
     * const pc = new RTCPeerConnection(client.calls.getIceConfig(await client.calls.getStage(id)));
     */
    getIceConfig(info?: object): {
        iceServers: object[];
        iceTransportPolicy: string;
        bundlePolicy: string;
        rtcpMuxPolicy: string;
    };
}
