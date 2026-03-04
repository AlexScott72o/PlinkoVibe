/**
 * @vitest-environment jsdom
 * Ensures the result (balance, lastResults) is not displayed until the animation completes.
 * The hook only applies the bet result when onBallComplete is called, not when placeBet resolves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlinko } from './usePlinko';
import type { BetResponse } from 'shared';

vi.mock('../api', () => ({
  ensureSession: vi.fn().mockResolvedValue({ sessionId: 'test-session', balance: 100 }),
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
    slotIndex: 5,
    balance: 99,
    winAmount: 0,
    multiplier: 1,
  } as BetResponse),
}));

describe('usePlinko', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not update balance or lastResults until onBallComplete is called', async () => {
    const { result } = renderHook(() => usePlinko());

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

    const balanceAfterBet = result.current.balance;
    const lastResultsAfterBet = result.current.lastResults;
    const activeBallsAfterBet = result.current.activeBalls;
    expect(activeBallsAfterBet.length).toBe(1);
    const roundId = activeBallsAfterBet[0]!.roundId;

    expect(balanceAfterBet).toBe(100);
    expect(lastResultsAfterBet.length).toBe(0);

    await act(async () => {
      result.current.onBallComplete(roundId);
    });
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });

    expect(result.current.balance).toBe(99);
    expect(result.current.lastResults.length).toBe(1);
  });
});
