/**
 * Plinko outcome resolution. Outcome is computed only here, after bet is validated.
 * Uses only server-side crypto RNG; no client input affects the draw.
 */
import { getConfig } from './config.js';
import { randomBytes } from 'crypto';
/**
 * Returns a random number in [0, 1) using crypto (for weighted sample).
 * One draw per call; no state exposed.
 */
function randomFloat() {
    const buf = randomBytes(4);
    const u32 = buf.readUInt32BE(0);
    return u32 / (0xffff_ffff + 1);
}
/**
 * Sample slot index from discrete distribution (weights sum to 1).
 * Uses single crypto draw. No client input used.
 */
function weightedSample(weights) {
    const r = randomFloat();
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
        acc += weights[i];
        if (r < acc)
            return i;
    }
    return weights.length - 1;
}
/**
 * Resolve one Plinko round. Called only from bet handler after validation.
 * @param betAmountCents - Bet amount in integer cents (e.g. 150 = $1.50).
 * @returns Outcome with winAmountCents as an integer number of cents.
 */
export function resolveOutcome(rows, risk, betAmountCents) {
    const config = getConfig(rows, risk);
    if (!config || config.multipliers.length === 0)
        return null;
    const slotIndex = weightedSample(config.weights);
    const multiplier = config.multipliers[slotIndex] ?? 0;
    const winAmountCents = Math.round(betAmountCents * multiplier);
    return { slotIndex, multiplier, winAmountCents };
}
