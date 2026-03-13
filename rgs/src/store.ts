import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const SESSIONS_PATH = join(DATA_DIR, 'sessions.json');
const HISTORY_PATH = join(DATA_DIR, 'history.json');

/** Sessions inactive longer than this are eligible for cleanup. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;      // 1 hour
const MAX_SESSIONS = 10_000;
const MAX_HISTORY_PER_SESSION = 500;

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

const sessions = new Map<string, SessionRecord>();
const historyBySession = new Map<string, HistoryRecord[]>();

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** Atomic write: write to a temp file then rename, preventing partial-write corruption on crash. */
function atomicWriteSync(filePath: string, data: string): void {
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, filePath);
}

function loadSessions() {
  ensureDataDir();
  if (!existsSync(SESSIONS_PATH)) return;
  try {
    const data = JSON.parse(readFileSync(SESSIONS_PATH, 'utf-8')) as SessionRecord[];
    sessions.clear();
    data.forEach((s) => {
      // Back-fill lastActiveAt for records that predate this field
      if (!s.lastActiveAt) s.lastActiveAt = s.createdAt;
      sessions.set(s.sessionId, s);
    });
  } catch {
    logger.warn('Failed to load sessions from disk; starting with empty store');
  }
}

function loadHistory() {
  ensureDataDir();
  if (!existsSync(HISTORY_PATH)) return;
  try {
    const data = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8')) as HistoryRecord[];
    historyBySession.clear();
    data.forEach((h) => {
      const list = historyBySession.get(h.sessionId) ?? [];
      list.push(h);
      historyBySession.set(h.sessionId, list);
    });
  } catch {
    logger.warn('Failed to load history from disk; starting with empty history');
  }
}

function persistSessions() {
  ensureDataDir();
  const arr = Array.from(sessions.values());
  atomicWriteSync(SESSIONS_PATH, JSON.stringify(arr, null, 2));
}

function persistHistory() {
  ensureDataDir();
  const arr = Array.from(historyBySession.values()).flat();
  arr.sort((a, b) => a.timestamp - b.timestamp);
  atomicWriteSync(HISTORY_PATH, JSON.stringify(arr, null, 2));
}

function cleanupSessions(): void {
  const now = Date.now();
  const cutoff = now - SESSION_TTL_MS;
  let removed = 0;
  for (const [id, session] of sessions) {
    if (session.lastActiveAt < cutoff) {
      sessions.delete(id);
      historyBySession.delete(id);
      removed++;
    }
  }
  if (removed > 0) {
    persistSessions();
    persistHistory();
    logger.info({ removed }, 'Expired sessions cleaned up');
  }
}

export function initStore() {
  loadSessions();
  loadHistory();
  cleanupSessions();
  setInterval(cleanupSessions, CLEANUP_INTERVAL_MS).unref();
}

export function getSession(sessionId: string): SessionRecord | undefined {
  return sessions.get(sessionId);
}

export function sessionCount(): number {
  return sessions.size;
}

export function createSession(sessionId: string, initialBalance: number, ip?: string): SessionRecord {
  const now = Date.now();
  const record: SessionRecord = {
    sessionId,
    balance: initialBalance,
    createdAt: now,
    lastActiveAt: now,
    ...(ip ? { createdByIp: ip } : {}),
  };
  sessions.set(sessionId, record);
  persistSessions();
  return record;
}

export function updateBalance(sessionId: string, newBalance: number): void {
  const s = sessions.get(sessionId);
  if (s) {
    s.balance = newBalance;
    s.lastActiveAt = Date.now();
    persistSessions();
  }
}

export function appendHistory(record: HistoryRecord): void {
  const list = historyBySession.get(record.sessionId) ?? [];
  list.push(record);
  // Trim to cap to prevent unbounded growth
  if (list.length > MAX_HISTORY_PER_SESSION) {
    list.splice(0, list.length - MAX_HISTORY_PER_SESSION);
  }
  historyBySession.set(record.sessionId, list);
  persistHistory();
}

export function getHistory(sessionId: string, limit: number): HistoryRecord[] {
  const list = historyBySession.get(sessionId) ?? [];
  return list.slice(-limit).reverse();
}

export { MAX_SESSIONS };
