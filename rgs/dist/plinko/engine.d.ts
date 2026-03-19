export interface PlinkoOutcome {
    slotIndex: number;
    multiplier: number;
    /** Win amount in integer cents. */
    winAmountCents: number;
}
/**
 * Resolve one Plinko round. Called only from bet handler after validation.
 * @param betAmountCents - Bet amount in integer cents (e.g. 150 = $1.50).
 * @returns Outcome with winAmountCents as an integer number of cents.
 */
export declare function resolveOutcome(rows: number, risk: string, betAmountCents: number): PlinkoOutcome | null;
