import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import type { Currency } from 'shared';

const CURRENCIES: Currency[] = ['FUN', 'USD', 'EUR', 'GBP', 'CAD'];
import {
  ALLOWED_ROWS,
  ALLOWED_RISK,
  DEFAULT_ROWS,
  DEFAULT_RISK,
  MIN_BET,
  MAX_BET,
  MAX_BET_COUNT,
  getAllPaytables,
} from '../plinko/config.js';
import { resolveOutcome } from '../plinko/engine.js';
import { initStore, appendHistory, getHistory } from '../store.js';
import { submitBetBatch } from '../pamClient.js';
import { logger } from '../logger.js';

const router = Router();

initStore();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || !process.env.NODE_ENV;

function getJwtSecret(): string | undefined {
  return process.env.PAM_JWT_SECRET ?? (isDev ? 'dev-jwt-secret-do-not-use-in-production' : undefined);
}

/**
 * Resolve the player identity from the request.
 * Returns either { kind: 'guest', sessionId } or { kind: 'user', userId }.
 */
function resolvePlayer(req: Request, guestSessionId?: string):
  | { kind: 'guest'; sessionId: string }
  | { kind: 'user'; userId: string }
  | null {
  if (guestSessionId) {
    return { kind: 'guest', sessionId: guestSessionId };
  }
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const secret = getJwtSecret();
    if (!secret) return null;
    try {
      const payload = jwt.verify(token, secret) as { userId: string };
      return { kind: 'user', userId: payload.userId };
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const BetBodySchema = z.object({
  guestSessionId: z.string().uuid({ message: 'Invalid guestSessionId format' }).optional().nullable().transform((v) => v ?? undefined),
  betAmount: z
    .number()
    .finite()
    .min(MIN_BET, `betAmount must be at least ${MIN_BET}`)
    .max(MAX_BET, `betAmount must be at most ${MAX_BET}`),
  rows: z
    .number()
    .refine((v): v is (typeof ALLOWED_ROWS)[number] => (ALLOWED_ROWS as readonly number[]).includes(v), {
      message: `rows must be one of ${ALLOWED_ROWS.join(', ')}`,
    }),
  riskLevel: z.enum(ALLOWED_RISK),
  count: z
    .number()
    .int()
    .min(1, 'count must be at least 1')
    .max(MAX_BET_COUNT, `count must be at most ${MAX_BET_COUNT}`)
    .optional()
    .default(1),
  currency: z.enum(CURRENCIES as [Currency, ...Currency[]]).optional().default('FUN' as Currency),
});

const HistoryQuerySchema = z.object({
  guestSessionId: z.string().uuid().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 20))
    .pipe(z.number().min(1).max(100)),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// GET /api/config — public, no auth required
router.get('/config', (_req: Request, res: Response) => {
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

// POST /api/plinko/bet
router.post('/plinko/bet', async (req: Request, res: Response) => {
  const parse = BetBodySchema.safeParse(req.body);
  if (!parse.success) {
    const message = parse.error.issues[0]?.message ?? 'Invalid request';
    logger.warn({ ip: clientIp(req), error: message }, 'Bet rejected: invalid request');
    res.status(400).json({ error: message });
    return;
  }
  const { guestSessionId, betAmount, rows, riskLevel, count, currency } = parse.data;

  const player = resolvePlayer(req, guestSessionId);
  if (!player) {
    res.status(401).json({ error: 'Unauthorized — provide guestSessionId or Authorization header' });
    return;
  }

  if (player.kind === 'guest' && currency !== 'FUN') {
    res.status(400).json({ error: 'Guests may only play with FUN currency' });
    return;
  }

  const betAmountCents = Math.round(betAmount * 100);

  // Generate all outcomes first (pure RNG — no balance involved)
  const outcomes: Array<{
    transactionId: string;
    roundId: string;
    betAmountCents: number;
    winAmountCents: number;
    slotIndex: number;
    multiplier: number;
  }> = [];

  for (let i = 0; i < count; i++) {
    const outcome = resolveOutcome(rows, riskLevel, betAmountCents);
    if (!outcome) {
      logger.error({ rows, riskLevel }, 'Config error: no outcome for given params');
      res.status(500).json({ error: 'Game configuration error' });
      return;
    }
    outcomes.push({
      transactionId: uuidv4(),
      roundId: uuidv4(),
      betAmountCents,
      winAmountCents: outcome.winAmountCents,
      slotIndex: outcome.slotIndex,
      multiplier: outcome.multiplier,
    });
  }

  // Submit all outcomes to the PAM in one atomic call
  try {
    const pamResult = await submitBetBatch({
      guestSessionId: player.kind === 'guest' ? player.sessionId : undefined,
      authorizationHeader: req.headers.authorization,
      currency,
      bets: outcomes,
    });

    const playerKey = player.kind === 'guest' ? player.sessionId : player.userId;

    const bets = pamResult.bets.map((pamBet, i) => {
      const outcome = outcomes[i]!;

      appendHistory({
        playerKey,
        roundId: pamBet.roundId,
        bet: outcome.betAmountCents,
        slotIndex: outcome.slotIndex,
        multiplier: outcome.multiplier,
        win: outcome.winAmountCents,
        balance: pamBet.balanceAfterCents,
        currency,
        timestamp: Date.now(),
      });

      return {
        slotIndex: outcome.slotIndex,
        multiplier: outcome.multiplier,
        winAmount: outcome.winAmountCents / 100,
        balance: pamBet.balanceAfterCents / 100,
        roundId: pamBet.roundId,
      };
    });

    logger.info({ playerKey, count, currency }, 'Batch bet resolved');
    res.json({ bets });
  } catch (err) {
    const e = err as Error & { pamStatus?: number };
    if (e.pamStatus === 400) {
      res.status(400).json({ error: e.message });
      return;
    }
    if (e.pamStatus === 401) {
      res.status(401).json({ error: e.message });
      return;
    }
    if (e.pamStatus === 404) {
      res.status(404).json({ error: e.message });
      return;
    }
    logger.error({ err }, 'Unexpected error in bet handler');
    const message = isDev && e.message ? e.message : 'Internal error';
    res.status(500).json({ error: message });
  }
});

// GET /api/history?guestSessionId=...&limit=N
// or GET /api/history?limit=N with Authorization: Bearer <jwt>
router.get('/history', (req: Request, res: Response) => {
  const parse = HistoryQuerySchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const { guestSessionId, limit } = parse.data;

  const player = resolvePlayer(req, guestSessionId);
  if (!player) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const playerKey = player.kind === 'guest' ? player.sessionId : player.userId;
  const records = getHistory(playerKey, limit);

  res.json({
    rounds: records.map((r) => ({
      roundId: r.roundId,
      bet: r.bet / 100,
      slotIndex: r.slotIndex,
      multiplier: r.multiplier,
      win: r.win / 100,
      balance: r.balance / 100,
      currency: r.currency,
      timestamp: r.timestamp,
    })),
  });
});

export default router;
