/**
 * Shared types for PlinkoVibe — used by frontend, RGS, and PAM.
 * Outcome is never computed or stored here; only request/response shapes.
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export type RiskLevel = 'low' | 'medium' | 'high';

export type Currency = 'FUN' | 'USD' | 'EUR' | 'GBP' | 'CAD';

export const CURRENCIES: Currency[] = ['FUN', 'USD', 'EUR', 'GBP', 'CAD'];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  FUN: '🎮',
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'C$',
};

// ---------------------------------------------------------------------------
// Auth (PAM public endpoints)
// ---------------------------------------------------------------------------

export interface AuthRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
  username: string;
}

export interface MeResponse {
  userId: string;
  username: string;
}

// ---------------------------------------------------------------------------
// Wallet (PAM public endpoints)
// ---------------------------------------------------------------------------

export interface WalletBalancesResponse {
  balances: Record<Currency, number>;
}

export interface DepositRequest {
  currency: Currency;
  amount: number;
}

export interface DepositResponse {
  currency: Currency;
  balance: number;
}

// ---------------------------------------------------------------------------
// Guest sessions (PAM public endpoints)
// ---------------------------------------------------------------------------

export interface GuestSessionResponse {
  sessionId: string;
  balance: number;
}

export interface GuestBalanceResponse {
  balance: number;
}

// ---------------------------------------------------------------------------
// RGS Game Config
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// RGS Bet API
// ---------------------------------------------------------------------------

/** Bet request body — sent by the frontend to the RGS */
export interface BetRequest {
  /** Guest session ID (for unauthenticated play with FUN currency). */
  guestSessionId?: string;
  betAmount: number;
  rows: number;
  riskLevel: RiskLevel;
  /**
   * Number of balls to resolve in one request (1–100). Defaults to 1.
   * Each ball is an independent bet at `betAmount`; the server processes them
   * all inside a single session lock and returns one result per ball.
   */
  count?: number;
  /** Which wallet to bet from. Guests are restricted to FUN. */
  currency: Currency;
}

/** Result for a single ball within a bet request */
export interface BetResponse {
  slotIndex: number;
  multiplier: number;
  winAmount: number;
  /** Running balance (in major units) after this specific ball's bet resolves. */
  balance: number;
  roundId?: string;
}

/** Response returned by POST /api/plinko/bet for any count (1 or more balls) */
export interface PlaceBetResponse {
  bets: BetResponse[];
}

// ---------------------------------------------------------------------------
// RGS History
// ---------------------------------------------------------------------------

/** Single history entry (past rounds only) */
export interface HistoryEntry {
  roundId: string;
  bet: number;
  slotIndex: number;
  multiplier: number;
  win: number;
  balance: number;
  currency: Currency;
  timestamp?: number;
}

/** History response */
export interface HistoryResponse {
  rounds: HistoryEntry[];
}

// ---------------------------------------------------------------------------
// Internal RGS→PAM seamless wallet types (not used by the frontend)
// ---------------------------------------------------------------------------

export interface InternalBetOutcome {
  transactionId: string;
  roundId: string;
  betAmountCents: number;
  winAmountCents: number;
  slotIndex: number;
  multiplier: number;
}

export interface InternalBetRequest {
  /** For guest play. Mutually exclusive with the Authorization header. */
  guestSessionId?: string;
  currency: Currency;
  bets: InternalBetOutcome[];
}

export interface InternalBetResponseItem {
  roundId: string;
  transactionId: string;
  balanceAfterCents: number;
}

export interface InternalBetResponse {
  bets: InternalBetResponseItem[];
}
