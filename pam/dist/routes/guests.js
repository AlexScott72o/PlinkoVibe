import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getGuest, guestCount, createGuest, INITIAL_FUN_BALANCE_CENTS, MAX_GUEST_SESSIONS, } from '../store.js';
import { logger } from '../logger.js';
const router = Router();
function clientIp(req) {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
// ---------------------------------------------------------------------------
// POST /guest/session — create a new guest session (FUN currency only)
// ---------------------------------------------------------------------------
router.post('/session', (req, res) => {
    try {
        if (guestCount() >= MAX_GUEST_SESSIONS) {
            logger.warn({ ip: clientIp(req) }, 'Guest session rejected: max sessions reached');
            res.status(503).json({ error: 'Service unavailable' });
            return;
        }
        const sessionId = uuidv4();
        const now = Date.now();
        createGuest({
            sessionId,
            balance: INITIAL_FUN_BALANCE_CENTS,
            createdAt: now,
            lastActiveAt: now,
            createdByIp: clientIp(req),
        });
        logger.info({ sessionId, ip: clientIp(req) }, 'Guest session created');
        res.json({ sessionId, balance: INITIAL_FUN_BALANCE_CENTS / 100 });
    }
    catch (err) {
        logger.error({ err, ip: clientIp(req) }, 'Guest session creation failed');
        res.status(500).json({ error: 'Failed to create guest session' });
    }
});
// ---------------------------------------------------------------------------
// GET /guest/balance?sessionId=...
// ---------------------------------------------------------------------------
const SessionQuerySchema = z.object({
    sessionId: z.string().uuid({ message: 'Invalid sessionId' }),
});
router.get('/balance', (req, res) => {
    const parse = SessionQuerySchema.safeParse(req.query);
    if (!parse.success) {
        res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
        return;
    }
    const { sessionId } = parse.data;
    const guest = getGuest(sessionId);
    if (!guest) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }
    res.json({ balance: guest.balance / 100 });
});
export default router;
