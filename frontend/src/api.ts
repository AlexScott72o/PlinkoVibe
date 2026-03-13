/**
 * RGS API client — game config, betting, and round history.
 * Auth and wallet operations live in pamApi.ts.
 * Outcome (slotIndex, multiplier, win) is only ever received
 * in the response of POST /api/plinko/bet — never requested or computed earlier.
 */
import type {
  ConfigResponse,
  BetRequest,
  PlaceBetResponse,
  HistoryResponse,
} from 'shared';
import { getToken } from './pamApi.js';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function rgsHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getConfig(): Promise<ConfigResponse> {
  const res = await fetch(`${BASE}/api/config`);
  if (!res.ok) throw new Error('Failed to get config');
  return res.json();
}

export async function placeBet(body: BetRequest): Promise<PlaceBetResponse> {
  const res = await fetch(`${BASE}/api/plinko/bet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...rgsHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Bet failed');
  }
  return res.json();
}

export async function getHistory(
  guestSessionId: string | null,
  limit = 20
): Promise<HistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (guestSessionId) params.set('guestSessionId', guestSessionId);
  const res = await fetch(`${BASE}/api/history?${params.toString()}`, {
    headers: rgsHeaders(),
  });
  if (!res.ok) throw new Error('Failed to get history');
  return res.json();
}
