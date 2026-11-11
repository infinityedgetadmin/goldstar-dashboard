/**
 * User-facing copy for Firebase Auth error codes. Separate from
 * `src/lib/error-copy.ts`, which only maps `@goldstar/platform`'s
 * `PlatformErrorCode` (callable errors) — Firebase Auth throws
 * `FirebaseError`s with its own `auth/*` code namespace, which
 * `sanitizeError` doesn't recognize and would fall through to its generic
 * message for. Per this workspace's error-handling rule ("map known error
 * patterns to specific messages ... default to a generic fallback for the
 * rest"), the common, actionable sign-in/MFA failures get honest, specific
 * copy; anything unrecognized still falls back to a generic message and
 * never leaks `error.message`.
 */
const GENERIC = 'Something went wrong. Please try again.';

const KNOWN: Record<string, string> = {
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/user-disabled': 'This account has been disabled. Contact your operator admin.',
  'auth/user-not-found': 'Invalid email or password.',
  'auth/wrong-password': 'Invalid email or password.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/invalid-login-credentials': 'Invalid email or password.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/invalid-verification-code': 'That code is incorrect. Try again.',
  'auth/code-expired': 'That code expired. Request a new one.',
  'auth/expired-action-code': 'This link has expired. Request a new one.',
  'auth/invalid-action-code': 'This link is invalid or has already been used.',
  'auth/weak-password': 'Choose a stronger password (at least 6 characters).',
};

/** Extracts a Firebase Auth-style `code` (e.g. `auth/wrong-password`) from any thrown value, without assuming its shape. */
export function authErrorCode(e: unknown): string | undefined {
  if (typeof e !== 'object' || e === null || !('code' in e)) return undefined;
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Maps a thrown Firebase Auth error to safe, user-facing copy. Never
 * returns `error.message`. Logs the raw error first — Fix round 1
 * (task-2-review.md), same reasoning and same placeholder-until-Sentry
 * caveat as `src/lib/error-copy.ts`'s `sanitizeError`, which this
 * mirrors for consistency (a `FirebaseError`'s `auth/*` code isn't
 * something `sanitizeError` recognizes, which is why this is a separate
 * function rather than routing through it — but both are "map an
 * arbitrary caught error to safe copy" functions and should log the same
 * way).
 */
export function authErrorCopy(e: unknown): string {
  console.error('[dashboard] unhandled auth error:', e);
  const code = authErrorCode(e);
  return (code && KNOWN[code]) || GENERIC;
}
