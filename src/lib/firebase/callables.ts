'use client';
import { httpsCallable } from 'firebase/functions';
import {
  callables,
  PlatformError,
  type CallableInput,
  type CallableName,
  type CallableOutput,
  type PlatformErrorCode,
} from '@goldstar/platform';
import { firebase } from './client';

/**
 * Authenticated (dashboard) callable wrapper. Structurally identical to
 * `src/lib/public/callables.ts`'s `guestCall` (zod-parse input/output,
 * `PlatformError` extraction from the Cloud Functions error `details`) —
 * disclosed duplication rather than sharing, per task-2-report.md: the
 * two differ only in which `functions` instance they call through
 * (`firebase().functions` here vs. `publicFirebase().functions` there),
 * and extracting a shared factory would mean either editing the guest
 * surface's protected `src/lib/public/callables.ts` to import from a new
 * common module (an unnecessary touch to a file this task must not
 * regress) or introducing a third module for ~10 lines of logic. Kept as
 * two small, independently-readable files instead.
 *
 * `httpsCallable` on this app's `Auth`/`Functions` pair (both created off
 * the same `FirebaseApp` in `client.ts`) automatically attaches the
 * signed-in user's ID token as the callable's Authorization context — no
 * extra wiring needed here.
 */
export function callable<N extends CallableName>(name: N) {
  return async (input: CallableInput<N>): Promise<CallableOutput<N>> => {
    const parsed = callables[name].input.parse(input);
    const fn = httpsCallable(firebase().functions, name);
    try {
      const res = await fn(parsed);
      return callables[name].output.parse(res.data) as CallableOutput<N>;
    } catch (e) {
      const details = (e as { details?: { code?: PlatformErrorCode } }).details;
      throw new PlatformError(details?.code ?? 'internal', (e as Error).message);
    }
  };
}
