/**
 * PAM API client — handles auth, wallet, and guest session calls.
 * Balance-altering bet transactions are NOT made here; they go through the RGS.
 */
import type {
  AuthRequest,
  AuthResponse,
  MeResponse,
  WalletBalancesResponse,
  DepositRequest,
  DepositResponse,
  GuestSessionResponse,
  GuestBalanceResponse,
  Currency,
} from 'shared';

const PAM_BASE = import.meta.env.VITE_PAM_BASE_URL ?? '/pam';

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

const JWT_KEY = 'plinko_jwt';

export function getToken(): string | null {
  return localStorage.getItem(JWT_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(JWT_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(JWT_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function pamFetch<T>(
  path: string,
  options?: RequestInit & { skipAuth?: boolean }
): Promise<T> {
  const { skipAuth, ...fetchOptions } = options ?? {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(skipAuth ? {} : authHeaders()),
    ...(fetchOptions.headers as Record<string, string> | undefined ?? {}),
  };
  const res = await fetch(`${PAM_BASE}${path}`, { ...fetchOptions, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `PAM request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function register(username: string, password: string): Promise<AuthResponse> {
  return pamFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password } satisfies AuthRequest),
    skipAuth: true,
  });
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  return pamFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password } satisfies AuthRequest),
    skipAuth: true,
  });
}

export async function logout(): Promise<void> {
  await pamFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' }).catch(() => null);
  clearToken();
}

export async function getMe(): Promise<MeResponse> {
  return pamFetch<MeResponse>('/auth/me');
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export async function getWalletBalances(): Promise<WalletBalancesResponse> {
  return pamFetch<WalletBalancesResponse>('/wallet/balance');
}

export async function deposit(currency: Currency, amount: number): Promise<DepositResponse> {
  return pamFetch<DepositResponse>('/wallet/deposit', {
    method: 'POST',
    body: JSON.stringify({ currency, amount } satisfies DepositRequest),
  });
}

// ---------------------------------------------------------------------------
// Guest sessions
// ---------------------------------------------------------------------------

const GUEST_SESSION_KEY = 'plinko_guestSessionId';

export function getGuestSessionId(): string | null {
  return localStorage.getItem(GUEST_SESSION_KEY);
}

export function setGuestSessionId(id: string): void {
  localStorage.setItem(GUEST_SESSION_KEY, id);
}

export function clearGuestSession(): void {
  localStorage.removeItem(GUEST_SESSION_KEY);
}

export async function createGuestSession(): Promise<GuestSessionResponse> {
  return pamFetch<GuestSessionResponse>('/guest/session', {
    method: 'POST',
    skipAuth: true,
  });
}

export async function getGuestBalance(sessionId: string): Promise<GuestBalanceResponse> {
  return pamFetch<GuestBalanceResponse>(
    `/guest/balance?sessionId=${encodeURIComponent(sessionId)}`,
    { skipAuth: true }
  );
}
