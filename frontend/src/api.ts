/**
 * API client. Outcome (slotIndex, multiplier, win) is only ever received
 * in the response of POST /api/plinko/bet — never requested or computed earlier.
 */
import type {
  SessionResponse,
  ConfigResponse,
  BetRequest,
  PlaceBetResponse,
  BalanceResponse,
  HistoryResponse,
} from 'shared';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function getSessionId(): string | null {
  return localStorage.getItem('plinko_sessionId');
}

function setSessionId(id: string): void {
  localStorage.setItem('plinko_sessionId', id);
}

export async function ensureSession(): Promise<SessionResponse> {
  const existing = getSessionId();
  if (existing) {
    try {
      const res = await fetch(`${BASE}/api/balance?sessionId=${encodeURIComponent(existing)}`);
      if (res.ok) {
        const data: BalanceResponse = await res.json();
        return { sessionId: existing, balance: data.balance };
      }
    } catch {
      // fall through to create new
    }
  }
  const res = await fetch(`${BASE}/api/session`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create session');
  const data: SessionResponse = await res.json();
  setSessionId(data.sessionId);
  return data;
}

export async function getConfig(sessionId: string): Promise<ConfigResponse> {
  const res = await fetch(`${BASE}/api/config?sessionId=${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error('Failed to get config');
  return res.json();
}

export async function placeBet(body: BetRequest): Promise<PlaceBetResponse> {
  const res = await fetch(`${BASE}/api/plinko/bet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Bet failed');
  }
  return res.json();
}

export async function getBalance(sessionId: string): Promise<number> {
  const res = await fetch(`${BASE}/api/balance?sessionId=${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error('Failed to get balance');
  const data: BalanceResponse = await res.json();
  return data.balance;
}

export async function getHistory(sessionId: string, limit = 20): Promise<HistoryResponse> {
  const res = await fetch(
    `${BASE}/api/history?sessionId=${encodeURIComponent(sessionId)}&limit=${limit}`
  );
  if (!res.ok) throw new Error('Failed to get history');
  return res.json();
}
