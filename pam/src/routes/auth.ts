import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import {
  getUserByUsername,
  getUserById,
  userCount,
  createUser,
  updateUser,
  MAX_REGISTERED_USERS,
} from '../store.js';
import { logger } from '../logger.js';

const router = Router();

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = '30d';

const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || !process.env.NODE_ENV;

function getJwtSecret(): string {
  const secret = process.env.PAM_JWT_SECRET ?? (isDev ? 'dev-jwt-secret-do-not-use-in-production' : undefined);
  if (!secret) throw new Error('PAM_JWT_SECRET is not set');
  return secret;
}

function signToken(userId: string, username: string): string {
  return jwt.sign({ userId, username }, getJwtSecret(), { expiresIn: JWT_EXPIRY });
}

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const AuthSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, underscores and hyphens'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------
router.post('/register', async (req: Request, res: Response) => {
  const parse = AuthSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const { username, password } = parse.data;

  if (userCount() >= MAX_REGISTERED_USERS) {
    logger.warn({ ip: clientIp(req) }, 'Registration rejected: max users reached');
    res.status(503).json({ error: 'Service unavailable' });
    return;
  }

  const normalised = username.toLowerCase();
  if (getUserByUsername(normalised)) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const now = Date.now();
  const userId = uuidv4();

  createUser({
    userId,
    username: normalised,
    passwordHash,
    createdAt: now,
    lastLoginAt: now,
    createdByIp: clientIp(req),
    wallets: { FUN: 100_000, USD: 0, EUR: 0, GBP: 0, CAD: 0 },
  });

  const token = signToken(userId, normalised);
  logger.info({ userId, username: normalised }, 'User registered');
  res.status(201).json({ token, userId, username: normalised });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
router.post('/login', async (req: Request, res: Response) => {
  const parse = AuthSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const { username, password } = parse.data;

  const user = getUserByUsername(username.toLowerCase());
  if (!user) {
    // Constant-time comparison to prevent user enumeration
    await bcrypt.hash(password, BCRYPT_ROUNDS);
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  updateUser({ ...user, lastLoginAt: Date.now() });
  const token = signToken(user.userId, user.username);
  logger.info({ userId: user.userId }, 'User logged in');
  res.json({ token, userId: user.userId, username: user.username });
});

// ---------------------------------------------------------------------------
// GET /auth/me — returns only non-sensitive identity fields
// ---------------------------------------------------------------------------
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { userId: string; username: string };
    const user = getUserById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json({ userId: user.userId, username: user.username });
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/logout — stateless JWT; client discards token. Endpoint for UX.
// ---------------------------------------------------------------------------
router.post('/logout', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

export default router;
