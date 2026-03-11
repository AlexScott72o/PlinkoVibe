import { useState, useEffect, useCallback, useRef } from 'react';
import type { ConfigResponse, BetResponse, RiskLevel } from 'shared';
import * as api from '../api';

export type AnimationSpeed = 'slow' | 'regular' | 'turbo';

export const ANIMATION_SPEED_MS: Record<AnimationSpeed, number> = {
  turbo: 1000,
  regular: 3000,
  slow: 6000,
};

/** Delay between starting each ball drop (ms). */
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
  sessionId: string | null;
  balance: number;
  config: ConfigResponse | null;
  betAmount: number;
  rows: number;
  riskLevel: RiskLevel;
  lastOutcome: BetResponse | null; // Only set from bet response; never predicted
  activeBalls: ActiveBall[]; // one ball per bet; cleared on new bet, removed shortly after land
  loading: boolean;
  error: string | null;
  playing: boolean; // true while round in progress (request sent, animating)
}

export function usePlinko(options?: { onReveal?: (result: BetResponse) => void }) {
  const onRevealRef = useRef(options?.onReveal);
  onRevealRef.current = options?.onReveal;

  const [sessionId, setSessionId] = useState<string | null>(null);
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
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await api.ensureSession();
        if (cancelled) return;
        setSessionId(session.sessionId);
        setBalance(session.balance);
        const cfg = await api.getConfig(session.sessionId);
        if (cancelled) return;
        setConfig(cfg);
        setBetAmount(Math.max(cfg.minBet, Math.min(cfg.maxBet, 1)));
        setRows(cfg.defaultRows);
        setRiskLevel(cfg.defaultRisk);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const placeBet = useCallback(async () => {
    if (!sessionId || !config || playing) return;
    if (placingRef.current) return;
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

    try {
      const results: BetResponse[] = [];
      for (let i = 0; i < balls; i++) {
        const result = await api.placeBet({
          sessionId,
          betAmount,
          rows,
          riskLevel,
        });
        results.push(result);
      }
      nextRoundIdRef.current = roundIdBase + balls;
      setOutcomeAndRound({ outcome: results[results.length - 1] ?? null, roundId: nextRoundIdRef.current });
      const dropDelayMs = BALL_DROP_DELAY_MS[animationSpeedRef.current];
      for (let i = 0; i < results.length; i++) {
        const roundId = roundIdBase + i;
        pendingByRoundIdRef.current.set(roundId, results[i]);
        setTimeout(() => {
          setActiveBalls((b) => [...b, { roundId, slotIndex: results[i].slotIndex, rows }]);
        }, i * dropDelayMs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bet failed');
      setPlaying(false);
      placingRef.current = false;
    }
  }, [sessionId, config, playing, betAmount, numBalls, balance, rows, riskLevel]);

  const placingRef = useRef(false);
  const nextRoundIdRef = useRef(1);
  const pendingByRoundIdRef = useRef<Map<number, BetResponse>>(new Map());
  const ballsCompletedRef = useRef(0);
  const numBallsInBatchRef = useRef(1);

  const onLand = useCallback((roundId: number) => {
    const result = pendingByRoundIdRef.current.get(roundId);
    if (result) {
      setBalance(result.balance);
      setLastResults((prev) => [result, ...prev].slice(0, 100));
      pendingByRoundIdRef.current.delete(roundId);
      onRevealRef.current?.(result);
    }
  }, []);

  const onBallComplete = useCallback((roundId: number) => {
    ballsCompletedRef.current += 1;
    if (ballsCompletedRef.current >= numBallsInBatchRef.current) {
      setPlaying(false);
      placingRef.current = false;
    }
    const removeBallDelayMs = 400;
    setTimeout(() => {
      setActiveBalls((prev) => prev.filter((b) => b.roundId !== roundId));
    }, removeBallDelayMs);
  }, []);

  return {
    sessionId,
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
