# Security Review (Plinko RGS)

This document records the security guarantees and hardening measures applied to the PlinkoVibe backend.

---

## Transport Security (Production)

- **Backend:** When `TLS_CERT_PATH` and `TLS_KEY_PATH` are set, the server listens over HTTPS and accepts only **TLS 1.3 or later** (`minVersion: 'TLSv1.3'`). Certificates must be PEM-format (e.g. from a public CA or Let's Encrypt).
- **HTTPS required outside local:** The server **refuses to start** over HTTP unless it is in a local environment (`NODE_ENV` equal to `development`, `test`, or unset). For any other `NODE_ENV` (e.g. `production`), both `TLS_CERT_PATH` and `TLS_KEY_PATH` must be set, or `BEHIND_TLS_PROXY=true` must be set, otherwise the process exits.
- **Frontend:** In production, set `VITE_API_BASE_URL` to the backend origin using **https** (e.g. `https://api.example.com`) so all API requests use TLS 1.3+.

---

## Outcome Integrity

- **Server-only:** The outcome (slot index, multiplier, win) is computed **only** in `POST /api/plinko/bet` in `backend/src/routes/index.ts`, after session, balance, and input validation. No endpoint pre-computes or leaks an outcome.
- **No client influence:** No request field other than validated game parameters (`rows`, `riskLevel`) and `betAmount` is used to determine the outcome. There is no seed, hint, or outcome parameter in the bet request.
- **Config/session:** `GET /api/config` and `GET /api/balance` return only display data (multipliers, allowed rows/risk, balance). They never return RNG state, probabilities, or any future outcome.

---

## Unpredictable RNG

- **RNG:** Outcome is derived only from Node `crypto.randomBytes()` in `backend/src/plinko/engine.ts` (`randomFloat()` → `weightedSample()`). `Math.random()` is not used. No client-supplied seed or nonce influences the draw.
- **Single draw per bet:** One call to `resolveOutcome()` performs one weighted sample and returns one outcome. No reuse of random values across rounds or players.
- **No leakage:** API responses do not include RNG state, seeds, or raw random bytes.

---

## Race Condition Prevention (Concurrent Bets)

- **Per-session mutex:** The bet handler acquires a per-session `Mutex` (from `async-mutex`) before reading the balance and holds it until the final balance update and history append. This serialises all concurrent requests for the same session, making it impossible for two simultaneous bets to both pass the balance check and double-spend.

---

## Integer Arithmetic (No Float Drift)

- **Cents storage:** All balances and bet/win amounts are stored internally as **integer cents** (e.g. `100000` = $1000.00). All arithmetic on monetary values uses integer addition/subtraction; win amounts are computed with `Math.round(betAmountCents * multiplier)`. The API converts to/from dollars at the boundary. This eliminates floating-point accumulation errors.

---

## Input Validation (Zod)

- **Schema validation:** All request bodies and query parameters are validated with `zod` schemas before any processing:
  - `sessionId`: must be a valid UUID v4 string (rejects prototype-pollution strings, non-UUIDs)
  - `betAmount`: must be a finite number in `[MIN_BET, MAX_BET]`
  - `rows`: must be one of the server-side `ALLOWED_ROWS`
  - `riskLevel`: must be one of `ALLOWED_RISK`
  - `limit` (history): parsed from string and clamped to `[1, 100]`
- Invalid inputs return `400` with an error message; no processing occurs.

---

## Rate Limiting

Applied via `express-rate-limit`:

| Scope | Endpoint | Limit |
|-------|----------|-------|
| Global (all IPs) | All endpoints | 300 req / IP / minute |
| Session creation | `POST /api/session` | 10 req / IP / hour |
| Bet placement | `POST /api/plinko/bet` | 60 req / session / minute |
| Read endpoints | `GET /api/balance`, `/api/config`, `/api/history` | 60 req / IP / minute |

Rate limit responses include `RateLimit-*` standard headers. The bet limiter keys by session ID (from request body) so each player has their own bucket even if multiple players share an IP.

---

## CORS

- **Restricted origins:** CORS is restricted to the origin(s) listed in the `CORS_ORIGINS` environment variable (comma-separated). In local development, `http://localhost:5173` and `http://localhost:4173` are allowed by default. If `CORS_ORIGINS` is not set in production, cross-origin requests are denied.
- Only `GET`, `POST`, and `OPTIONS` methods are allowed. Only `Content-Type` header is allowed.

---

## Security Headers (Helmet)

- **CSP:** `default-src 'none'; frame-ancestors 'none'` — API responses carry a strict Content Security Policy.
- **HSTS:** `max-age=31536000; includeSubDomains` (1 year).
- **X-Frame-Options:** `DENY` — prevents clickjacking.
- **X-Content-Type-Options:** `nosniff`.
- **XSS protection header** included.

---

## Request Body Size Limit

- `express.json({ limit: '1kb' })` — bodies larger than 1 KB are rejected with `413`. All API payloads are small JSON objects; this prevents payload-inflation attacks.

---

## Session Management

- **Session cap:** A maximum of `10,000` active sessions is enforced. New session requests are rejected with `503` when the cap is reached.
- **TTL / cleanup:** Sessions inactive for more than **24 hours** are purged automatically. A cleanup pass runs at startup and every **10 minutes** thereafter using a non-blocking interval (`setInterval(...).unref()`). Expired history records are purged alongside their sessions.
- **History cap:** Each session retains a maximum of **500** history records; older records are trimmed on each append.
- **IP tracking:** Each session records the creating IP address (`createdByIp`) for audit and abuse investigation.
- **lastActiveAt:** Updated on every balance change (bet), enabling accurate TTL calculation.

---

## Atomic File Writes

- `persistSessions()` and `persistHistory()` write to a temp file (`.{pid}.tmp`) then rename atomically. A crash during the write leaves the previous file intact, preventing corruption.

---

## Structured Audit Logging

- All logging uses `pino` (structured JSON). Key security events logged:
  - Session creation (with IP)
  - Session cap rejection (with IP)
  - Bet resolved (roundId, session, bet, slot, multiplier, win, balance — all in cents)
  - Bet rejected: invalid request, insufficient balance, session not found
  - Unexpected errors in the bet handler
  - Session cleanup (count of removed sessions)
  - Server start (port, TLS status, proxy status)
- Log level configurable via `LOG_LEVEL` env var (default: `info`).

---

## Secrets in Version Control

- `.gitignore` includes `.env`, `.env.local`, `.env.*.local` — secrets cannot be accidentally committed.
- `data/sessions.json` and `data/history.json` are also gitignored.
- `.env.example` contains only placeholder values (no secrets).

---

## Front-End Information Leakage

- **No outcome before bet response:** The UI does not compute or display the outcome before the server's bet response. The result-after-landing rule ensures the balance and results list are only updated in `onLand`, not when the API call resolves.
- **No sensitive data in bundle:** The frontend does not ship paytable probabilities or RNG logic. `VITE_API_BASE_URL` is used only for the API base URL. Multipliers are fetched for display only; probability weights are not exposed.
- **No debug panels or dev-only endpoints.**

---

## Summary Table

| Guarantee | Status |
|-----------|--------|
| Race condition prevention (mutex) | Verified: per-session lock in bet handler |
| Integer arithmetic (no float drift) | Verified: all balances stored and computed in cents |
| Input validation (zod) | Verified: strict schemas on all endpoints |
| Rate limiting | Verified: global + per-endpoint limits |
| CORS restricted | Verified: allowlist via `CORS_ORIGINS` |
| Security headers | Verified: Helmet (CSP, HSTS, X-Frame-Options) |
| Body size limit | Verified: 1 kb cap |
| Session TTL + cleanup | Verified: 24h TTL, 10 min interval, 10k cap |
| Atomic file writes | Verified: temp-rename pattern |
| Structured audit logging | Verified: pino, security events logged |
| Secrets not in git | Verified: .env in .gitignore |
| Outcome only after bet | Verified: outcome only in bet handler |
| Unpredictable RNG | Verified: crypto.randomBytes only, no client influence |
| No outcome leakage | Verified: config/balance/session return no outcome data |
| TLS enforced in production | Verified: process exits if no TLS and not local/proxy |
