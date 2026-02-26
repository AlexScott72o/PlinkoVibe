# Plinko Go!

A browser-based Plinko casino game with a simple Remote Gaming Server (RGS) backend. The front-end never computes outcomes; the server is authoritative for RNG, paytables, and balance.

## Architecture

- **Front-end** (Vite + React + TypeScript): Renders the board, collects bet/rows/risk, calls the API to place a bet, receives the outcome (slot index, multiplier, win, balance), and animates the ball to the server-determined slot. No outcome logic or RNG on the client.
- **Back-end** (Node.js + Express): RGS-lite that hosts Plinko math (paytables, probability distributions, weighted RNG), session and balance store, and REST API. Outcome is computed only inside the bet handler, after validation.
- **Shared**: TypeScript types for API request/response and game models.

## Run

```bash
npm install
npm run dev
```

This starts the backend on `http://0.0.0.0:4000` and the frontend on `http://localhost:5173`. Open the frontend URL in your browser.

- **Build**: `npm run build` (builds frontend to `frontend/dist`). Serve the backend and the `frontend/dist` static files (e.g. from Express or any static host).

## Environment

| Variable | Where | Description |
|----------|--------|-------------|
| `PORT` | Backend | Server port (default `4000`). |
| `VITE_API_BASE_URL` | Frontend | API base URL. Leave empty in dev to use the Vite proxy to `localhost:4000`. For LAN (e.g. iOS), set to `http://<your-machine-LAN-IP>:4000`. |
| `GEMINI_API_KEY` | Asset script only | Optional. Used by `node scripts/generate-assets.js` to generate design/sound briefs. Not used at runtime. |

Copy `.env.example` to `.env` and set values as needed.

## Game math

- The server stores, per (rows, risk), a **paytable** (multiplier per slot index) and a **probability distribution** (weights per slot). The distribution is designer-controlled and roughly binomial-like (more hits in the center, rare at the edges).
- **RTP** = Σ (probability of slot k × multiplier of slot k). Configs are set for ~96–97% RTP; see below for where to change them.
- On each bet, the server **validates** the request (session, balance, bet amount, rows, risk), **debits** the balance, **samples** the outcome slot from the distribution using **crypto** RNG, **credits** win = bet × multiplier, **logs** the round, and **returns** the outcome and new balance. The outcome is never computed or exposed before the bet is placed.

### Paytables and RTP

- **Location**: `backend/src/plinko/config.ts` (and any JSON you add under `backend/src/plinko/config/`).
- **Allowed rows**: 8, 10, 12, 14. **Risk levels**: low, medium, high.
- To add another **RTP variant** (e.g. 98.98%): add or switch to a different set of multiplier/weight tables keyed by (rows, risk). No change to bet flow code—only data.

## RTP inspection

Each round is logged on the server console, e.g.:

```
[RGS] round=<uuid> bet=1 slot=5 mult=1 win=1 balance=1000
```

You can also call `GET /api/history?sessionId=...&limit=N` to fetch the last N rounds and compute realized RTP (total win / total bet) over that window.

## iOS / play on LAN

1. Ensure the backend and frontend dev server are running on your machine.
2. Find your machine’s LAN IP (e.g. System Preferences → Network, or `ifconfig` / `ip addr`).
3. **Option A** (Vite proxy from desktop): On your iOS device, open `http://<LAN-IP>:5173`. The frontend will load; API requests go to the same host (Vite proxies `/api` to the backend). Your dev server must be bound to all interfaces (Vite’s `server.host: true` is set).
4. **Option B**: Set `VITE_API_BASE_URL=http://<LAN-IP>:4000` in `.env`, rebuild or run dev, then on iOS open `http://<LAN-IP>:5173`. The client will call the backend at the LAN IP directly.

## Asset generation (Gemini)

To generate design and sound briefs (and optionally use them to create images/sounds):

1. Get an API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Run: `GEMINI_API_KEY=your_key node scripts/generate-assets.js`
3. Output is written to `assets/` (`design-brief.md`, `sound-descriptions.md`). Use these to commission or generate visuals and SFX; place image/audio files in `assets/` or `frontend/public/sounds/` and reference them in the app.

## Security

See [SECURITY.md](SECURITY.md) for the security review: outcome-only-after-bet, unpredictability, no client influence on outcome, and no front-end leakage.

## API

- `POST /api/session` — Create session; returns `{ sessionId, balance }`.
- `GET /api/config?sessionId=...` — Config (rows, risk levels, paytables, min/max bet). No outcome data.
- `POST /api/plinko/bet` — Body: `{ sessionId, betAmount, rows, riskLevel }`. Returns `{ slotIndex, multiplier, winAmount, balance, roundId }`. Outcome computed only here.
- `GET /api/balance?sessionId=...` — Current balance.
- `GET /api/history?sessionId=...&limit=N` — Last N rounds (past only).
