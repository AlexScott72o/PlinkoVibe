import { useState, useEffect, useCallback, useRef } from 'react';
import type { ConfigResponse, BetResponse, RiskLevel, Currency } from 'shared';
import type { AuthState } from './useAuth.js';
import * as api from '../api.js';
import { getGuestBalance } from '../pamApi.js';

export type AnimationSpeed = 'slow' | 'regular' | 'turbo';

export const ANIMATION_SPEED_MS: Record<AnimationSpeed, number> = {
  turbo: 1000,
  regular: 3000,
  slow: 6000,
};

export const BALL_DROP_DELAY_MS: Record<AnimationSpeed, number> = {
  turbo: 200,
  regular: 400,
  slow: 700,
};

export const MIN_BALLS = 1;
export const MAX_BALLS = 100;

export interface ActiveBall {
  roundId: number;
  slotIndex: number;
  rows: number;
}

export interface PlinkoState {
  balance: number;
  config: ConfigResponse | null;
  betAmount: number;
  rows: number;
  riskLevel: RiskLevel;
  lastOutcome: BetResponse | null;
  activeBalls: ActiveBall[];
  loading: boolean;
  error: string | null;
  playing: boolean;
}

export function usePlinko(
  auth: AuthState,
  options?: { onReveal?: (result: BetResponse) => void }
) {
  const onRevealRef = useRef(options?.onReveal);
  onRevealRef.current = options?.onReveal;

  const [balance, setBalance] = useState(0);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [betAmount, setBetAmount] = useState(1);
  const [numBalls, setNumBalls] = useState<number>(1);
  const [rows, setRows] = useState(10);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('medium');
  const [animationSpeed, setAnimationSpeed] = useState<AnimationSpeed>('regular');
  const [outcomeAndRound, setOutcomeAndRound] = useState<{ outcome: BetResponse | null; roundId: number }>({
    outcome: null,
    roundId: 0,
  });
  const [activeBalls, setActiveBalls] = useState<ActiveBall[]>([]);
  const [lastResults, setLastResults] = useState<BetResponse[]>([]);
  const animationSpeedRef = useRef(animationSpeed);
  animationSpeedRef.current = animationSpeed;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  // Load config when auth is ready
  useEffect(() => {
    if (auth.status === 'loading') return;
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api.getConfig();
        if (cancelled) return;
        setConfig(cfg);
        setBetAmount(Math.max(cfg.minBet, Math.min(cfg.maxBet, 1)));
        setRows(cfg.defaultRows);
        setRiskLevel(cfg.defaultRisk);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load config');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [auth.status]);

  // Sync balance from auth wallet when currency or wallet balances change
  useEffect(() => {
    if (auth.status === 'authenticated' && auth.walletBalances) {
      setBalance(auth.walletBalances[auth.currency] ?? 0);
    } else if (auth.status === 'guest' && auth.guestSessionId) {
      // Guest balance will be set after first bet; initialise from PAM lazily
    }
  }, [auth.status, auth.currency, auth.walletBalances, auth.guestSessionId]);

  // Load initial guest balance
  useEffect(() => {
    if (auth.status !== 'guest' || !auth.guestSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getGuestBalance(auth.guestSessionId!);
        if (!cancelled) setBalance(data.balance);
      } catch {
        // non-fatal — balance will be updated after first bet
      }
    })();
    return () => { cancelled = true; };
  }, [auth.status, auth.guestSessionId]);

  const placingRef = useRef(false);
  const nextRoundIdRef = useRef(1);
  const pendingByRoundIdRef = useRef<Map<number, BetResponse>>(new Map());
  const ballsCompletedRef = useRef(0);
  const numBallsInBatchRef = useRef(1);

  const placeBet = useCallback(async () => {
    if (!config || playing) return;
    if (placingRef.current) return;
    if (auth.status === 'loading') return;

    if (betAmount < config.minBet || betAmount > config.maxBet) {
      setError('Bet out of range');
      return;
    }
    const balls = Math.max(MIN_BALLS, Math.min(MAX_BALLS, Math.floor(numBalls)));
    if (balls !== numBalls) setNumBalls(balls);
    const effectiveTotalBet = betAmount * balls;
    if (balance < effectiveTotalBet) {
      setError('Insufficient balance');
      return;
    }

    placingRef.current = true;
    setError(null);
    setPlaying(true);
    setOutcomeAndRound((prev) => ({ ...prev, outcome: null }));
    setActiveBalls([]);
    pendingByRoundIdRef.current = new Map();
    ballsCompletedRef.current = 0;
    numBallsInBatchRef.current = balls;
    const roundIdBase = nextRoundIdRef.current;

    const currency: Currency = auth.status === 'authenticated' ? auth.currency : 'FUN';
    const guestSessionId = auth.status === 'guest' ? auth.guestSessionId ?? undefined : undefined;

    if (auth.status === 'guest' && !guestSessionId) {
      setError('Session not ready — please refresh the page');
      setPlaying(false);
      placingRef.current = false;
      return;
    }

    try {
      const { bets } = await api.placeBet({
        guestSessionId,
        betAmount,
        rows,
        riskLevel,
        count: balls,
        currency,
      });
      nextRoundIdRef.current = roundIdBase + balls;
      setOutcomeAndRound({ outcome: bets[bets.length - 1] ?? null, roundId: nextRoundIdRef.current });
      const dropDelayMs = BALL_DROP_DELAY_MS[animationSpeedRef.current];
      for (let i = 0; i < bets.length; i++) {
        const roundId = roundIdBase + i;
        const bet = bets[i]!;
        pendingByRoundIdRef.current.set(roundId, bet);
        setTimeout(() => {
          setActiveBalls((b) => [...b, { roundId, slotIndex: bet.slotIndex, rows }]);
        }, i * dropDelayMs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bet failed');
      setPlaying(false);
      placingRef.current = false;
    }
  }, [config, playing, auth, betAmount, numBalls, balance, rows, riskLevel]);

  const onLand = useCallback((roundId: number) => {
    const result = pendingByRoundIdRef.current.get(roundId);
    if (result) {
      setBalance(result.balance);
      // Propagate balance update to auth wallet balances
      if (auth.status === 'authenticated') {
        auth.refreshWalletBalances().catch(() => null);
      }
      setLastResults((prev) => [result, ...prev].slice(0, 100));
      pendingByRoundIdRef.current.delete(roundId);
      onRevealRef.current?.(result);
    }
  }, [auth]);

  const onBallComplete = useCallback((roundId: number) => {
    ballsCompletedRef.current += 1;
    if (ballsCompletedRef.current >= numBallsInBatchRef.current) {
      setPlaying(false);
      placingRef.current = false;
    }
    setTimeout(() => {
      setActiveBalls((prev) => prev.filter((b) => b.roundId !== roundId));
    }, 400);
  }, []);

  return {
    balance,
    config,
    betAmount,
    setBetAmount,
    numBalls,
    setNumBalls,
    totalBet: betAmount * numBalls,
    rows,
    setRows,
    riskLevel,
    setRiskLevel,
    animationSpeed,
    setAnimationSpeed,
    animationDurationMs: ANIMATION_SPEED_MS[animationSpeed],
    lastOutcome: outcomeAndRound.outcome,
    roundId: outcomeAndRound.roundId,
    activeBalls,
    onLand,
    onBallComplete,
    lastResults,
    loading,
    error,
    playing,
    placeBet,
  };
}
