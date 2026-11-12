export class RealtimeClient {
    /**
     * @param {import('./NyaitterClient.js').NyaitterClient} client
     */
    constructor(client: import("./NyaitterClient.js").NyaitterClient);
    _client: import("./NyaitterClient.js").NyaitterClient;
    _ws: any;
    _listeners: Map<any, any>;
    _pingInterval: number;
    _reconnectTimer: number;
    _shouldReconnect: boolean;
    _callRoom: {
        kind: "dm" | "stage";
        id: string | number;
    } | {
        kind: string;
        id: string;
    };
    _spaceSubscriptions: Set<any>;
    /**
     * イベントリスナーを登録します。
     *
     * イベント一覧：
     * - `'notification'`  — 新着通知 `(notification: object) => void`
     * - `'notificationUnreadCount'` — 通知未読数の更新 `(count: number) => void`
     * - `'dm'`            — DM 新着メッセージ `({ dmId, message, sender }) => void`
     * - `'dmEdited'`      — DM メッセージの編集 `({ dmId, message }) => void`
     * - `'dmUnreadCount'` — DM 未読数の更新 `(count: number) => void`
     * - `'timelinePost'`  — フォロー中タイムラインの新着 `({ postId, authorId }) => void`
     * - `'call'`          — 通話系イベント全般（サーバーの `call:*` 生ペイロード） `(payload: object) => void`
     * - `'callJoined'`    — 通話に参加した `({ room, role, roster, owner_id, request_id }) => void`
     * - `'callWatching'`  — 予約ステージの待機に入った `({ room }) => void`
     * - `'callRoster'`    — 参加者一覧の更新 `({ room, roster }) => void`
     * - `'callSignal'`    — WebRTC シグナル `({ room, from, data }) => void`
     * - `'callState'`     — 通話状態の変化 `(payload) => void`
     * - `'callModerated'` — ホストによる操作を受けた `({ room, action }) => void`
     * - `'callKicked'`    — ステージから追放された `({ room, message }) => void`
     * - `'callScreen'`    — 画面共有の開始・終了 `({ room, user_id, active, stream_id, label }) => void`
     * - `'callEnded'`     — 通話が終了・退出になった `({ room, message }) => void`
     * - `'callStage'`     — ステージ状態の更新 `({ room, status }) => void`
     * - `'callError'`     — 通話操作のエラー `({ request_id, message }) => void`
     * - `'callChat'`      — 通話チャット `({ room, user_id, name, text, at }) => void`
     * - `'callChatDelete'`— 通話チャットの削除 `({ room, id }) => void`
     * - `'callChatClear'` — 通話チャットの全消去 `({ room }) => void`
     * - `'callTranscript'`— 文字起こし `({ room, user_id, name, text, at }) => void`
     * - `'dmRead'`        — DM の既読通知 `({ dmId, readerId }) => void`
     * - `'pollUpdated'`   — 投票の更新 `({ pollId, postId, poll }) => void`
     * - `'space'`         — スペース系イベント全般（サーバーの `space_*` 生ペイロード） `(payload: object) => void`
     * - `'spaceMessage'`  — スペースの新着メッセージ `({ spaceId, channelId, message, user }) => void`
     * - `'spaceMessageDeleted'` — スペースのメッセージ削除 `({ spaceId, channelId, messageId }) => void`
     * - `'spaceDeleted'`  — スペースの削除 `({ spaceId }) => void`
     * - `'spaceMemberLeft'` — スペースからの退出 `({ spaceId, userId }) => void`
     * - `'spaceSignal'`   — スペースボイスの WebRTC シグナル `({ spaceId, channelId, fromUserId, data }) => void`
     * - `'spaceVoiceRoster'` — スペースボイスの参加者一覧 `({ spaceId, channelId, roster, joinedUserId, leftUserId }) => void`
     * - `'open'`          — 接続完了 `() => void`
     * - `'close'`         — 切断 `() => void`
     * - `'error'`         — エラー `(error: Event) => void`
     *
     * @param {string} event - イベント名
     * @param {Function} handler - コールバック関数
     * @returns {this} メソッドチェーン可
     *
     * @example
     * realtime.on('notification', (n) => console.log(n));
     */
    on(event: string, handler: Function): this;
    /**
     * イベントリスナーを解除します。
     *
     * @param {string} event - イベント名
     * @param {Function} handler - 登録時と同じコールバック関数
     * @returns {this}
     */
    off(event: string, handler: Function): this;
    /** @internal */
    _emit(event: any, data: any): void;
    /**
     * WebSocket に接続します。
     * 接続が確立すると `'open'` イベントが発火します。
     *
     * @param {object} [options]
     * @param {boolean} [options.autoReconnect=true] - 切断時に自動再接続するか
     * @param {number}  [options.reconnectDelayMs=3000] - 再接続までの待機時間
     * @returns {Promise<void>} 接続完了で resolve
     */
    connect({ autoReconnect, reconnectDelayMs }?: {
        autoReconnect?: boolean;
        reconnectDelayMs?: number;
    }): Promise<void>;
    _reconnectDelayMs: number;
    /** @internal */
    _connect(): Promise<any>;
    /** @internal */
    _handleMessage(raw: any): void;
    /** @internal */
    _startPing(): void;
    /** @internal */
    _stopPing(): void;
    /**
     * WebSocket を切断します。
     * 自動再接続も停止します。
     */
    disconnect(): void;
    /**
     * 現在接続中かどうかを返します。
     * @returns {boolean}
     */
    get connected(): boolean;
    /**
     * 現在参加中の通話ルームを返します。未参加のときは `null` です。
     * @returns {{ kind: string, id: string|number }|null}
     */
    get callRoom(): {
        kind: string;
        id: string | number;
    } | null;
    /**
     * WebSocket へ生の JSON メッセージを送信します。
     * 通話プロトコル（`call:*`）もこれで送信できます。
     *
     * @param {object} message - `type` を含むメッセージ
     * @throws {Error} 未接続のとき
     *
     * @example
     * realtime.send({ type: 'call:leave' });
     */
    send(message: object): void;
    /**
     * @internal
     * @param {{kind?: string|number, id?: string|number}} [options]
     */
    _resolveCallRoom({ kind, id }?: {
        kind?: string | number;
        id?: string | number;
    }): {
        kind: string | number;
        id: string | number;
    };
    /**
     * 通話（ステージまたは DM）に参加します。
     * 以後の操作はこのルームが既定の対象になります。
     *
     * @param {object} params
     * @param {'stage'|'dm'} params.kind - 通話の種類
     * @param {string|number} params.id - ステージ ID または DM グループ ID
     * @param {string} [params.requestId] - 応答を対応付ける任意の ID
     * @param {boolean} [params.muted] - 初期ミュート状態
     * @param {boolean} [params.camera] - 初期カメラ状態
     *
     * @example
     * realtime.joinCall({ kind: 'dm', id: 'dm_group_id' });
     */
    joinCall({ kind, id, requestId, muted, camera }?: {
        kind: "stage" | "dm";
        id: string | number;
        requestId?: string;
        muted?: boolean;
        camera?: boolean;
    }): void;
    /**
     * 予約済み（開始前）のステージを待機入りします。
     * ステージが `live` になると自動的に参加扱いになります。
     *
     * @param {string} id - ステージ ID
     * @param {object} [options]
     * @param {string} [options.requestId] - 応答を対応付ける任意の ID
     */
    watchStage(id: string, { requestId }?: {
        requestId?: string;
    }): void;
    /**
     * 通話から退出します。
     */
    leaveCall(): void;
    /**
     * 特定の参加者へ WebRTC シグナル（SDP / ICE）を送信します。
     *
     * @param {object} params
     * @param {string|number} params.to - 送信先のユーザー ID
     * @param {object} params.data - `{ description }` または `{ candidate }`
     * @param {string|number} [params.kind] - 対象ルームの種類（既定は参加中のルーム）
     * @param {string|number} [params.id] - 対象ルームの ID（既定は参加中のルーム）
     */
    sendCallSignal({ to, data, kind, id }?: {
        to: string | number;
        data: object;
        kind?: string | number;
        id?: string | number;
    }): void;
    /**
     * 自分のマイク・カメラ・文字起こしの状態を通知します。
     *
     * @param {object} [params]
     * @param {boolean} [params.muted]
     * @param {boolean} [params.camera]
     * @param {boolean} [params.transcriptionEnabled]
     * @param {boolean} [params.transcription_enabled]
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    setCallState({ muted, camera, transcriptionEnabled, transcription_enabled, kind, id }?: {
        muted?: boolean;
        camera?: boolean;
        transcriptionEnabled?: boolean;
        transcription_enabled?: boolean;
        kind?: string | number;
        id?: string | number;
    }): void;
    /**
     * ステージのホストとして参加者を操作します。
     *
     * @param {object} params
     * @param {string|number} params.target - 対象ユーザー ID
     * @param {'mute'|'camera'|'chat'|'kick'|'pin'|'promote'|'demote'} params.action - 操作
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    moderateCall({ target, action, kind, id }?: {
        target: string | number;
        action: "mute" | "camera" | "chat" | "kick" | "pin" | "promote" | "demote";
        kind?: string | number;
        id?: string | number;
    }): void;
    /**
     * 画面共有の開始・終了を通知します。
     *
     * @param {object} params
     * @param {boolean} params.active - 共有中かどうか
     * @param {string} [params.streamId] - 共有ストリーム ID（開始時は必須）
     * @param {string} [params.stream_id]
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    setCallScreen({ active, streamId, stream_id, kind, id }?: {
        active: boolean;
        streamId?: string;
        stream_id?: string;
        kind?: string | number;
        id?: string | number;
    }): void;
    /**
     * 通話チャットを送信します。
     *
     * @param {object} params
     * @param {string} params.text - 本文（最大2000文字）
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    sendCallChat({ text, kind, id }?: {
        text: string;
        kind?: string | number;
        id?: string | number;
    }): void;
    /**
     * 通話チャットのメッセージを削除します（自分のメッセージ、またはホストは全員のメッセージ）。
     *
     * @param {object} params
     * @param {string} params.messageId - 削除するチャットメッセージ ID
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    deleteCallChatMessage({ messageId, kind, id }?: {
        messageId: string;
        kind?: string | number;
        id?: string | number;
    }): void;
    /**
     * 通話チャットを全消去します（ホストのみ）。
     *
     * @param {object} [params]
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    clearCallChat({ kind, id }?: {
        kind?: string | number;
        id?: string | number;
    }): void;
    /**
     * 文字起こしを送信します（スピーカー・ミュート解除中のみ）。
     *
     * @param {object} params
     * @param {string} params.text - 本文（最大2000文字）
     * @param {string|number} [params.kind]
     * @param {string|number} [params.id]
     */
    sendCallTranscript({ text, kind, id }?: {
        text: string;
        kind?: string | number;
        id?: string | number;
    }): void;
    /**
     * 現在購読中のスペース ID 一覧を返します。
     * @returns {string[]}
     */
    get spaceSubscriptions(): string[];
    /**
     * スペースのテキストメッセージをリアルタイム受信できるよう購読します。
     * サーバーは接続ユーザーがスペースのメンバーであることを毎回確認します。
     *
     * @param {string|number} spaceId - スペース ID
     */
    subscribeSpace(spaceId: string | number): void;
    /**
     * スペースの購読を解除します。
     *
     * @param {string|number} spaceId - スペース ID
     */
    unsubscribeSpace(spaceId: string | number): void;
    /**
     * スペースのボイスチャンネルに参加します。
     * 参加者一覧は `'spaceVoiceRoster'` イベントで届きます。
     *
     * @param {object} params
     * @param {string|number} params.spaceId - スペース ID
     * @param {string|number} params.channelId - ボイスチャンネル ID
     * @param {boolean} [params.muted] - 初期ミュート状態
     * @param {boolean} [params.deafened] - 初期スピーカーオフ状態
     */
    joinSpaceVoice({ spaceId, channelId, muted, deafened }?: {
        spaceId: string | number;
        channelId: string | number;
        muted?: boolean;
        deafened?: boolean;
    }): void;
    /**
     * スペースのボイスチャンネルから退出します。
     *
     * @param {object} params
     * @param {string|number} params.spaceId - スペース ID
     * @param {string|number} params.channelId - ボイスチャンネル ID
     */
    leaveSpaceVoice({ spaceId, channelId }?: {
        spaceId: string | number;
        channelId: string | number;
    }): void;
    /**
     * スペースボイスでの自分のミュート・スピーカー状態を通知します。
     * 指定しなかった項目はサーバー側で変更されません。
     *
     * @param {object} params
     * @param {string|number} params.spaceId - スペース ID
     * @param {string|number} params.channelId - ボイスチャンネル ID
     * @param {boolean} [params.muted]
     * @param {boolean} [params.deafened]
     */
    setSpaceVoiceState({ spaceId, channelId, muted, deafened }?: {
        spaceId: string | number;
        channelId: string | number;
        muted?: boolean;
        deafened?: boolean;
    }): void;
    /**
     * 同じボイスチャンネルにいる特定の参加者へ WebRTC シグナル（SDP / ICE）を送信します。
     * 相手には `'spaceSignal'` イベントで届きます。
     *
     * @param {object} params
     * @param {string|number} params.spaceId - スペース ID
     * @param {string|number} params.channelId - ボイスチャンネル ID
     * @param {string|number} params.toUserId - 送信先のユーザー ID
     * @param {object} params.data - `{ description }` または `{ candidate }`
     */
    sendSpaceSignal({ spaceId, channelId, toUserId, data }?: {
        spaceId: string | number;
        channelId: string | number;
        toUserId: string | number;
        data: object;
    }): void;
}
