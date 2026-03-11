import fs from 'fs';
import https from 'https';
import express from 'express';
import cors from 'cors';
import apiRouter from './routes/index.js';

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors({ origin: true }));
app.use(express.json());

app.use('/api', apiRouter);

/** Local env: development or test; HTTP is allowed. Non-local (e.g. production) requires HTTPS. */
const nodeEnv = process.env.NODE_ENV ?? '';
const isLocalEnv = nodeEnv === 'development' || nodeEnv === 'test' || nodeEnv === '';

const tlsCertPath = process.env.TLS_CERT_PATH;
const tlsKeyPath = process.env.TLS_KEY_PATH;
const useHttps = Boolean(tlsCertPath && tlsKeyPath);

if (!isLocalEnv && !useHttps) {
  console.error(
    'Security: server cannot start over HTTP when not in a local environment. Set NODE_ENV=development for local HTTP, or set TLS_CERT_PATH and TLS_KEY_PATH for HTTPS.'
  );
  process.exit(1);
}

if (useHttps) {
  const key = fs.readFileSync(tlsKeyPath!, 'utf8');
  const cert = fs.readFileSync(tlsCertPath!, 'utf8');
  const server = https.createServer(
    {
      key,
      cert,
      minVersion: 'TLSv1.3',
    },
    app
  );
  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`RGS listening on https://0.0.0.0:${PORT} (TLS 1.3+)`);
  });
} else {
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`RGS listening on http://0.0.0.0:${PORT}`);
  });
}
