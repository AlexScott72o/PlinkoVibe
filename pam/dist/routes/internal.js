/**
 * Internal seamless wallet API — called only by the RGS.
 * All requests must carry a valid HMAC-SHA256 X-Signature header.
 * JWT tokens in Authorization header are verified here on behalf of the RGS.
 */
import { Router } from 'express';
import { z } from 'zod';
import { createHmac } from 'crypto';
import jwt from 'jsonwebtoken';
import { Mutex } from 'async-mutex';
const CURRENCIES = ['FUN', 'USD', 'EUR', 'GBP', 'CAD'];
import { getUserById, updateUser, getGuest, updateGuestBalance, appendTransaction, getTransactionById, } from '../store.js';
import { logger } from '../logger.js';
const router = Router();
// ---------------------------------------------------------------------------
// HMAC signature verification middleware
// ---------------------------------------------------------------------------
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || !process.env.NODE_ENV;
function verifyHmac(req, res, next) {
    const secret = process.env.PAM_HMAC_SECRET ?? (isDev ? 'dev-hmac-secret-do-not-use-in-production' : undefined);
    if (!secret) {
        logger.error('PAM_HMAC_SECRET is not set');
        res.status(500).json({ error: 'Internal configuration error' });
        return;
    }
    const signature = req.headers['x-signature'];
    if (!signature || typeof signature !== 'string') {
        res.status(401).json({ error: 'Missing X-Signature header' });
        return;
    }
    const body = JSON.stringify(req.body);
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    if (signature !== expected) {
        logger.warn({ ip: req.ip }, 'Invalid HMAC signature on internal wallet request');
        res.status(401).json({ error: 'Invalid signature' });
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Per-player mutex map to serialise concurrent bet batches for the same player
// ---------------------------------------------------------------------------
const playerLocks = new Map();
function getPlayerLock(playerId) {
    let lock = playerLocks.get(playerId);
    if (!lock) {
        lock = new Mutex();
        playerLocks.set(playerId, lock);
    }
    return lock;
}
// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------
function getJwtSecret() {
    const secret = process.env.PAM_JWT_SECRET ?? (isDev ? 'dev-jwt-secret-do-not-use-in-production' : undefined);
    if (!secret)
        throw new Error('PAM_JWT_SECRET is not set');
    return secret;
}
function resolveUserId(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
        return null;
    const token = authHeader.slice(7);
    try {
        const payload = jwt.verify(token, getJwtSecret());
        return payload.userId;
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------
const BetOutcomeSchema = z.object({
    transactionId: z.string().uuid(),
    roundId: z.string().uuid(),
    betAmountCents: z.number().int().positive(),
    winAmountCents: z.number().int().min(0),
    slotIndex: z.number().int().min(0),
    multiplier: z.number().finite().min(0),
});
const InternalBetBodySchema = z.object({
    guestSessionId: z.string().uuid().optional(),
    currency: z.enum(CURRENCIES),
    bets: z.array(BetOutcomeSchema).min(1).max(100),
});
// ---------------------------------------------------------------------------
// POST /internal/wallet/bet
// Processes a full batch of bet outcomes atomically for a single player.
// ---------------------------------------------------------------------------
router.post('/wallet/bet', verifyHmac, async (req, res) => {
    const parse = InternalBetBodySchema.safeParse(req.body);
    if (!parse.success) {
        res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
        return;
    }
    const { guestSessionId, currency, bets } = parse.data;
    // Determine player identity
    const isGuest = Boolean(guestSessionId);
    if (!isGuest && currency !== 'FUN') {
        // Logged-in user — validate JWT
    }
    else if (isGuest && currency !== 'FUN') {
        res.status(400).json({ error: 'Guests may only play with FUN currency' });
        return;
    }
    // Validate player exists
    let playerId;
    if (isGuest) {
        playerId = guestSessionId;
        if (!getGuest(playerId)) {
            res.status(404).json({ error: 'Guest session not found' });
            return;
        }
    }
    else {
        const userId = resolveUserId(req);
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized — missing or invalid token' });
            return;
        }
        playerId = userId;
        if (!getUserById(userId)) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
    }
    // Check for duplicate transactionIds (idempotency guard)
    for (const bet of bets) {
        const existing = getTransactionById(bet.transactionId);
        if (existing) {
            // Idempotent: return stored result (simplified — return current balance)
            logger.info({ transactionId: bet.transactionId }, 'Idempotent bet: returning existing result');
            const currentBalance = isGuest
                ? (getGuest(playerId)?.balance ?? 0)
                : (getUserById(playerId)?.wallets[currency] ?? 0);
            res.json({
                bets: bets.map((b) => ({
                    roundId: b.roundId,
                    transactionId: b.transactionId,
                    balanceAfterCents: currentBalance,
                })),
            });
            return;
        }
    }
    try {
        const result = await getPlayerLock(playerId).runExclusive(async () => {
            const totalBetCents = bets.reduce((sum, b) => sum + b.betAmountCents, 0);
            // Read current balance inside the lock
            let currentBalance;
            if (isGuest) {
                currentBalance = getGuest(playerId).balance;
            }
            else {
                currentBalance = getUserById(playerId).wallets[currency];
            }
            if (currentBalance < totalBetCents) {
                throw Object.assign(new Error('Insufficient balance'), { status: 400 });
            }
            const responseItems = [];
            let runningBalance = currentBalance;
            for (const bet of bets) {
                // Debit
                runningBalance -= bet.betAmountCents;
                appendTransaction({
                    transactionId: `${bet.transactionId}_debit`,
                    playerId,
                    type: 'debit',
                    amount: bet.betAmountCents,
                    currency,
                    roundId: bet.roundId,
                    balanceAfter: runningBalance,
                    timestamp: Date.now(),
                });
                // Credit win
                runningBalance += bet.winAmountCents;
                appendTransaction({
                    transactionId: bet.transactionId, // main transactionId = credit
                    playerId,
                    type: 'credit',
                    amount: bet.winAmountCents,
                    currency,
                    roundId: bet.roundId,
                    balanceAfter: runningBalance,
                    timestamp: Date.now(),
                });
                responseItems.push({
                    roundId: bet.roundId,
                    transactionId: bet.transactionId,
                    balanceAfterCents: runningBalance,
                });
            }
            // Persist final balance
            if (isGuest) {
                updateGuestBalance(playerId, runningBalance);
            }
            else {
                const user = getUserById(playerId);
                updateUser({ ...user, wallets: { ...user.wallets, [currency]: runningBalance } });
            }
            logger.info({ playerId, currency, count: bets.length, finalBalance: runningBalance }, 'Bet batch processed');
            return { bets: responseItems };
        });
        res.json(result);
    }
    catch (err) {
        const e = err;
        if (e.status === 400) {
            res.status(400).json({ error: e.message });
            return;
        }
        logger.error({ err, playerId }, 'Unexpected error in internal bet handler');
        res.status(500).json({ error: 'Internal error' });
    }
});
// ---------------------------------------------------------------------------
// GET /internal/wallet/balance — fetch current balance for a player
// ---------------------------------------------------------------------------
router.get('/wallet/balance', verifyHmac, (req, res) => {
    // For GET requests, signature covers the query string body (empty string)
    const guestSessionId = req.query.guestSessionId;
    const currency = req.query.currency ?? 'FUN';
    if (guestSessionId) {
        const guest = getGuest(guestSessionId);
        if (!guest) {
            res.status(404).json({ error: 'Guest session not found' });
            return;
        }
        res.json({ balance: guest.balance });
        return;
    }
    const userId = resolveUserId(req);
    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const user = getUserById(userId);
    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    res.json({ balance: user.wallets[currency] ?? 0 });
});
export default router;
