import { useState, useCallback, useEffect } from 'react';
import type { Currency } from 'shared';
import * as pamApi from '../pamApi.js';

export type AuthStatus = 'loading' | 'guest' | 'authenticated';

export interface AuthState {
  status: AuthStatus;
  userId: string | null;
  username: string | null;
  /** Active guest session ID (non-null when status is 'guest'). */
  guestSessionId: string | null;
  /** Current currency selection. Guests are locked to FUN. */
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** Wallet balances in major units (null until loaded for authenticated users). */
  walletBalances: Record<Currency, number> | null;
  refreshWalletBalances: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const [currency, setCurrencyState] = useState<Currency>('FUN');
  const [walletBalances, setWalletBalances] = useState<Record<Currency, number> | null>(null);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
  }, []);

  const refreshWalletBalances = useCallback(async () => {
    if (pamApi.getToken()) {
      try {
        const data = await pamApi.getWalletBalances();
        setWalletBalances(data.balances);
      } catch {
        // non-fatal
      }
    }
  }, []);

  // Bootstrap — check for existing JWT or guest session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = pamApi.getToken();
      if (token) {
        try {
          const me = await pamApi.getMe();
          if (cancelled) return;
          setUserId(me.userId);
          setUsername(me.username);
          setStatus('authenticated');
          // Load wallet balances
          try {
            const wb = await pamApi.getWalletBalances();
            if (!cancelled) setWalletBalances(wb.balances);
          } catch {
            // non-fatal
          }
          return;
        } catch {
          pamApi.clearToken();
        }
      }

      // Fall back to guest session
      const existingGuestId = pamApi.getGuestSessionId();
      if (existingGuestId) {
        try {
          await pamApi.getGuestBalance(existingGuestId);
          if (!cancelled) {
            setGuestSessionId(existingGuestId);
            setStatus('guest');
            return;
          }
        } catch {
          pamApi.clearGuestSession();
        }
      }

      // Create new guest session
      try {
        const session = await pamApi.createGuestSession();
        if (!cancelled) {
          pamApi.setGuestSessionId(session.sessionId);
          setGuestSessionId(session.sessionId);
          setStatus('guest');
        }
      } catch {
        if (!cancelled) setStatus('guest'); // show game even if PAM is down
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (usernameInput: string, passwordInput: string) => {
    const data = await pamApi.login(usernameInput, passwordInput);
    pamApi.setToken(data.token);
    setUserId(data.userId);
    setUsername(data.username);
    // Switch to FUN by default after login (user can change currency)
    setCurrencyState('FUN');
    setStatus('authenticated');
    // Load wallet balances
    try {
      const wb = await pamApi.getWalletBalances();
      setWalletBalances(wb.balances);
    } catch {
      // non-fatal
    }
  }, []);

  const register = useCallback(async (usernameInput: string, passwordInput: string) => {
    const data = await pamApi.register(usernameInput, passwordInput);
    pamApi.setToken(data.token);
    setUserId(data.userId);
    setUsername(data.username);
    setCurrencyState('FUN');
    setStatus('authenticated');
    try {
      const wb = await pamApi.getWalletBalances();
      setWalletBalances(wb.balances);
    } catch {
      // non-fatal
    }
  }, []);

  const logout = useCallback(async () => {
    await pamApi.logout();
    setUserId(null);
    setUsername(null);
    setWalletBalances(null);
    setCurrencyState('FUN');
    // Create a fresh guest session
    try {
      const session = await pamApi.createGuestSession();
      pamApi.setGuestSessionId(session.sessionId);
      setGuestSessionId(session.sessionId);
    } catch {
      // non-fatal
    }
    setStatus('guest');
  }, []);

  return {
    status,
    userId,
    username,
    guestSessionId,
    currency,
    setCurrency,
    walletBalances,
    refreshWalletBalances,
    login,
    register,
    logout,
  };
}
