'use client';
import { AlertTriangle } from 'lucide-react';
import { Heading, Text } from '@/components/ui/typography';
import { Button } from '@/components/ui/buttons';
import { useSession } from './use-session';

/**
 * Shown when `session.status === 'error'` — a required session document (the operator record, or
 * the caller's own user record) failed to load (Plan 8 carry #43).
 *
 * Before this, that failure was indistinguishable from a slow one: no error callback existed on
 * either `onSnapshot`, so the shell sat on "Loading…" forever with no message and no way out. A
 * spinner that never resolves is worse than an error, because the user has no idea whether to
 * wait, retry, or ask for help.
 *
 * The copy says what is true and no more. It does NOT guess at a cause — the client cannot tell a
 * permissions problem from a deleted operator from a Firestore outage, and inventing one sends
 * the user to the wrong person. It offers the two things that can actually help: try again, and
 * sign out.
 *
 * Composed from existing primitives (`Heading`/`Text`/`Button`) and shaped like `no-access/page`,
 * so the three shells share one honest screen instead of three near-copies.
 */
export function SessionErrorScreen() {
  const session = useSession();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg-secondary px-6 text-center">
      <AlertTriangle className="h-10 w-10 text-warning-500" aria-hidden="true" />
      <Heading level={1} variant="heading-lg" font="display">
        We couldn&apos;t load your account
      </Heading>
      <Text size="md" color="secondary" className="max-w-md">
        Something went wrong loading your operator details, so we can&apos;t show your dashboard
        yet. This is usually temporary — try again, and if it keeps happening contact your operator
        admin.
      </Text>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => session.retry()}>Try again</Button>
        <Button variant="secondary" onClick={() => void session.signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
