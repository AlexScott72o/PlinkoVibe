/**
 * Plinko paytables and probability weights per (rows, risk).
 * RTP = sum(weight[i] * multiplier[i]). One RTP variant (~96.5%) initially.
 * Weights are binomial-like (higher in center, rare at edges).
 */

export const ALLOWED_ROWS = [8, 10, 12, 14] as const;
export const ALLOWED_RISK = ['low', 'medium', 'high'] as const;
export const DEFAULT_ROWS = 10;
export const DEFAULT_RISK = 'medium';
export const MIN_BET = 0.1;
export const MAX_BET = 1000;
export const INITIAL_BALANCE = 1000;

export type RiskLevel = (typeof ALLOWED_RISK)[number];

export interface SlotConfig {
  multipliers: number[];
  weights: number[]; // normalized to sum to 1
}

function configKey(rows: number, risk: string): string {
  return `${rows}_${risk}`;
}

// Precomputed configs: (rows, risk) -> { multipliers, weights }
// Weights are binomial-like; multipliers set for ~96.5% RTP.
const CONFIGS: Record<string, SlotConfig> = {
  // 8 rows -> 9 slots
  '8_low': {
    multipliers: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    weights: [0.004, 0.031, 0.109, 0.219, 0.273, 0.219, 0.109, 0.031, 0.004],
  },
  '8_medium': {
    multipliers: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    weights: [0.004, 0.031, 0.109, 0.219, 0.273, 0.219, 0.109, 0.031, 0.004],
  },
  '8_high': {
    multipliers: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    weights: [0.004, 0.031, 0.109, 0.219, 0.273, 0.219, 0.109, 0.031, 0.004],
  },
  // 10 rows -> 11 slots
  '10_low': {
    multipliers: [11, 3.5, 1.8, 1.2, 0.8, 0.5, 0.8, 1.2, 1.8, 3.5, 11],
    weights: [0.001, 0.01, 0.044, 0.117, 0.205, 0.246, 0.205, 0.117, 0.044, 0.01, 0.001],
  },
  '10_medium': {
    multipliers: [20.7, 5.2, 2, 1.25, 0.64, 0.36, 0.64, 1.25, 2, 5.2, 20.7],
    weights: [0.001, 0.01, 0.044, 0.117, 0.205, 0.246, 0.205, 0.117, 0.044, 0.01, 0.001],
  },
  '10_high': {
    multipliers: [26.3, 9.8, 2.4, 1.2, 0.48, 0.12, 0.48, 1.2, 2.4, 9.8, 26.3],
    weights: [0.001, 0.01, 0.044, 0.117, 0.205, 0.246, 0.205, 0.117, 0.044, 0.01, 0.001],
  },
  // 12 rows -> 13 slots
  '12_low': {
    multipliers: [9.8, 3.7, 1.84, 1.35, 1.1, 0.86, 0.61, 0.86, 1.1, 1.35, 1.84, 3.7, 9.8],
    weights: [0.0002, 0.003, 0.016, 0.054, 0.121, 0.193, 0.226, 0.193, 0.121, 0.054, 0.016, 0.003, 0.0002],
  },
  '12_medium': {
    multipliers: [38.5, 11.6, 3.85, 1.93, 0.92, 0.62, 0.39, 0.62, 0.92, 1.93, 3.85, 11.6, 38.5],
    weights: [0.0002, 0.003, 0.016, 0.054, 0.121, 0.193, 0.226, 0.193, 0.121, 0.054, 0.016, 0.003, 0.0002],
  },
  '12_high': {
    multipliers: [91, 22.7, 6.8, 2.3, 0.91, 0.23, 0.09, 0.23, 0.91, 2.3, 6.8, 22.7, 91],
    weights: [0.0002, 0.003, 0.016, 0.054, 0.121, 0.193, 0.226, 0.193, 0.121, 0.054, 0.016, 0.003, 0.0002],
  },
  // 14 rows -> 15 slots (symmetric; 8 distinct values strictly decreasing to center so no middle repetition)
  '14_low': {
    multipliers: [10.85, 4.57, 2.51, 1.71, 1.26, 1.03, 0.86, 0.63, 0.86, 1.03, 1.26, 1.71, 2.51, 4.57, 10.85],
    weights: [0.00006, 0.001, 0.006, 0.022, 0.061, 0.122, 0.183, 0.209, 0.183, 0.122, 0.061, 0.022, 0.006, 0.001, 0.00006],
  },
  '14_medium': {
    multipliers: [55.91, 16.77, 5.59, 2.8, 1.34, 0.95, 0.67, 0.45, 0.67, 0.95, 1.34, 2.8, 5.59, 16.77, 55.91],
    weights: [0.00006, 0.001, 0.006, 0.022, 0.061, 0.122, 0.183, 0.209, 0.183, 0.122, 0.061, 0.022, 0.006, 0.001, 0.00006],
  },
  '14_high': {
    multipliers: [522, 67.8, 13.6, 4.7, 1.56, 0.52, 0.16, 0.1, 0.16, 0.52, 1.56, 4.7, 13.6, 67.8, 522],
    weights: [0.00006, 0.001, 0.006, 0.022, 0.061, 0.122, 0.183, 0.209, 0.183, 0.122, 0.061, 0.022, 0.006, 0.001, 0.00006],
  },
};

/** Normalize weights to sum to 1 for correct sampling. */
function normalizedWeights(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights;
  return weights.map((w) => w / sum);
}

export function getConfig(rows: number, risk: string): SlotConfig | undefined {
  const key = configKey(rows, risk);
  const raw = CONFIGS[key];
  if (!raw) return undefined;
  return {
    multipliers: raw.multipliers,
    weights: normalizedWeights(raw.weights),
  };
}

/**
 * Verify all configs are safe for casino use: RTP in [90%, 100%] using normalized weights.
 * Call at startup or in tests. Throws if any config is invalid.
 */
export function verifyRTP(): void {
  const MIN_RTP = 0.9;
  const MAX_RTP = 1.0;
  for (const [key, raw] of Object.entries(CONFIGS)) {
    const weights = normalizedWeights(raw.weights);
    const rtp = weights.reduce((acc, w, i) => acc + w * (raw.multipliers[i] ?? 0), 0);
    if (rtp > MAX_RTP) {
      throw new Error(`Plinko config ${key}: RTP ${(rtp * 100).toFixed(2)}% exceeds 100% (house would lose)`);
    }
    if (rtp < MIN_RTP) {
      throw new Error(`Plinko config ${key}: RTP ${(rtp * 100).toFixed(2)}% below ${MIN_RTP * 100}%`);
    }
  }
}

export function getPaytable(rows: number, risk: string): number[] | undefined {
  return getConfig(rows, risk)?.multipliers;
}

export function getAllPaytables(): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(CONFIGS)) {
    out[k] = v.multipliers;
  }
  return out;
}

// Ensure all paytables are safe for casino use (RTP ≤ 100%) on load.
verifyRTP();
