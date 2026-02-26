import { useState, useEffect, useCallback, useRef } from 'react';
import type { ConfigResponse, BetResponse, RiskLevel } from 'shared';
import * as api from '../api';

export interface PlinkoState {
  sessionId: string | null;
  balance: number;
  config: ConfigResponse | null;
  betAmount: number;
  rows: number;
  riskLevel: RiskLevel;
  lastOutcome: BetResponse | null; // Only set from bet response; never predicted
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
  const [lastOutcome, setLastOutcome] = useState<BetResponse | null>(null);
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
    if (betAmount < config.minBet || betAmount > config.maxBet) {
      setError('Bet out of range');
      return;
    }
    if (balance < betAmount) {
      setError('Insufficient balance');
      return;
    }
    setError(null);
    setPlaying(true);
    setLastOutcome(null);
    try {
      const result = await api.placeBet({
        sessionId,
        betAmount,
        rows,
        riskLevel,
      });
setLastOutcome(result);
      setBalance(result.balance);
      if (autoplayRef.current && result.balance >= betAmount) {
        setTimeout(() => placeBet(), 800);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bet failed');
    } finally {
      setPlaying(false);
    }
  }, [sessionId, config, playing, betAmount, balance, rows, riskLevel]);

  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;

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
    lastOutcome,
    loading,
    error,
    playing,
    placeBet,
    autoplay,
    setAutoplay,
  };
}
