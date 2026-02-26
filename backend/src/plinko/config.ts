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
    multipliers: [58, 14.5, 5.6, 3.5, 1.8, 1, 1.8, 3.5, 5.6, 14.5, 58],
    weights: [0.001, 0.01, 0.044, 0.117, 0.205, 0.246, 0.205, 0.117, 0.044, 0.01, 0.001],
  },
  '10_high': {
    multipliers: [110, 41, 10, 5, 2, 0.5, 2, 5, 10, 41, 110],
    weights: [0.001, 0.01, 0.044, 0.117, 0.205, 0.246, 0.205, 0.117, 0.044, 0.01, 0.001],
  },
  // 12 rows -> 13 slots
  '12_low': {
    multipliers: [8, 3, 1.5, 1.1, 0.9, 0.7, 0.5, 0.7, 0.9, 1.1, 1.5, 3, 8],
    weights: [0.0002, 0.003, 0.016, 0.054, 0.121, 0.193, 0.226, 0.193, 0.121, 0.054, 0.016, 0.003, 0.0002],
  },
  '12_medium': {
    multipliers: [50, 15, 5, 2.5, 1.2, 0.8, 0.5, 0.8, 1.2, 2.5, 5, 15, 50],
    weights: [0.0002, 0.003, 0.016, 0.054, 0.121, 0.193, 0.226, 0.193, 0.121, 0.054, 0.016, 0.003, 0.0002],
  },
  '12_high': {
    multipliers: [200, 50, 15, 5, 2, 0.5, 0.2, 0.5, 2, 5, 15, 50, 200],
    weights: [0.0002, 0.003, 0.016, 0.054, 0.121, 0.193, 0.226, 0.193, 0.121, 0.054, 0.016, 0.003, 0.0002],
  },
  // 14 rows -> 15 slots
  '14_low': {
    multipliers: [6, 2.5, 1.3, 1, 0.8, 0.6, 0.5, 0.6, 0.8, 1, 1.3, 2.5, 6, 2.5, 6],
    weights: [0.00006, 0.001, 0.006, 0.022, 0.061, 0.122, 0.183, 0.209, 0.183, 0.122, 0.061, 0.022, 0.006, 0.001, 0.00006],
  },
  '14_medium': {
    multipliers: [41, 12, 4, 2, 1, 0.7, 0.5, 0.7, 1, 2, 4, 12, 41, 12, 41],
    weights: [0.00006, 0.001, 0.006, 0.022, 0.061, 0.122, 0.183, 0.209, 0.183, 0.122, 0.061, 0.022, 0.006, 0.001, 0.00006],
  },
  '14_high': {
    multipliers: [1000, 130, 26, 9, 3, 1, 0.3, 0.2, 0.3, 1, 3, 9, 26, 130, 1000],
    weights: [0.00006, 0.001, 0.006, 0.022, 0.061, 0.122, 0.183, 0.209, 0.183, 0.122, 0.061, 0.022, 0.006, 0.001, 0.00006],
  },
};

export function getConfig(rows: number, risk: string): SlotConfig | undefined {
  const key = configKey(rows, risk);
  return CONFIGS[key];
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
