export const TRUST_COLORS = Object.freeze({
    Trusted: '#6416ff',
    Reliable: '#80b3ff',
    Credible: '#c2ffb3',
    Neutral: '#cccccc',
    Questionable: '#f20000',
    Suspicious: '#b30000',
    Banned: '#660000',
    Unknown: '#808080',
});

export const CONTRIBUTION_COLORS = Object.freeze([
    '#89929b', '#86b65c', '#28a390', '#538bdf', '#a16cdb', '#d0a329',
]);

export const RANK_TYPES = Object.freeze(['trust', 'writer', 'reviewer']);
const TRUST_IDS = Object.freeze({
    T: 'Trusted', R: 'Reliable', C: 'Credible', N: 'Neutral',
    Q: 'Questionable', S: 'Suspicious', B: 'Banned', U: 'Unknown',
});
const LABELS = Object.freeze({ writer: 'Writer', reviewer: 'Reviewer' });
const CONTRIBUTION_NAMES = Object.freeze(['New', 'Junior', 'Regular', 'Senior', 'Expert', 'Veteran']);

export function getRankAppearance(type, rankId) {
    if (!RANK_TYPES.includes(type)) return null;
    if (type === 'trust') {
        if (typeof rankId !== 'string') return null;
        const name = Object.hasOwn(TRUST_IDS, rankId) ? TRUST_IDS[rankId] : rankId;
        if (!Object.hasOwn(TRUST_COLORS, name)) return null;
        return { type, id: rankId, color: TRUST_COLORS[name], label: `${name} User` };
    }
    if (!Number.isInteger(rankId) || rankId < 0 || rankId >= CONTRIBUTION_COLORS.length) return null;
    return {
        type, id: rankId,
        color: `color-mix(in srgb, ${CONTRIBUTION_COLORS[rankId]} 60%, var(--text-color))`,
        label: `${CONTRIBUTION_NAMES[rankId]} ${LABELS[type]}`,
    };
}
