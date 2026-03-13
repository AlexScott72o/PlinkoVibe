import fs from 'fs';
import https from 'https';
import express from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import apiRouter from './routes/index.js';
import { logger } from './logger.js';

const app = express();
const PORT = process.env.PORT ?? 4000;

const nodeEnv = process.env.NODE_ENV ?? '';
const isLocalEnv = nodeEnv === 'development' || nodeEnv === 'test' || nodeEnv === '';
const behindTlsProxy = process.env.BEHIND_TLS_PROXY === 'true';

const tlsCertPath = process.env.TLS_CERT_PATH;
const tlsKeyPath = process.env.TLS_KEY_PATH;
const useHttps = Boolean(tlsCertPath && tlsKeyPath);

if (!isLocalEnv && !useHttps && !behindTlsProxy) {
  logger.error(
    'Security: server cannot start over HTTP when not in a local environment. ' +
    'Set NODE_ENV=development for local HTTP, set TLS_CERT_PATH and TLS_KEY_PATH for HTTPS, ' +
    'or explicitly set BEHIND_TLS_PROXY=true when running behind a TLS-terminating reverse proxy.'
  );
  process.exit(1);
}

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
    allowedHeaders: ['Content-Type', 'Authorization'],
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
    xssFilter: true,
  })
);

// ---------------------------------------------------------------------------
// Body parsing — only for methods that send a body (avoids 400 on GET with body)
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  express.json({ limit: '2kb' })(req, res, next);
});

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

/** Per-player limit on bets: keyed on guestSessionId or IP. */
const betLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body = req.body as { guestSessionId?: string } | undefined;
    return body?.guestSessionId ?? req.ip ?? 'unknown';
  },
  message: { error: 'Too many bets — slow down' },
});

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

app.use(globalLimiter);
app.use('/api/plinko/bet', betLimiter);
app.use('/api/config', readLimiter);
app.use('/api/history', readLimiter);

app.use('/api', apiRouter);

// ---------------------------------------------------------------------------
// Error handler — log and return 500 for unhandled errors (e.g. body-parser)
// ---------------------------------------------------------------------------
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal error' });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
if (useHttps) {
  const key = fs.readFileSync(tlsKeyPath!, 'utf8');
  const cert = fs.readFileSync(tlsCertPath!, 'utf8');
  const server = https.createServer(
    { key, cert, minVersion: 'TLSv1.3' },
    app
  );
  server.listen(Number(PORT), '0.0.0.0', () => {
    logger.info({ port: PORT, tls: true }, 'RGS listening');
  });
} else {
  app.listen(Number(PORT), '0.0.0.0', () => {
    logger.info(
      { port: PORT, proxy: behindTlsProxy },
      `RGS listening${behindTlsProxy ? ' (behind TLS-terminating proxy)' : ''}`
    );
  });
}
