import { ERROR_COPY_KEY, type PlatformErrorCode } from '@goldstar/platform';

/**
 * User-facing copy for every `PlatformErrorCode`. Mirrors the `errors.*`
 * entries of goldstar-mobile's `src/lib/i18n/en.ts` (the mobile app's
 * canonical guest/staff error copy map) — kept in sync by hand, same as
 * that file's own header comment describes. `errors.offline` from the
 * mobile map is not included here: it's a network-status message, not
 * keyed off any `PlatformErrorCode`/`ERROR_COPY_KEY` entry.
 *
 * Never show `PlatformError.message` (or any raw backend error) to a
 * guest — always resolve through this map instead.
 */
const COPY_BY_KEY: Record<string, string> = {
  'errors.signInRequired': 'Please sign in to continue.',
  'errors.notAllowed': "You don't have access to do that.",
  'errors.notFound': "We couldn't find that.",
  'errors.invalidInput': 'Please check the highlighted fields.',
  'errors.notReady': "That isn't available right now.",
  'errors.alreadyExists': 'That already exists.',
  'errors.slowDown': 'Please wait a moment and try again.',
  'errors.ticketState': "That action isn't available for this ticket's status.",
  'errors.ticketClosed': 'This ticket is closed.',
  'errors.linkExpired': 'This link has expired.',
  'errors.paymentFailed': "The payment didn't go through. Please try another method.",
  'errors.alreadyPaid': 'This ticket is already paid.',
  'errors.driverNotEligible': 'This driver is not eligible for this job.',
  'errors.serviceUnavailable': 'A service is temporarily unavailable. Please try again.',
  'errors.generic': 'Something went wrong. Please try again.',
};

const GENERIC = COPY_BY_KEY['errors.generic'];

/** Maps a `PlatformErrorCode` to sanitized, user-facing copy. Falls back to a generic message for any unmapped code. */
export function errorCopy(code: PlatformErrorCode): string {
  const key = ERROR_COPY_KEY[code];
  return (key && COPY_BY_KEY[key]) || GENERIC;
}
