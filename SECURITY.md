# Security Review (Plinko RGS)

This document records the security review performed per the plan (Section 8). The following guarantees have been verified.

## 8.1 Outcome only after bet

- **Server:** The outcome (slot index, multiplier, win) is computed **only** in `POST /api/plinko/bet` in `backend/src/routes/index.ts`. It is produced by `resolveOutcome()` in `backend/src/plinko/engine.ts`, which is called only after: session validation, balance check, allowlist validation of rows and risk, and debit. There is no endpoint or code path that returns or pre-computes an outcome before a bet.
- **Config/session:** `GET /api/config` and `GET /api/balance` return only paytables (for display), allowed rows/risk, and balance. They never return slot index, RNG state, or any future outcome.
- **Front-end:** The client receives `slotIndex` (and multiplier, win) **only** in the response body of `POST /api/plinko/bet` for that round. It is stored in React state as `lastOutcome` and used solely to drive the animation and UI. No “next result” or preview is requested or shown.

## 8.2 Unpredictability

- **RNG:** Outcome is derived only from Node `crypto.randomBytes()` in `backend/src/plinko/engine.ts` (`randomFloat()` → `weightedSample()`). No client-supplied seed, nonce, or other input influences the draw. `Math.random()` is not used in the outcome path.
- **No leakage:** API responses do not include RNG state, seeds, or raw random bytes. Round logs (bet, slot, multiplier, win, balance) are written to the server console only and are not echoed to the client.
- **Single draw per bet:** One call to `resolveOutcome()` performs one weighted sample and returns one outcome. No reuse of random values across rounds or players.

## 8.3 Player cannot affect the outcome

- **Input validation:** The bet handler strictly validates and allowlists: `sessionId` (must exist in store), `betAmount` (min/max, finite, ≤ balance), `rows` (must be in `ALLOWED_ROWS`: 8, 10, 12, 14), `riskLevel` (must be in `ALLOWED_RISK`: low, medium, high). Invalid values yield 4xx. Client input is not used to index into config without this validation.
- **No client-driven outcome:** No request field (body, query, or header) other than the validated game choices (rows, risk) and bet amount is used to determine the outcome. There is no “seed”, “hint”, or “outcome” parameter in the bet request.
- **Determinism:** The mapping (rows, risk) → paytable and probability distribution is fixed in server config. The only variable inputs to the outcome are the validated params and the server’s RNG.

## 8.4 Front-end information leakage

- **No outcome before bet response:** The UI does not show or compute the outcome before the server’s bet response. Outcome is applied only to state set from that response. No outcome is stored in `localStorage` or the URL before the round completes (only `sessionId` is stored for session restore).
- **No sensitive data in bundle/env:** The front-end does not ship paytable probabilities or RNG logic. `VITE_API_BASE_URL` is used only for the API base URL. Paytables are fetched from the server for display (multipliers only); probabilities are not exposed to the client.
- **History:** `GET /api/history` returns past rounds only. The UI does not display or request future or “next” outcome.
- **Dev/debug:** There are no dev-only endpoints or debug panels that expose “next” outcome or RNG state.

## Summary

| Guarantee              | Status |
|------------------------|--------|
| Outcome only after bet | Verified: outcome only in bet handler; client only receives it in bet response. |
| Unpredictable          | Verified: crypto RNG only; no RNG state in responses. |
| Player cannot affect   | Verified: strict allowlist validation; no client input influences draw. |
| No leakage             | Verified: no outcome in config/balance/session; logs server-side; no outcome in storage/URL before round. |
