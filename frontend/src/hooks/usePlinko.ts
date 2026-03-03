import { useState, useEffect, useCallback, useRef } from 'react';
import type { ConfigResponse, BetResponse, RiskLevel } from 'shared';
import * as api from '../api';

export type AnimationSpeed = 'slow' | 'regular' | 'turbo';

export const ANIMATION_SPEED_MS: Record<AnimationSpeed, number> = {
  slow: 5000,
  regular: 3000,
  turbo: 750,
};

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

export function usePlinko() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [betAmount, setBetAmount] = useState(1);
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
  const [autoplay, setAutoplay] = useState(false);

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
    if (balance < betAmount) {
      setError('Insufficient balance');
      return;
    }
    placingRef.current = true;
    setError(null);
    setPlaying(true);
    setOutcomeAndRound((prev) => ({ ...prev, outcome: null }));
    setActiveBalls([]);
    try {
      const result = await api.placeBet({
        sessionId,
        betAmount,
        rows,
        riskLevel,
      });
      setOutcomeAndRound((prev) => {
        const nextRoundId = prev.roundId + 1;
        setActiveBalls((balls) => [...balls, { roundId: nextRoundId, slotIndex: result.slotIndex, rows }]);
        return { outcome: result, roundId: nextRoundId };
      });
      const durationMs = ANIMATION_SPEED_MS[animationSpeed];
      const animationEndMs = durationMs + 1000; // match Board: hide ball after trail
      // Result is only known to the player after the ball lands
      setTimeout(() => {
        setBalance(result.balance);
        setLastResults((prev) => [result, ...prev].slice(0, 5));
      }, durationMs);
      setTimeout(() => {
        setPlaying(false);
        placingRef.current = false;
        if (autoplayRef.current && result.balance >= betAmount) {
          setTimeout(placeBet, 800);
        }
      }, animationEndMs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bet failed');
      setPlaying(false);
      placingRef.current = false;
    }
  }, [sessionId, config, playing, betAmount, balance, rows, riskLevel, animationSpeed]);

  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  const placingRef = useRef(false);

  const onBallComplete = useCallback((roundId: number) => {
    const delayMs = ANIMATION_SPEED_MS[animationSpeedRef.current] + 1000;
    setTimeout(() => {
      setActiveBalls((prev) => prev.filter((b) => b.roundId !== roundId));
    }, delayMs);
  }, []);

  return {
    sessionId,
    balance,
    config,
    betAmount,
    setBetAmount,
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
    onBallComplete,
    lastResults,
    loading,
    error,
    playing,
    placeBet,
    autoplay,
    setAutoplay,
  };
}
