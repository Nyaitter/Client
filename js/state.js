export const state = {
    selectedFiles: [],
    currentUser: null,
    realtimeChannel: null,
    realtimeReconnectTimer: null,
    realtimePingTimer: null,
    realtimeReconnectAttempts: 0,
    realtimeShouldReconnect: false,
    realtimeAuthKey: null,
    realtimeSummaryFreshTimer: null,
    currentTimelineTab: 'foryou',
    replyingTo: null,
    quotingPost: null,
    newIconDataUrl: null,
    resetIconToDefault: false,
    newHeaderDataUrl: null,
    resetHeaderToDefault: false,
    settingsSaveInFlight: false,
    settingsSaveQueued: false,
    activeDmId: null,
    lastRenderedMessageId: null,
    pendingRealtimeDmMessages: new Map(),
    activeDmMemberIds: [],
    recommendedUsersCache: null,
    publicProfileCache: new Map(),
    allUsersCache: new Map(),
    pwaRegistrationPromise: null,
    isLoadingMore: false,
    postLoadObserver: undefined,
    currentSearchTab: 'posts',
    currentPagination: { page: 0, hasMore: true, type: null, options: {} },
    isDarkmode:
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches,
    emoji_picker_theme: 'light',
    dmE2EPublicKeyCache: new Map(),
    dmE2ERegisteredUsers: null,
    dmUnreadCounts: new Map(),
    serverClientLimits: null,
};

// Explicit accessors for maximum V8 JIT performance and readability
export const getSelectedFiles = () => state.selectedFiles;
export const setSelectedFiles = (val) => { state.selectedFiles = val; return val; };

export const getCurrentUser = () => state.currentUser;
export const setCurrentUser = (val) => { state.currentUser = val; return val; };

export const getRealtimeChannel = () => state.realtimeChannel;
export const setRealtimeChannel = (val) => { state.realtimeChannel = val; return val; };

export const getRealtimeReconnectTimer = () => state.realtimeReconnectTimer;
export const setRealtimeReconnectTimer = (val) => { state.realtimeReconnectTimer = val; return val; };

export const getRealtimePingTimer = () => state.realtimePingTimer;
export const setRealtimePingTimer = (val) => { state.realtimePingTimer = val; return val; };

export const getRealtimeReconnectAttempts = () => state.realtimeReconnectAttempts;
export const setRealtimeReconnectAttempts = (val) => { state.realtimeReconnectAttempts = val; return val; };

export const getRealtimeShouldReconnect = () => state.realtimeShouldReconnect;
export const setRealtimeShouldReconnect = (val) => { state.realtimeShouldReconnect = val; return val; };

export const getRealtimeAuthKey = () => state.realtimeAuthKey;
export const setRealtimeAuthKey = (val) => { state.realtimeAuthKey = val; return val; };

export const getRealtimeSummaryFreshTimer = () => state.realtimeSummaryFreshTimer;
export const setRealtimeSummaryFreshTimer = (val) => { state.realtimeSummaryFreshTimer = val; return val; };

export const getCurrentTimelineTab = () => state.currentTimelineTab;
export const setCurrentTimelineTab = (val) => { state.currentTimelineTab = val; return val; };

export const getReplyingTo = () => state.replyingTo;
export const setReplyingTo = (val) => { state.replyingTo = val; return val; };

export const getQuotingPost = () => state.quotingPost;
export const setQuotingPost = (val) => { state.quotingPost = val; return val; };

export const getNewIconDataUrl = () => state.newIconDataUrl;
export const setNewIconDataUrl = (val) => { state.newIconDataUrl = val; return val; };

export const getResetIconToDefault = () => state.resetIconToDefault;
export const setResetIconToDefault = (val) => { state.resetIconToDefault = val; return val; };

export const getNewHeaderDataUrl = () => state.newHeaderDataUrl;
export const setNewHeaderDataUrl = (val) => { state.newHeaderDataUrl = val; return val; };

export const getResetHeaderToDefault = () => state.resetHeaderToDefault;
export const setResetHeaderToDefault = (val) => { state.resetHeaderToDefault = val; return val; };

export const getSettingsSaveInFlight = () => state.settingsSaveInFlight;
export const setSettingsSaveInFlight = (val) => { state.settingsSaveInFlight = val; return val; };

export const getSettingsSaveQueued = () => state.settingsSaveQueued;
export const setSettingsSaveQueued = (val) => { state.settingsSaveQueued = val; return val; };

export const getActiveDmId = () => state.activeDmId;
export const setActiveDmId = (val) => { state.activeDmId = val; return val; };

export const getLastRenderedMessageId = () => state.lastRenderedMessageId;
export const setLastRenderedMessageId = (val) => { state.lastRenderedMessageId = val; return val; };

export const getPendingRealtimeDmMessages = () => state.pendingRealtimeDmMessages;
export const setPendingRealtimeDmMessages = (val) => { state.pendingRealtimeDmMessages = val; return val; };

export const getActiveDmMemberIds = () => state.activeDmMemberIds;
export const setActiveDmMemberIds = (val) => { state.activeDmMemberIds = val; return val; };

export const getRecommendedUsersCache = () => state.recommendedUsersCache;
export const setRecommendedUsersCache = (val) => { state.recommendedUsersCache = val; return val; };

export const getPublicProfileCache = () => state.publicProfileCache;
export const setPublicProfileCache = (val) => { state.publicProfileCache = val; return val; };

export const getAllUsersCache = () => state.allUsersCache;
export const setAllUsersCache = (val) => { state.allUsersCache = val; return val; };

export const getPwaRegistrationPromise = () => state.pwaRegistrationPromise;
export const setPwaRegistrationPromise = (val) => { state.pwaRegistrationPromise = val; return val; };

export const getIsLoadingMore = () => state.isLoadingMore;
export const setIsLoadingMore = (val) => { state.isLoadingMore = val; return val; };

export const getPostLoadObserver = () => state.postLoadObserver;
export const setPostLoadObserver = (val) => { state.postLoadObserver = val; return val; };

export const getCurrentSearchTab = () => state.currentSearchTab;
export const setCurrentSearchTab = (val) => { state.currentSearchTab = val; return val; };

export const getCurrentPagination = () => state.currentPagination;
export const setCurrentPagination = (val) => { state.currentPagination = val; return val; };

export const getIsDarkmode = () => state.isDarkmode;
export const setIsDarkmode = (val) => { state.isDarkmode = val; return val; };

export const getEmoji_picker_theme = () => state.emoji_picker_theme;
export const setEmoji_picker_theme = (val) => { state.emoji_picker_theme = val; return val; };

export const getDmE2EPublicKeyCache = () => state.dmE2EPublicKeyCache;
export const setDmE2EPublicKeyCache = (val) => { state.dmE2EPublicKeyCache = val; return val; };

export const getDmE2ERegisteredUsers = () => state.dmE2ERegisteredUsers;
export const setDmE2ERegisteredUsers = (val) => { state.dmE2ERegisteredUsers = val; return val; };

export const getDmUnreadCounts = () => state.dmUnreadCounts;
export const setDmUnreadCounts = (val) => { state.dmUnreadCounts = val; return val; };

export const getServerClientLimits = () => state.serverClientLimits;
export const setServerClientLimits = (val) => { state.serverClientLimits = val; return val; };

