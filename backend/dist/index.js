import fs from 'fs';
import https from 'https';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import apiRouter from './routes/index.js';
import { logger } from './logger.js';
const app = express();
const PORT = process.env.PORT ?? 4000;
/** Local env: development or test; HTTP is allowed. Non-local requires HTTPS or a TLS proxy. */
const nodeEnv = process.env.NODE_ENV ?? '';
const isLocalEnv = nodeEnv === 'development' || nodeEnv === 'test' || nodeEnv === '';
const behindTlsProxy = process.env.BEHIND_TLS_PROXY === 'true';
const tlsCertPath = process.env.TLS_CERT_PATH;
const tlsKeyPath = process.env.TLS_KEY_PATH;
const useHttps = Boolean(tlsCertPath && tlsKeyPath);
if (!isLocalEnv && !useHttps && !behindTlsProxy) {
    logger.error('Security: server cannot start over HTTP when not in a local environment. ' +
        'Set NODE_ENV=development for local HTTP, set TLS_CERT_PATH and TLS_KEY_PATH for HTTPS, ' +
        'or explicitly set BEHIND_TLS_PROXY=true when running behind a TLS-terminating reverse proxy.');
    process.exit(1);
}
// trust proxy must be set before any middleware that reads req.ip
if (behindTlsProxy) {
    app.set('trust proxy', 1);
}
// ---------------------------------------------------------------------------
// CORS — restrict to configured origins only
// ---------------------------------------------------------------------------
const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : isLocalEnv
        ? ['http://localhost:5173', 'http://localhost:4173']
        : false; // deny all cross-origin requests if CORS_ORIGINS is not set in production
app.use(cors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false,
}));
// ---------------------------------------------------------------------------
// Security headers via Helmet
// ---------------------------------------------------------------------------
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'none'"],
            frameAncestors: ["'none'"],
        },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
}));
// ---------------------------------------------------------------------------
// Body parsing — 1 kb limit; all payloads are tiny
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '1kb' }));
// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
/** Global IP-level rate limit applied to every request. */
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
});
/** Tight limit on session creation to prevent free-balance spam. */
const sessionCreateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many sessions created from this IP' },
});
/** Per-session limit on bets. Key is the session ID from the request body so each player has their own bucket. */
const betLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const sessionId = req.body?.sessionId;
        return sessionId ?? req.ip ?? 'unknown';
    },
    message: { error: 'Too many bets — slow down' },
});
/** General read endpoint limit (balance, config, history). */
const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
});
app.use(globalLimiter);
// Attach per-endpoint limiters via the router after mounting
// (express-rate-limit can also be used per-route in the router file,
//  but injecting here keeps all security middleware in one place).
app.use('/api/session', sessionCreateLimiter);
app.use('/api/plinko/bet', betLimiter);
app.use('/api/balance', readLimiter);
app.use('/api/config', readLimiter);
app.use('/api/history', readLimiter);
app.use('/api', apiRouter);
// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
if (useHttps) {
    const key = fs.readFileSync(tlsKeyPath, 'utf8');
    const cert = fs.readFileSync(tlsCertPath, 'utf8');
    const server = https.createServer({
        key,
        cert,
        minVersion: 'TLSv1.3',
    }, app);
    server.listen(Number(PORT), '0.0.0.0', () => {
        logger.info({ port: PORT, tls: true }, 'RGS listening');
    });
}
else {
    app.listen(Number(PORT), '0.0.0.0', () => {
        logger.info({ port: PORT, proxy: behindTlsProxy }, `RGS listening${behindTlsProxy ? ' (behind TLS-terminating proxy)' : ''}`);
    });
}
