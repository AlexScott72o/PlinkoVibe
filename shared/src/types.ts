/**
 * Shared types for Plinko RGS API (frontend and backend).
 * Outcome is never computed or stored here; only request/response shapes.
 */

export type RiskLevel = 'low' | 'medium' | 'high';

/** Session creation response */
export interface SessionResponse {
  sessionId: string;
  balance: number;
}

/** Paytable: multiplier per slot index (0..rows) */
export type Paytable = number[];

/** Config returned to client (display only; no outcome or RNG state) */
export interface ConfigResponse {
  rows: number[];
  riskLevels: RiskLevel[];
  paytables: Record<string, Paytable>; // key e.g. "8_low", "10_medium"
  defaultRows: number;
  defaultRisk: RiskLevel;
  rtpVariant?: string;
  minBet: number;
  maxBet: number;
}

/** Bet request body */
export interface BetRequest {
  sessionId: string;
  betAmount: number;
  rows: number;
  riskLevel: RiskLevel;
}

/** Bet response (outcome only returned here, after bet is placed) */
export interface BetResponse {
  slotIndex: number;
  multiplier: number;
  winAmount: number;
  balance: number;
  roundId?: string;
}

/** Balance response */
export interface BalanceResponse {
  balance: number;
}

/** Single history entry (past rounds only) */
export interface HistoryEntry {
  roundId: string;
  bet: number;
  slotIndex: number;
  multiplier: number;
  win: number;
  balance: number;
  timestamp?: number;
}

/** History response */
export interface HistoryResponse {
  rounds: HistoryEntry[];
}
