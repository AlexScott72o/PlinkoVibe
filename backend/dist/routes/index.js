import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { Mutex } from 'async-mutex';
import { initStore, getSession, createSession, updateBalance, appendHistory, getHistory, sessionCount, MAX_SESSIONS, } from '../store.js';
import { ALLOWED_ROWS, ALLOWED_RISK, DEFAULT_ROWS, DEFAULT_RISK, MIN_BET, MAX_BET, INITIAL_BALANCE_CENTS, MAX_BET_COUNT, getAllPaytables, } from '../plinko/config.js';
import { resolveOutcome } from '../plinko/engine.js';
import { logger } from '../logger.js';
const router = Router();
initStore();
// ---------------------------------------------------------------------------
// Per-session mutex to prevent concurrent bet race conditions on balance.
// ---------------------------------------------------------------------------
const sessionLocks = new Map();
function getSessionLock(sessionId) {
    let lock = sessionLocks.get(sessionId);
    if (!lock) {
        lock = new Mutex();
        sessionLocks.set(sessionId, lock);
    }
    return lock;
}
// ---------------------------------------------------------------------------
// Custom error class for errors thrown inside the bet lock.
// ---------------------------------------------------------------------------
class BetError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = 'BetError';
    }
}
// ---------------------------------------------------------------------------
// Zod schemas for request validation.
// ---------------------------------------------------------------------------
const SessionIdSchema = z.string().uuid({ message: 'Invalid sessionId format' });
const BetBodySchema = z.object({
    sessionId: SessionIdSchema,
    betAmount: z
        .number()
        .finite()
        .min(MIN_BET, `betAmount must be at least ${MIN_BET}`)
        .max(MAX_BET, `betAmount must be at most ${MAX_BET}`),
    rows: z
        .number()
        .refine((v) => ALLOWED_ROWS.includes(v), {
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
});
const SessionIdQuerySchema = z.object({
    sessionId: SessionIdSchema,
});
const HistoryQuerySchema = z.object({
    sessionId: SessionIdSchema,
    limit: z
        .string()
        .optional()
        .transform((v) => (v !== undefined ? parseInt(v, 10) : 20))
        .pipe(z.number().min(1).max(100)),
});
// ---------------------------------------------------------------------------
// Helper to extract the requesting IP (works behind proxy with trust proxy).
// ---------------------------------------------------------------------------
function clientIp(req) {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
router.get('/health', (_req, res) => {
    res.json({ ok: true });
});
// POST /api/session — create a new session
router.post('/session', (req, res) => {
    if (sessionCount() >= MAX_SESSIONS) {
        logger.warn({ ip: clientIp(req) }, 'Session creation rejected: max sessions reached');
        res.status(503).json({ error: 'Service unavailable' });
        return;
    }
    const sessionId = uuidv4();
    const ip = clientIp(req);
    const record = createSession(sessionId, INITIAL_BALANCE_CENTS, ip);
    logger.info({ sessionId, ip }, 'Session created');
    res.json({ sessionId: record.sessionId, balance: record.balance / 100 });
});
// GET /api/config?sessionId=...
router.get('/config', (req, res) => {
    const parse = SessionIdQuerySchema.safeParse(req.query);
    if (!parse.success) {
        res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
        return;
    }
    const { sessionId } = parse.data;
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
// POST /api/plinko/bet — resolves one or more balls in a single locked transaction.
// `count` (default 1) sets how many balls to resolve; each is an independent bet at
// `betAmount`. All outcomes are determined inside the per-session lock so concurrent
// requests cannot race on the balance.
router.post('/plinko/bet', async (req, res) => {
    const parse = BetBodySchema.safeParse(req.body);
    if (!parse.success) {
        const message = parse.error.issues[0]?.message ?? 'Invalid request';
        logger.warn({ ip: clientIp(req), error: message }, 'Bet rejected: invalid request');
        res.status(400).json({ error: message });
        return;
    }
    const { sessionId, betAmount, rows, riskLevel, count } = parse.data;
    // Fast-fail if session doesn't exist (avoids lock allocation for unknown sessions)
    if (!getSession(sessionId)) {
        logger.warn({ sessionId, ip: clientIp(req) }, 'Bet rejected: session not found');
        res.status(404).json({ error: 'Session not found' });
        return;
    }
    // Convert to cents once — all internal arithmetic is integer cents from here
    const betAmountCents = Math.round(betAmount * 100);
    const totalBetCents = betAmountCents * count;
    try {
        const result = await getSessionLock(sessionId).runExclusive(async () => {
            // Re-read session inside the lock (authoritative; prevents race condition)
            const session = getSession(sessionId);
            if (!session)
                throw new BetError(404, 'Session not found');
            // Check full batch cost upfront — consistent with client-side guard
            if (session.balance < totalBetCents) {
                logger.warn({ sessionId, balance: session.balance, totalBetCents }, 'Bet rejected: insufficient balance');
                throw new BetError(400, 'Insufficient balance');
            }
            // Snapshot balance before the batch so we can roll back atomically on error
            const preBatchBalance = session.balance;
            const bets = [];
            for (let i = 0; i < count; i++) {
                const newBalance = session.balance - betAmountCents;
                updateBalance(sessionId, newBalance);
                const outcome = resolveOutcome(rows, riskLevel, betAmountCents);
                if (!outcome) {
                    // Config error mid-batch: roll back the entire batch
                    updateBalance(sessionId, preBatchBalance);
                    throw new BetError(500, 'Config error');
                }
                const finalBalance = newBalance + outcome.winAmountCents;
                updateBalance(sessionId, finalBalance);
                const roundId = uuidv4();
                appendHistory({
                    sessionId,
                    roundId,
                    bet: betAmountCents,
                    slotIndex: outcome.slotIndex,
                    multiplier: outcome.multiplier,
                    win: outcome.winAmountCents,
                    balance: finalBalance,
                    timestamp: Date.now(),
                });
                bets.push({
                    slotIndex: outcome.slotIndex,
                    multiplier: outcome.multiplier,
                    winAmount: outcome.winAmountCents / 100,
                    balance: finalBalance / 100,
                    roundId,
                });
            }
            logger.info({
                sessionId,
                count,
                totalBet: totalBetCents,
                finalBalance: session.balance,
            }, 'Batch bet resolved');
            return { bets };
        });
        res.json(result);
    }
    catch (err) {
        if (err instanceof BetError) {
            res.status(err.status).json({ error: err.message });
            return;
        }
        logger.error({ err, sessionId }, 'Unexpected error in bet handler');
        res.status(500).json({ error: 'Internal error' });
    }
});
// GET /api/balance?sessionId=...
router.get('/balance', (req, res) => {
    const parse = SessionIdQuerySchema.safeParse(req.query);
    if (!parse.success) {
        res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
        return;
    }
    const { sessionId } = parse.data;
    const session = getSession(sessionId);
    if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }
    res.json({ balance: session.balance / 100 });
});
// GET /api/history?sessionId=...&limit=N
router.get('/history', (req, res) => {
    const parse = HistoryQuerySchema.safeParse(req.query);
    if (!parse.success) {
        res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
        return;
    }
    const { sessionId, limit } = parse.data;
    const session = getSession(sessionId);
    if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }
    const records = getHistory(sessionId, limit);
    res.json({
        rounds: records.map((r) => ({
            roundId: r.roundId,
            bet: r.bet / 100,
            slotIndex: r.slotIndex,
            multiplier: r.multiplier,
            win: r.win / 100,
            balance: r.balance / 100,
            timestamp: r.timestamp,
        })),
    });
});
export default router;
