import type { Currency, InternalBetRequest, InternalBetResponse } from 'shared';
/**
 * Submit a full batch of bet outcomes to the PAM for atomic processing.
 * Pass either `guestSessionId` (guest play) or `authorizationHeader` (JWT for logged-in play).
 */
export declare function submitBetBatch(params: {
    guestSessionId?: string;
    authorizationHeader?: string;
    currency: Currency;
    bets: InternalBetRequest['bets'];
}): Promise<InternalBetResponse>;
