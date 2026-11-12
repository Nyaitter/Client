export type TrustRank = "Trusted" | "Reliable" | "Credible" | "Neutral" | "Questionable" | "Suspicious" | "Banned";
export type DisplayRanks = {
    trust: TrustRank;
};
export type DisplayRankOverrides = {
    trust?: TrustRank | null;
};
export type UserSettings = {
    show_ranks?: boolean;
    display_ranks?: DisplayRankOverrides;
    [key: string]: any;
};
export type User = {
    id: number;
    display_ranks?: DisplayRanks | null;
    settings?: UserSettings;
    [key: string]: any;
};
export type RankInfo<T extends string | number> = {
    rank: T;
    label: string;
    description: string;
    requirements: string[];
    benefits: string[];
    restrictions: string[];
};
/**
 * 実ランクは trust、表示用は display_ranks を参照します。実スコアは含みません。
 */
export type UserStatus = {
    trust: RankInfo<TrustRank> & {
        ranks: RankInfo<TrustRank>[];
    };
    display_ranks: DisplayRanks;
    display_rank_options: {
        trust: TrustRank[];
    };
    display_settings: {
        show_ranks: boolean;
        display_ranks: {
            trust: TrustRank | null;
        };
    };
};
export type NoteRatingSummary = {
    helpfulCount: number;
    totalRatingCount: number;
    myRating: boolean | null;
};
export type NoteReasonSide = "create" | "positive" | "negative";
export type NoteReasonTag = {
    code: string;
    side: NoteReasonSide;
    label: string;
    description: string | null;
    sortOrder: number;
};
export type CommunityNote = {
    id: number;
    postId: number;
    userId: number;
    content: string;
    sources: {
        url: string;
        title?: string;
    }[];
    status: "limited" | "review" | "public" | "rejected";
    stage: number;
    publishedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    helpfulCount: number;
    totalRatingCount: number;
    myRating: boolean | null;
    reasons: {
        side: NoteReasonSide;
        code: string;
    }[];
    eligible?: boolean;
};
export type ServerStatus = {
    server: string;
    timestamp: string;
    database: string;
    identity: object;
    client_config: {
        api_endpoint: string;
        user_file_endpoint: string;
        share_url: string;
        post_share_url: string;
        turnstile_site_key: string;
        push: {
            enabled: boolean;
            vapid_public_key: string;
        };
        resource_links: object[];
        widget_links: object[];
        ui: object;
    };
    auth_methods: string[];
    turnstile: {
        enabled: boolean;
    };
    client_limits: object;
};
