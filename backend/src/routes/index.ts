import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { BetRequest } from 'shared';
import {
  initStore,
  getSession,
  createSession,
  updateBalance,
  appendHistory,
  getHistory,
} from '../store.js';
import {
  ALLOWED_ROWS,
  ALLOWED_RISK,
  DEFAULT_ROWS,
  DEFAULT_RISK,
  MIN_BET,
  MAX_BET,
  INITIAL_BALANCE,
  getAllPaytables,
} from '../plinko/config.js';
import { resolveOutcome } from '../plinko/engine.js';

const router = Router();

initStore();

router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// POST /api/session — create or restore session
router.post('/session', (_req, res) => {
  const sessionId = uuidv4();
  const record = createSession(sessionId, INITIAL_BALANCE);
  res.json({ sessionId: record.sessionId, balance: record.balance });
});

// GET /api/config?sessionId=...
router.get('/config', (req, res) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId required' });
    return;
  }
  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({
    rows: [...ALLOWED_ROWS],
    riskLevels: [...ALLOWED_RISK],
    paytables: getAllPaytables(),
    defaultRows: DEFAULT_ROWS,
    defaultRisk: DEFAULT_RISK,
    minBet: MIN_BET,
    maxBet: MAX_BET,
  });
});

// POST /api/plinko/bet — outcome computed only here, after validation
router.post('/plinko/bet', (req, res) => {
  const body = req.body as BetRequest;
  const { sessionId, betAmount, rows, riskLevel } = body;

  if (!sessionId || typeof betAmount !== 'number' || typeof rows !== 'number' || !riskLevel) {
    res.status(400).json({ error: 'Invalid request: sessionId, betAmount, rows, riskLevel required' });
    return;
  }

  if (!ALLOWED_ROWS.includes(rows as (typeof ALLOWED_ROWS)[number])) {
    res.status(400).json({ error: 'Invalid rows' });
    return;
  }
  if (!ALLOWED_RISK.includes(riskLevel as (typeof ALLOWED_RISK)[number])) {
    res.status(400).json({ error: 'Invalid riskLevel' });
    return;
  }
  if (betAmount < MIN_BET || betAmount > MAX_BET || !Number.isFinite(betAmount)) {
    res.status(400).json({ error: 'Invalid betAmount' });
    return;
  }

  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  if (session.balance < betAmount) {
    res.status(400).json({ error: 'Insufficient balance' });
    return;
  }

  // Only after validation: debit, resolve outcome (single RNG draw), credit, log
  const newBalance = session.balance - betAmount;
  updateBalance(sessionId, newBalance);

  const outcome = resolveOutcome(rows, riskLevel, betAmount);
  if (!outcome) {
    updateBalance(sessionId, session.balance);
    res.status(500).json({ error: 'Config error' });
    return;
  }

  const finalBalance = newBalance + outcome.winAmount;
  updateBalance(sessionId, finalBalance);

  const roundId = uuidv4();
  appendHistory({
    sessionId,
    roundId,
    bet: betAmount,
    slotIndex: outcome.slotIndex,
    multiplier: outcome.multiplier,
    win: outcome.winAmount,
    balance: finalBalance,
    timestamp: Date.now(),
  });

  console.log(
    `[RGS] round=${roundId} bet=${betAmount} slot=${outcome.slotIndex} mult=${outcome.multiplier} win=${outcome.winAmount} balance=${finalBalance}`
  );

  res.json({
    slotIndex: outcome.slotIndex,
    multiplier: outcome.multiplier,
    winAmount: outcome.winAmount,
    balance: finalBalance,
    roundId,
  });
});

// GET /api/balance?sessionId=...
router.get('/balance', (req, res) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId required' });
    return;
  }
  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ balance: session.balance });
});

// GET /api/history?sessionId=...&limit=N
router.get('/history', (req, res) => {
  const sessionId = req.query.sessionId as string;
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId required' });
    return;
  }
  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  const records = getHistory(sessionId, limit);
  res.json({
    rounds: records.map((r) => ({
      roundId: r.roundId,
      bet: r.bet,
      slotIndex: r.slotIndex,
      multiplier: r.multiplier,
      win: r.win,
      balance: r.balance,
      timestamp: r.timestamp,
    })),
  });
});

export default router;
