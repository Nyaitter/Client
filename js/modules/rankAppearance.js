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

export const RANK_TYPES = Object.freeze(['trust']);
const TRUST_IDS = Object.freeze({
    T: 'Trusted', R: 'Reliable', C: 'Credible', N: 'Neutral',
    Q: 'Questionable', S: 'Suspicious', B: 'Banned', U: 'Unknown',
});
export function getRankAppearance(type, rankId) {
    if (!RANK_TYPES.includes(type)) return null;
    if (typeof rankId !== 'string') return null;
    const name = Object.hasOwn(TRUST_IDS, rankId) ? TRUST_IDS[rankId] : rankId;
    if (!Object.hasOwn(TRUST_COLORS, name)) return null;
    return { type, id: rankId, color: TRUST_COLORS[name], label: `${name} User` };
}
