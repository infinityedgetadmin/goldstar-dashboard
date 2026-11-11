/**
 * Sonner wrapper for dashboard toast notifications.
 *
 * Per this workspace's error-handling rule, no dashboard call site may pass
 * a raw `error.message` (or any other unsanitized string) into a toast —
 * `toast.error` only accepts a `PlatformErrorCode` or an arbitrary thrown
 * value, and always resolves it through `sanitizeError` before it reaches
 * the UI. For a message that's already known-safe (e.g. "Ride assigned"),
 * use `toast.success`.
 */
import { toast as sonnerToast } from 'sonner';
import { sanitizeError } from './error-copy';

export const toast = {
  /** Shows a success toast. `message` must already be safe, user-facing copy. */
  success(message: string) {
    sonnerToast.success(message);
  },
  /**
   * Shows an error toast for anything caught from a request/mutation. Never pass
   * `error.message` here directly — pass the caught `error` itself; it always goes through
   * `sanitizeError` regardless of `context`.
   *
   * `context` (Fix round 1, task-4-review.md M2): an optional, already-safe, caller-authored
   * label prefixed onto the sanitized message — e.g. which of several independent operations
   * failed ("Account SID"). It's for identifying WHICH thing failed when a batch of
   * independent calls can fail individually (`secrets-card.tsx`'s per-field save), not for
   * carrying error detail — `context` must never be built from `error.message` or any other
   * raw error content.
   */
  error(error: unknown, context?: string) {
    const message = sanitizeError(error);
    sonnerToast.error(context ? `${context}: ${message}` : message);
  },
  /** Shows a neutral informational toast. */
  info(message: string) {
    sonnerToast.info(message);
  },
};
