/**
 * 投票 API
 * 投稿に添付された投票の取得・投票実行を行います。
 */
export class PollsAPI {
    /** @param {import('../NyaitterClient.js').NyaitterClient} client */
    constructor(client: import("../NyaitterClient.js").NyaitterClient);
    _client: import("../NyaitterClient.js").NyaitterClient;
    /**
     * 投票データを取得します。
     *
     * @param {string} pollId - 投票 ID
     * @returns {Promise<{ poll: object }>}
     *
     * @example
     * const { poll } = await client.polls.get('poll-id');
     * console.log('選択肢:', poll.options);
     */
    get(pollId: string): Promise<{
        poll: object;
    }>;
    /**
     * 投票を実行します。
     *
     * @param {string} pollId - 投票 ID
     * @param {object} params
     * @param {number[]|number} [params.optionIds] - 投票する選択肢のインデックス配列
     * @param {string} [params.otherText] - 「その他」選択時の自由記述テキスト
     * @returns {Promise<{ poll: object }>}
     *
     * @example
     * const { poll } = await client.polls.vote('poll-id', {
     *   optionIds: [0],
     * });
     */
    vote(pollId: string, { optionIds, otherText }?: {
        optionIds?: number[] | number;
        otherText?: string;
    }): Promise<{
        poll: object;
    }>;
}
