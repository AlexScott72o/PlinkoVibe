import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Currency } from 'shared';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

const USERS_PATH = join(DATA_DIR, 'users.json');
const GUESTS_PATH = join(DATA_DIR, 'guests.json');
const TRANSACTIONS_PATH = join(DATA_DIR, 'transactions.json');

/** All balances stored as integer minor units (cents/pence). 100,000 = $1,000.00 */
export const INITIAL_FUN_BALANCE_CENTS = 100_000;

/** Guest sessions expire after 7 days of inactivity. */
const GUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export const MAX_REGISTERED_USERS = 50_000;
export const MAX_GUEST_SESSIONS = 10_000;

// ---------------------------------------------------------------------------
// Data model types
// ---------------------------------------------------------------------------

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
  playerId: string; // userId or guestSessionId
  type: TransactionType;
  amount: number; // minor units
  currency: Currency;
  roundId?: string;
  balanceAfter: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

const usersByUsername = new Map<string, UserRecord>();
const usersById = new Map<string, UserRecord>();
const guests = new Map<string, GuestRecord>();
const transactions: TransactionRecord[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function atomicWriteSync(filePath: string, data: string): void {
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, filePath);
}

function freshWallets(): WalletMap {
  return { FUN: INITIAL_FUN_BALANCE_CENTS, USD: 0, EUR: 0, GBP: 0, CAD: 0 };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadUsers() {
  ensureDataDir();
  if (!existsSync(USERS_PATH)) return;
  try {
    const data = JSON.parse(readFileSync(USERS_PATH, 'utf-8')) as UserRecord[];
    usersByUsername.clear();
    usersById.clear();
    data.forEach((u) => {
      usersByUsername.set(u.username, u);
      usersById.set(u.userId, u);
    });
  } catch {
    logger.warn('Failed to load users from disk; starting with empty store');
  }
}

function loadGuests() {
  ensureDataDir();
  if (!existsSync(GUESTS_PATH)) return;
  try {
    const data = JSON.parse(readFileSync(GUESTS_PATH, 'utf-8')) as GuestRecord[];
    guests.clear();
    data.forEach((g) => {
      if (!g.lastActiveAt) g.lastActiveAt = g.createdAt;
      guests.set(g.sessionId, g);
    });
  } catch {
    logger.warn('Failed to load guests from disk; starting with empty store');
  }
}

function loadTransactions() {
  ensureDataDir();
  if (!existsSync(TRANSACTIONS_PATH)) return;
  try {
    const data = JSON.parse(readFileSync(TRANSACTIONS_PATH, 'utf-8')) as TransactionRecord[];
    transactions.length = 0;
    transactions.push(...data);
  } catch {
    logger.warn('Failed to load transactions from disk; starting with empty store');
  }
}

function persistUsers() {
  ensureDataDir();
  atomicWriteSync(USERS_PATH, JSON.stringify(Array.from(usersById.values()), null, 2));
}

function persistGuests() {
  ensureDataDir();
  atomicWriteSync(GUESTS_PATH, JSON.stringify(Array.from(guests.values()), null, 2));
}

function persistTransactions() {
  ensureDataDir();
  // Keep last 100,000 transactions to prevent unbounded growth
  const trimmed = transactions.slice(-100_000);
  atomicWriteSync(TRANSACTIONS_PATH, JSON.stringify(trimmed, null, 2));
}

function cleanupGuests(): void {
  const cutoff = Date.now() - GUEST_TTL_MS;
  let removed = 0;
  for (const [id, g] of guests) {
    if (g.lastActiveAt < cutoff) {
      guests.delete(id);
      removed++;
    }
  }
  if (removed > 0) {
    persistGuests();
    logger.info({ removed }, 'Expired guest sessions cleaned up');
  }
}

export function initStore() {
  try {
    ensureDataDir();
  } catch (err) {
    logger.error({ err, dataDir: DATA_DIR }, 'Could not create PAM data directory');
    throw err;
  }
  loadUsers();
  loadGuests();
  loadTransactions();
  cleanupGuests();
  setInterval(cleanupGuests, CLEANUP_INTERVAL_MS).unref();
  logger.info(
    { users: usersById.size, guests: guests.size, transactions: transactions.length, dataDir: DATA_DIR },
    'PAM store initialised'
  );
}

// ---------------------------------------------------------------------------
// User CRUD
// ---------------------------------------------------------------------------

export function getUserByUsername(username: string): UserRecord | undefined {
  return usersByUsername.get(username.toLowerCase());
}

export function getUserById(userId: string): UserRecord | undefined {
  return usersById.get(userId);
}

export function userCount(): number {
  return usersById.size;
}

export function createUser(record: UserRecord): void {
  const normalised = { ...record, username: record.username.toLowerCase() };
  usersByUsername.set(normalised.username, normalised);
  usersById.set(normalised.userId, normalised);
  persistUsers();
}

export function updateUser(record: UserRecord): void {
  usersByUsername.set(record.username.toLowerCase(), record);
  usersById.set(record.userId, record);
  persistUsers();
}

// ---------------------------------------------------------------------------
// Guest CRUD
// ---------------------------------------------------------------------------

export function getGuest(sessionId: string): GuestRecord | undefined {
  return guests.get(sessionId);
}

export function guestCount(): number {
  return guests.size;
}

export function createGuest(record: GuestRecord): void {
  guests.set(record.sessionId, record);
  persistGuests();
}

export function updateGuestBalance(sessionId: string, newBalance: number): void {
  const g = guests.get(sessionId);
  if (g) {
    g.balance = newBalance;
    g.lastActiveAt = Date.now();
    persistGuests();
  }
}

// ---------------------------------------------------------------------------
// Transaction log
// ---------------------------------------------------------------------------

export function appendTransaction(record: TransactionRecord): void {
  transactions.push(record);
  persistTransactions();
}

export function getTransactionById(transactionId: string): TransactionRecord | undefined {
  return transactions.find((t) => t.transactionId === transactionId);
}
