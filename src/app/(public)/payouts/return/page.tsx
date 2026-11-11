import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Payout setup', robots: { index: false, follow: false } };

export type PayoutReturnState = 'done' | 'refresh' | 'unknown';

/**
 * Classifies Stripe's landing. `done=1` is the Account Link `return_url` (the worker left or
 * completed hosted onboarding); `refresh=1` is the `refresh_url` (the single-use link expired
 * or was revisited). Anything else is someone arriving here directly.
 */
export function classifyReturn(params: { done?: string | string[]; refresh?: string | string[] }): PayoutReturnState {
  if (params.done === '1') return 'done';
  if (params.refresh === '1') return 'refresh';
  return 'unknown';
}

export const PAYOUT_RETURN_COPY: Record<PayoutReturnState, { title: string; body: string }> = {
  done: {
    title: 'Thanks — you can head back to the app',
    body: 'Close this window to return to the Valet app. Your payout status updates there automatically once Stripe finishes reviewing your details.',
  },
  refresh: {
    title: 'That setup link has expired',
    body: 'Close this window, return to the Valet app, and tap “Continue setup” under Payouts to get a fresh link.',
  },
  unknown: {
    title: 'Payout setup',
    body: 'Open the Valet app and go to More → Payouts to set up or manage your payouts.',
  },
};

/**
 * Public landing for Stripe Connect worker onboarding (Plan 8 Task 4). Stripe Account Links
 * require HTTPS return/refresh URLs in live mode, so Functions' `connectOnboardingLink`
 * (`kind: 'worker'`) points both here instead of at a custom app scheme. The page is static
 * server-rendered copy — no session, no JavaScript, no data — and lives under the guest chunk
 * graph (`(public)`), inheriting its minimal root layout.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ done?: string | string[]; refresh?: string | string[] }> }) {
  const state = classifyReturn(await searchParams);
  const copy = PAYOUT_RETURN_COPY[state];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6 py-12">
      <h1 className="font-display text-2xl font-semibold text-text-primary">{copy.title}</h1>
      <p className="text-text-secondary">{copy.body}</p>
    </main>
  );
}
