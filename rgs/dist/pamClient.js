/**
 * PAM client for the RGS.
 * All calls are HMAC-SHA256 signed using PAM_HMAC_SECRET.
 * The Authorization header (JWT) is forwarded transparently for logged-in players.
 */
import { createHmac } from 'crypto';
import { logger } from './logger.js';
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || !process.env.NODE_ENV;
function getPamBaseUrl() {
    const url = process.env.PAM_BASE_URL ?? (isDev ? 'http://localhost:4001' : undefined);
    if (!url)
        throw new Error('PAM_BASE_URL is not set');
    return url;
}
function getHmacSecret() {
    const secret = process.env.PAM_HMAC_SECRET ?? (isDev ? 'dev-hmac-secret-do-not-use-in-production' : undefined);
    if (!secret)
        throw new Error('PAM_HMAC_SECRET is not set');
    return secret;
}
function signBody(body) {
    return createHmac('sha256', getHmacSecret()).update(body).digest('hex');
}
async function pamPost(path, body, authorizationHeader) {
    const url = `${getPamBaseUrl()}${path}`;
    const bodyStr = JSON.stringify(body);
    const signature = signBody(bodyStr);
    const headers = {
        'Content-Type': 'application/json',
        'X-Signature': signature,
    };
    if (authorizationHeader) {
        headers['Authorization'] = authorizationHeader;
    }
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyStr,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'PAM request failed' }));
        const message = err.error ?? 'PAM request failed';
        logger.error({ path, status: res.status, error: message }, 'PAM call failed');
        throw Object.assign(new Error(message), { pamStatus: res.status });
    }
    return res.json();
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Submit a full batch of bet outcomes to the PAM for atomic processing.
 * Pass either `guestSessionId` (guest play) or `authorizationHeader` (JWT for logged-in play).
 */
export async function submitBetBatch(params) {
    const { guestSessionId, authorizationHeader, currency, bets } = params;
    const body = { guestSessionId, currency, bets };
    return pamPost('/internal/wallet/bet', body, authorizationHeader);
}
