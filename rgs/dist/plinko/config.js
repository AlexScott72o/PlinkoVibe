/**
 * Plinko paytables and probability weights per (rows, risk).
 * RTP = sum(weight[i] * multiplier[i]). Target ~94% per config.
 * Weights are binomial-like (higher in center, rare at edges).
 */
export const ALLOWED_ROWS = [8, 10, 12, 14];
export const ALLOWED_RISK = ['low', 'medium', 'high'];
export const DEFAULT_ROWS = 10;
export const DEFAULT_RISK = 'medium';
/** Dollar-denominated constants exposed to the frontend for display. */
export const MIN_BET = 0.1;
export const MAX_BET = 1000;
export const INITIAL_BALANCE = 1000;
/** Cent-denominated constants for internal arithmetic. All balances stored as integer cents. */
export const MIN_BET_CENTS = 10; // $0.10
export const MAX_BET_CENTS = 100_000; // $1000.00
export const INITIAL_BALANCE_CENTS = 100_000; // $1000.00
/** Maximum number of balls that can be resolved in a single batch bet request. */
export const MAX_BET_COUNT = 100;
function configKey(rows, risk) {
    return `${rows}_${risk}`;
}
// Precomputed configs: (rows, risk) -> { multipliers, weights }
// Weights are binomial-like. Multipliers symmetric, round where possible, target RTP ~94%.
const CONFIGS = {
    // 8 rows -> 9 slots
    '8_low': {
        multipliers: [5, 2, 1.1, 0.9, 0.5, 0.9, 1.1, 2, 5],
        weights: [0.004, 0.031, 0.109, 0.219, 0.273, 0.219, 0.109, 0.031, 0.004],
    },
    '8_medium': {
        multipliers: [11, 3, 1.2, 0.7, 0.35, 0.7, 1.2, 3, 11],
        weights: [0.004, 0.031, 0.109, 0.219, 0.273, 0.219, 0.109, 0.031, 0.004],
    },
    '8_high': {
        multipliers: [21, 4, 1.5, 0.32, 0.2, 0.32, 1.5, 4, 21],
        weights: [0.004, 0.031, 0.109, 0.219, 0.273, 0.219, 0.109, 0.031, 0.004],
    },
    // 10 rows -> 11 slots
    '10_low': {
        multipliers: [10, 3.5, 1.7, 1.1, 0.8, 0.5, 0.8, 1.1, 1.7, 3.5, 10],
        weights: [0.001, 0.01, 0.044, 0.117, 0.205, 0.246, 0.205, 0.117, 0.044, 0.01, 0.001],
    },
    '10_medium': {
        multipliers: [26, 5, 2, 1.2, 0.6, 0.35, 0.6, 1.2, 2, 5, 26],
        weights: [0.001, 0.01, 0.044, 0.117, 0.205, 0.246, 0.205, 0.117, 0.044, 0.01, 0.001],
    },
    '10_high': {
        multipliers: [72, 9, 2.2, 0.9, 0.45, 0.1, 0.45, 0.9, 2.2, 9, 72],
        weights: [0.001, 0.01, 0.044, 0.117, 0.205, 0.246, 0.205, 0.117, 0.044, 0.01, 0.001],
    },
    // 12 rows -> 13 slots
    '12_low': {
        multipliers: [22, 4, 1.9, 1.3, 1, 0.85, 0.6, 0.85, 1, 1.3, 1.9, 4, 22],
        weights: [0.0002, 0.003, 0.016, 0.054, 0.121, 0.193, 0.226, 0.193, 0.121, 0.054, 0.016, 0.003, 0.0002],
    },
    '12_medium': {
        multipliers: [50, 11, 3.5, 1.8, 0.9, 0.6, 0.4, 0.6, 0.9, 1.8, 3.5, 11, 50],
        weights: [0.0002, 0.003, 0.016, 0.054, 0.121, 0.193, 0.226, 0.193, 0.121, 0.054, 0.016, 0.003, 0.0002],
    },
    '12_high': {
        multipliers: [70, 20, 5.5, 2.2, 0.9, 0.35, 0.1, 0.35, 0.9, 2.2, 5.5, 20, 70],
        weights: [0.0002, 0.003, 0.016, 0.054, 0.121, 0.193, 0.226, 0.193, 0.121, 0.054, 0.016, 0.003, 0.0002],
    },
    // 14 rows -> 15 slots
    '14_low': {
        multipliers: [18, 5.5, 2.6, 1.7, 1.2, 1.05, 0.8, 0.6, 0.8, 1.05, 1.2, 1.7, 2.6, 5.5, 18],
        weights: [0.00006, 0.001, 0.006, 0.022, 0.061, 0.122, 0.183, 0.209, 0.183, 0.122, 0.061, 0.022, 0.006, 0.001, 0.00006],
    },
    '14_medium': {
        multipliers: [65, 18, 6, 2.8, 1.4, 0.9, 0.6, 0.4, 0.6, 0.9, 1.4, 2.8, 6, 18, 65],
        weights: [0.00006, 0.001, 0.006, 0.022, 0.061, 0.122, 0.183, 0.209, 0.183, 0.122, 0.061, 0.022, 0.006, 0.001, 0.00006],
    },
    '14_high': {
        multipliers: [480, 67, 13.5, 4.3, 1.5, 0.5, 0.2, 0.1, 0.2, 0.5, 1.5, 4.3, 13.5, 67, 480],
        weights: [0.00006, 0.001, 0.006, 0.022, 0.061, 0.122, 0.183, 0.209, 0.183, 0.122, 0.061, 0.022, 0.006, 0.001, 0.00006],
    },
};
/** Normalize weights to sum to 1 for correct sampling. */
function normalizedWeights(weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0)
        return weights;
    return weights.map((w) => w / sum);
}
export function getConfig(rows, risk) {
    const key = configKey(rows, risk);
    const raw = CONFIGS[key];
    if (!raw)
        return undefined;
    return {
        multipliers: raw.multipliers,
        weights: normalizedWeights(raw.weights),
    };
}
/**
 * Compute RTP for a config using normalized weights. RTP = sum(weight[i] * multiplier[i]).
 */
export function computeRTP(raw) {
    const weights = normalizedWeights(raw.weights);
    return weights.reduce((acc, w, i) => acc + w * (raw.multipliers[i] ?? 0), 0);
}
/**
 * Returns RTP (as decimal 0–1) for each configuration key. Useful for verification and reporting.
 */
export function getRTPReport() {
    const report = {};
    for (const [key, raw] of Object.entries(CONFIGS)) {
        report[key] = computeRTP(raw);
    }
    return report;
}
/**
 * Verify all configs are safe for casino use: RTP in [90%, 100%] using normalized weights.
 * Call at startup or in tests. Throws if any config is invalid.
 */
export function verifyRTP() {
    const MIN_RTP = 0.9;
    const MAX_RTP = 1.0;
    for (const [key, raw] of Object.entries(CONFIGS)) {
        const rtp = computeRTP(raw);
        if (rtp > MAX_RTP) {
            throw new Error(`Plinko config ${key}: RTP ${(rtp * 100).toFixed(2)}% exceeds 100% (house would lose)`);
        }
        if (rtp < MIN_RTP) {
            throw new Error(`Plinko config ${key}: RTP ${(rtp * 100).toFixed(2)}% below ${MIN_RTP * 100}%`);
        }
    }
}
export function getPaytable(rows, risk) {
    return getConfig(rows, risk)?.multipliers;
}
export function getAllPaytables() {
    const out = {};
    for (const [k, v] of Object.entries(CONFIGS)) {
        out[k] = v.multipliers;
    }
    return out;
}
// Ensure all paytables are safe for casino use (RTP ≤ 100%) on load.
verifyRTP();
