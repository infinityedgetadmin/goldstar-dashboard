/**
 * Payment statuses that read as "paid" from the guest's perspective — a
 * room charge or venue bill settles the ticket just as much as a card
 * payment does. Shared between `ticket-view.tsx` (gates the "Pay & tip"
 * button / receipt view), `pay-sheet.tsx` (gates the "Paid — thank you"
 * view and its auto-close timer), and `closed-view.tsx` (gates the receipt
 * on a closed ticket — deferred item (b), final review: that was a third
 * byte-for-byte copy) — extracted here (Fix round 1, review nit) since it
 * had drifted into a duplicate across files more than once.
 */
export const PAID_STATUSES = new Set(['paid', 'room_charged', 'venue_billed']);
