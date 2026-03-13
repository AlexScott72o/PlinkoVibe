import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
const CURRENCIES = ['FUN', 'USD', 'EUR', 'GBP', 'CAD'];
import { getUserById, updateUser, appendTransaction } from '../store.js';
import { logger } from '../logger.js';
const router = Router();
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || !process.env.NODE_ENV;
function getJwtSecret() {
    const secret = process.env.PAM_JWT_SECRET ?? (isDev ? 'dev-jwt-secret-do-not-use-in-production' : undefined);
    if (!secret)
        throw new Error('PAM_JWT_SECRET is not set');
    return secret;
}
function resolveUserFromRequest(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
        return null;
    const token = authHeader.slice(7);
    try {
        const payload = jwt.verify(token, getJwtSecret());
        return { userId: payload.userId };
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const DepositSchema = z.object({
    currency: z.enum(CURRENCIES),
    amount: z
        .number()
        .finite()
        .positive('Amount must be positive')
        .max(1_000_000, 'Maximum deposit is 1,000,000'),
});
// ---------------------------------------------------------------------------
// GET /wallet/balance — returns all wallet balances in major units
// ---------------------------------------------------------------------------
router.get('/balance', (req, res) => {
    const identity = resolveUserFromRequest(req);
    if (!identity) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const user = getUserById(identity.userId);
    if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    // Convert all balances from minor units to major units
    const balances = Object.fromEntries(Object.entries(user.wallets).map(([c, b]) => [c, b / 100]));
    res.json({ balances });
});
// ---------------------------------------------------------------------------
// POST /wallet/deposit — simulated deposit; no real-money transaction
// ---------------------------------------------------------------------------
router.post('/deposit', async (req, res) => {
    const identity = resolveUserFromRequest(req);
    if (!identity) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const parse = DepositSchema.safeParse(req.body);
    if (!parse.success) {
        res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
        return;
    }
    const { currency, amount } = parse.data;
    const user = getUserById(identity.userId);
    if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const amountCents = Math.round(amount * 100);
    const newBalance = user.wallets[currency] + amountCents;
    const updated = { ...user, wallets: { ...user.wallets, [currency]: newBalance } };
    updateUser(updated);
    appendTransaction({
        transactionId: uuidv4(),
        playerId: user.userId,
        type: 'deposit',
        amount: amountCents,
        currency,
        balanceAfter: newBalance,
        timestamp: Date.now(),
    });
    logger.info({ userId: user.userId, currency, amountCents }, 'Simulated deposit');
    res.json({ currency, balance: newBalance / 100 });
});
export default router;
