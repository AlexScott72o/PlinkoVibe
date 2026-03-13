/**
 * RGS data store — persists round history only.
 * Session and balance management has moved to the PAM service.
 */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Currency } from 'shared';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const HISTORY_PATH = join(DATA_DIR, 'history.json');

const MAX_HISTORY_PER_PLAYER = 500;

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

const historyByPlayer = new Map<string, HistoryRecord[]>();

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

function loadHistory() {
  ensureDataDir();
  if (!existsSync(HISTORY_PATH)) return;
  try {
    const data = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8')) as HistoryRecord[];
    historyByPlayer.clear();
    data.forEach((h) => {
      const list = historyByPlayer.get(h.playerKey) ?? [];
      list.push(h);
      historyByPlayer.set(h.playerKey, list);
    });
  } catch {
    logger.warn('Failed to load history from disk; starting with empty history');
  }
}

function persistHistory() {
  ensureDataDir();
  const arr = Array.from(historyByPlayer.values()).flat();
  arr.sort((a, b) => a.timestamp - b.timestamp);
  atomicWriteSync(HISTORY_PATH, JSON.stringify(arr, null, 2));
}

export function initStore() {
  loadHistory();
  logger.info({ players: historyByPlayer.size }, 'RGS history store initialised');
}

export function appendHistory(record: HistoryRecord): void {
  const list = historyByPlayer.get(record.playerKey) ?? [];
  list.push(record);
  if (list.length > MAX_HISTORY_PER_PLAYER) {
    list.splice(0, list.length - MAX_HISTORY_PER_PLAYER);
  }
  historyByPlayer.set(record.playerKey, list);
  persistHistory();
}

export function getHistory(playerKey: string, limit: number): HistoryRecord[] {
  const list = historyByPlayer.get(playerKey) ?? [];
  return list.slice(-limit).reverse();
}
