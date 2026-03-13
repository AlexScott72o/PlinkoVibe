import type { Currency } from 'shared';
export interface HistoryRecord {
    /** The player key: userId for registered players, guestSessionId for guests. */
    playerKey: string;
    roundId: string;
    /** All monetary fields stored as integer cents. */
    bet: number;
    slotIndex: number;
    multiplier: number;
    win: number;
    balance: number;
    currency: Currency;
    timestamp: number;
}
export declare function initStore(): void;
export declare function appendHistory(record: HistoryRecord): void;
export declare function getHistory(playerKey: string, limit: number): HistoryRecord[];
