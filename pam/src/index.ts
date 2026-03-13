import express from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initStore } from './store.js';
import { logger } from './logger.js';
import authRouter from './routes/auth.js';
import walletRouter from './routes/wallet.js';
import guestRouter from './routes/guests.js';
import internalRouter from './routes/internal.js';

const app = express();
const PORT = process.env.PORT ?? 4001;

const nodeEnv = process.env.NODE_ENV ?? '';
const isLocalEnv = nodeEnv === 'development' || nodeEnv === 'test' || nodeEnv === '';
const behindTlsProxy = process.env.BEHIND_TLS_PROXY === 'true';

if (behindTlsProxy) {
  app.set('trust proxy', 1);
}

// ---------------------------------------------------------------------------
// CORS — restrict to configured origins only
// ---------------------------------------------------------------------------
const corsOrigins: CorsOptions['origin'] = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : isLocalEnv
    ? ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174']
    : false;

app.use(
  cors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Signature'],
    credentials: false,
  })
);

// ---------------------------------------------------------------------------
// Security headers via Helmet
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true },
    frameguard: { action: 'deny' },
    noSniff: true,
  })
);

// ---------------------------------------------------------------------------
// Body parsing — 2 kb limit; bet batches can be slightly larger than RGS
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '2kb' }));

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

/** Registration: 5 attempts per IP per hour to prevent account spam. */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts' },
});

/** Login: 10 attempts per IP per 15 minutes (brute-force protection). */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts — try again later' },
});

/** Guest session creation: 10 per IP per hour. */
const guestSessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sessions created from this IP' },
});

app.use(globalLimiter);
app.use('/auth/register', registerLimiter);
app.use('/auth/login', loginLimiter);
app.use('/guest/session', guestSessionLimiter);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true, service: 'pam' }));
app.use('/auth', authRouter);
app.use('/wallet', walletRouter);
app.use('/guest', guestRouter);
app.use('/internal', internalRouter);

// ---------------------------------------------------------------------------
// Initialise data store
// ---------------------------------------------------------------------------
initStore();

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(Number(PORT), '0.0.0.0', () => {
  logger.info(
    { port: PORT, proxy: behindTlsProxy },
    `PAM listening${behindTlsProxy ? ' (behind TLS-terminating proxy)' : ''}`
  );
});
