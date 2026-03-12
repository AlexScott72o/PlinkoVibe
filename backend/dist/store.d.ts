declare const MAX_SESSIONS = 10000;
export interface SessionRecord {
    sessionId: string;
    /** Balance stored as integer cents (e.g. 100000 = $1000.00). */
    balance: number;
    createdAt: number;
    lastActiveAt: number;
    createdByIp?: string;
}
export interface HistoryRecord {
    sessionId: string;
    roundId: string;
    /** All monetary fields stored as integer cents. */
    bet: number;
    slotIndex: number;
    multiplier: number;
    win: number;
    balance: number;
    timestamp: number;
}
export declare function initStore(): void;
export declare function getSession(sessionId: string): SessionRecord | undefined;
export declare function sessionCount(): number;
export declare function createSession(sessionId: string, initialBalance: number, ip?: string): SessionRecord;
export declare function updateBalance(sessionId: string, newBalance: number): void;
export declare function appendHistory(record: HistoryRecord): void;
export declare function getHistory(sessionId: string, limit: number): HistoryRecord[];
export { MAX_SESSIONS };
