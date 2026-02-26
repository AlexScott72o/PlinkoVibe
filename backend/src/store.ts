import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const SESSIONS_PATH = join(DATA_DIR, 'sessions.json');
const HISTORY_PATH = join(DATA_DIR, 'history.json');

export interface SessionRecord {
  sessionId: string;
  balance: number;
  createdAt: number;
}

export interface HistoryRecord {
  sessionId: string;
  roundId: string;
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

function loadSessions() {
  ensureDataDir();
  if (!existsSync(SESSIONS_PATH)) return;
  try {
    const data = JSON.parse(readFileSync(SESSIONS_PATH, 'utf-8')) as SessionRecord[];
    sessions.clear();
    data.forEach((s) => sessions.set(s.sessionId, s));
  } catch {
    // ignore
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
    // ignore
  }
}

function persistSessions() {
  ensureDataDir();
  const arr = Array.from(sessions.values());
  writeFileSync(SESSIONS_PATH, JSON.stringify(arr, null, 2), 'utf-8');
}

function persistHistory() {
  ensureDataDir();
  const arr = Array.from(historyBySession.values()).flat();
  arr.sort((a, b) => a.timestamp - b.timestamp);
  writeFileSync(HISTORY_PATH, JSON.stringify(arr, null, 2), 'utf-8');
}

export function initStore() {
  loadSessions();
  loadHistory();
}

export function getSession(sessionId: string): SessionRecord | undefined {
  return sessions.get(sessionId);
}

export function createSession(sessionId: string, initialBalance: number): SessionRecord {
  const record: SessionRecord = {
    sessionId,
    balance: initialBalance,
    createdAt: Date.now(),
  };
  sessions.set(sessionId, record);
  persistSessions();
  return record;
}

export function updateBalance(sessionId: string, newBalance: number): void {
  const s = sessions.get(sessionId);
  if (s) {
    s.balance = newBalance;
    persistSessions();
  }
}

export function appendHistory(record: HistoryRecord): void {
  const list = historyBySession.get(record.sessionId) ?? [];
  list.push(record);
  historyBySession.set(record.sessionId, list);
  persistHistory();
}

export function getHistory(sessionId: string, limit: number): HistoryRecord[] {
  const list = historyBySession.get(sessionId) ?? [];
  return list.slice(-limit).reverse();
}
