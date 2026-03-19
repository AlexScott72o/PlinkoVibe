/**
 * @vitest-environment jsdom
 * Ensures the result (balance, lastResults) is not revealed until the ball lands.
 * The hook only applies the bet result when onLand fires (ball reaches the slot),
 * not when the placeBet API call resolves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlinko } from './usePlinko';
import type { AuthState } from './useAuth';
import type { PlaceBetResponse } from 'shared';

vi.mock('../api', () => ({
  getConfig: vi.fn().mockResolvedValue({
    minBet: 0.1,
    maxBet: 1000,
    defaultRows: 10,
    defaultRisk: 'medium',
    rows: [8, 10, 12],
    riskLevels: ['low', 'medium', 'high'],
    paytables: {},
  }),
  placeBet: vi.fn().mockResolvedValue({
    bets: [{ slotIndex: 5, balance: 99, winAmount: 0, multiplier: 1 }],
  } as PlaceBetResponse),
}));

vi.mock('../pamApi', () => ({
  getToken: vi.fn().mockReturnValue(null),
  getGuestBalance: vi.fn().mockResolvedValue({ balance: 100 }),
}));

const mockAuth: AuthState = {
  status: 'guest',
  userId: null,
  username: null,
  guestSessionId: 'test-guest-session',
  currency: 'FUN',
  setCurrency: vi.fn(),
  walletBalances: null,
  refreshWalletBalances: vi.fn().mockResolvedValue(undefined),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

describe('usePlinko', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not update balance or lastResults until the ball lands', async () => {
    const { result } = renderHook(() => usePlinko(mockAuth));

    await act(async () => {
      vi.runAllTimersAsync();
    });
    expect(result.current.loading).toBe(false);
    await act(async () => {
      result.current.placeBet();
    });
    await act(async () => {
      vi.runAllTimersAsync();
    });

    // After the API returns but before the ball lands: nothing is revealed
    const balanceAfterBet = result.current.balance;
    const lastResultsAfterBet = result.current.lastResults;
    const activeBallsAfterBet = result.current.activeBalls;
    expect(activeBallsAfterBet.length).toBe(1);
    const roundId = activeBallsAfterBet[0]!.roundId;

    expect(balanceAfterBet).toBe(100);
    expect(lastResultsAfterBet.length).toBe(0);

    // Ball lands → balance and result are now revealed
    await act(async () => {
      result.current.onLand(roundId);
    });

    expect(result.current.balance).toBe(99);
    expect(result.current.lastResults.length).toBe(1);
  });
});
