import type { Currency } from 'shared';
/** All balances stored as integer minor units (cents/pence). 100,000 = $1,000.00 */
export declare const INITIAL_FUN_BALANCE_CENTS = 100000;
export declare const MAX_REGISTERED_USERS = 50000;
export declare const MAX_GUEST_SESSIONS = 10000;
export type WalletMap = Record<Currency, number>;
export interface UserRecord {
    userId: string;
    username: string;
    passwordHash: string;
    createdAt: number;
    lastLoginAt: number;
    createdByIp: string;
    wallets: WalletMap;
}
export interface GuestRecord {
    sessionId: string;
    /** FUN balance in minor units. */
    balance: number;
    createdAt: number;
    lastActiveAt: number;
    createdByIp?: string;
}
export type TransactionType = 'debit' | 'credit' | 'deposit';
export interface TransactionRecord {
    transactionId: string;
    playerId: string;
    type: TransactionType;
    amount: number;
    currency: Currency;
    roundId?: string;
    balanceAfter: number;
    timestamp: number;
}
export declare function initStore(): void;
export declare function getUserByUsername(username: string): UserRecord | undefined;
export declare function getUserById(userId: string): UserRecord | undefined;
export declare function userCount(): number;
export declare function createUser(record: UserRecord): void;
export declare function updateUser(record: UserRecord): void;
export declare function getGuest(sessionId: string): GuestRecord | undefined;
export declare function guestCount(): number;
export declare function createGuest(record: GuestRecord): void;
export declare function updateGuestBalance(sessionId: string, newBalance: number): void;
export declare function appendTransaction(record: TransactionRecord): void;
export declare function getTransactionById(transactionId: string): TransactionRecord | undefined;
