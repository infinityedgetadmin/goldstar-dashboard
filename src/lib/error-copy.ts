/**
 * Dashboard error-copy surface.
 *
 * DRY: the guest surface's `src/lib/public/error-copy.ts` already owns the
 * canonical `PlatformErrorCode -> user-facing copy` map (kept in sync with
 * goldstar-mobile's error copy by hand, per that file's own header). The
 * dashboard re-exports it rather than duplicating the map, and adds
 * `sanitizeError`, which the guest surface doesn't need (every guest error
 * is already a `PlatformError` coming back from a callable) but the
 * dashboard does: dashboard code also has to handle plain `Error`s, network
 * failures, and anything else a fetch/mutation can throw, and per this
 * workspace's error-handling rule, none of those raw messages may ever
 * reach the UI.
 */
import { PlatformError, type PlatformErrorCode } from '@goldstar/platform';
import { errorCopy } from './public/error-copy';

export { errorCopy } from './public/error-copy';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Maps any thrown value to a safe, user-facing message, logging the raw
 * error for observability along the way.
 *
 * - A `PlatformError` resolves through the shared `errorCopy` map.
 * - Anything else (network failures, unexpected exceptions, non-Error
 *   throws) falls back to a generic message — never `error.message`,
 *   never a stack trace, never an HTTP status code, reaches the UI.
 *
 * Fix round 1 (Nit, task-2-review.md): this used to leave logging to each
 * call site ("callers are still responsible for logging..."), but
 * grepping every guest + dashboard call site of `sanitizeError`/`errorCopy`
 * in this repo found zero that actually did — the raw error was silently
 * discarded everywhere. Logging here instead guarantees it happens
 * exactly once, rather than depending on every caller to remember.
 * `console.error` is a placeholder observability sink — no Sentry (or
 * equivalent) SDK is installed in this repo yet; swap this for a real
 * `reportError`/Sentry call once that lands.
 */
export function sanitizeError(error: unknown): string {
  console.error('[dashboard] unhandled error:', error);
  if (error instanceof PlatformError) {
    return errorCopy(error.code as PlatformErrorCode);
  }
  return GENERIC_MESSAGE;
}
