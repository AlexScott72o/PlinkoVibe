/**
 * Plinko paytables and probability weights per (rows, risk).
 * RTP = sum(weight[i] * multiplier[i]). Target ~94% per config.
 * Weights are binomial-like (higher in center, rare at edges).
 */
export declare const ALLOWED_ROWS: readonly [8, 10, 12, 14];
export declare const ALLOWED_RISK: readonly ["low", "medium", "high"];
export declare const DEFAULT_ROWS = 10;
export declare const DEFAULT_RISK = "medium";
/** Dollar-denominated constants exposed to the frontend for display. */
export declare const MIN_BET = 0.1;
export declare const MAX_BET = 1000;
export declare const INITIAL_BALANCE = 1000;
/** Cent-denominated constants for internal arithmetic. All balances stored as integer cents. */
export declare const MIN_BET_CENTS = 10;
export declare const MAX_BET_CENTS = 100000;
export declare const INITIAL_BALANCE_CENTS = 100000;
/** Maximum number of balls that can be resolved in a single batch bet request. */
export declare const MAX_BET_COUNT = 100;
export type RiskLevel = (typeof ALLOWED_RISK)[number];
export interface SlotConfig {
    multipliers: number[];
    weights: number[];
}
export declare function getConfig(rows: number, risk: string): SlotConfig | undefined;
/**
 * Compute RTP for a config using normalized weights. RTP = sum(weight[i] * multiplier[i]).
 */
export declare function computeRTP(raw: SlotConfig): number;
/**
 * Returns RTP (as decimal 0–1) for each configuration key. Useful for verification and reporting.
 */
export declare function getRTPReport(): Record<string, number>;
/**
 * Verify all configs are safe for casino use: RTP in [90%, 100%] using normalized weights.
 * Call at startup or in tests. Throws if any config is invalid.
 */
export declare function verifyRTP(): void;
export declare function getPaytable(rows: number, risk: string): number[] | undefined;
export declare function getAllPaytables(): Record<string, number[]>;
