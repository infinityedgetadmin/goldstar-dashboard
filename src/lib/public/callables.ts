'use client';
import { httpsCallable } from 'firebase/functions';
import { callables, PlatformError, type CallableInput, type CallableName, type CallableOutput, type PlatformErrorCode } from '@goldstar/platform';
import { publicFirebase } from './firebase';
export function guestCall<N extends CallableName>(name: N) {
  return async (input: CallableInput<N>): Promise<CallableOutput<N>> => {
    const parsed = callables[name].input.parse(input); const fn = httpsCallable(publicFirebase().functions, name);
    try { const res = await fn(parsed); return callables[name].output.parse(res.data) as CallableOutput<N>; }
    catch (e) { const details = (e as { details?: { code?: PlatformErrorCode } }).details; throw new PlatformError(details?.code ?? 'internal', (e as Error).message); }
  };
}
