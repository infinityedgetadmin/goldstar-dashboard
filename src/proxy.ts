// Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` (a project
// may not have both files at once — Next throws a build error if it finds
// both). This file replaces the old `src/middleware.ts`.
// See: https://nextjs.org/docs/messages/middleware-to-proxy

import { NextResponse, type NextRequest } from 'next/server';

/**
 * Dashboard route prefixes that require a session. Based on
 * task-2-brief.md's given Step 2 code verbatim, with one disclosed
 * addition: `home` (task-2-report.md). The given regex covers every
 * `(operator)`/`(platform)` nav destination (`src/lib/nav.ts`) EXCEPT
 * the operator shell's own "Home" item — neither `/home` nor root `/`
 * appeared in the original list. Root `/` is `(app)/page.tsx`, which now
 * REDIRECTS to `/home` (it was an "under construction" placeholder until
 * the dashboard shell existed), NOT `(public)`'s — the two root layouts
 * are disjoint route groups (see this repo's the project notes, "Root layouts"),
 * and `/` resolves to `(app)`'s. It stays OUT of PROTECTED deliberately:
 * the redirect lands on `/home`, which IS protected, so an
 * unauthenticated visitor reaches sign-in one hop later and returns to
 * `/home` afterwards; listing `/` too would only change which URL the
 * `next` parameter carries. `home` was added because that's where a signed-in
 * operator actually lands (F6, final-review.md — `sign-in-form.tsx`'s
 * default `next` and the already-authed-visiting-`/sign-in` redirect
 * below both point at `/home`).
 *
 * Plan 7 Task 1a: `venues` -> `venues?`, which adds the venue portal's own
 * `/venue/*` routes (`src/app/(app)/(venue)`, nav list in `lib/nav.ts`'s
 * `VENUE_NAV`) without a second alternative. The `(venue)` shell already
 * redirects an unauthenticated visitor client-side; this keeps it
 * consistent with every other dashboard prefix, which is gated here too.
 */
const PROTECTED = [
  /^\/(home|operators?|venues?|staff|shifts|tickets|live|dispatch|claims|incidents|payments|invoices|reports|integrations|branding|audit|settings|platform)(\/|$)/,
];

/**
 * Merges the brief's session-gate logic with Plan 3's existing guest
 * no-referrer/no-index headers (task-2-report.md — controller ruling:
 * "both must work; public routes NEVER redirect"). `/t/*` and `/pay/*`
 * never match `PROTECTED` (disjoint prefix sets), so there is no path
 * where a guest route both gets redirected AND has its headers set —
 * the two branches below are independent, not competing.
 */
/**
 * Routes reached by a capability URL (a guest ticket token, a venue's static-checkout token) or
 * by a Stripe redirect (`/payouts/return`, Plan 8 Task 4). Never indexed, never leak the token
 * through a referrer, and never framed — a page holding a payment surface framed by a third
 * party is the textbook clickjacking setup (Plan 8 Task 16).
 */
const GUEST_TOKEN_ROUTES = ['/t/', '/pay/', '/payouts/'] as const;

/**
 * Plan 8 Task 16: the anti-framing pair is set on BOTH headers on purpose — `frame-ancestors`
 * is the standard (CSP Level 2) and `X-Frame-Options` is the legacy fallback older engines
 * honour instead. Deliberately NOT a full `script-src`/`style-src` policy: Next.js's inline
 * bootstrap scripts need per-request nonces threaded through `next.config` headers and the
 * root layout to satisfy one, and shipping a policy that blocks the framework's own scripts is
 * a page outage, not a hardening. A nonce-based script policy is a carry, not this change.
 */
const GUEST_ROUTE_HEADERS: Readonly<Record<string, string>> = {
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
};

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = req.cookies.get('gs_auth')?.value === '1';

  if (PROTECTED.some((r) => r.test(pathname)) && !authed) {
    return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(pathname)}`, req.url));
  }
  if (pathname === '/sign-in' && authed) {
    return NextResponse.redirect(new URL('/home', req.url));
  }

  const res = NextResponse.next();
  if (GUEST_TOKEN_ROUTES.some((prefix) => pathname.startsWith(prefix))) {
    for (const [name, value] of Object.entries(GUEST_ROUTE_HEADERS)) res.headers.set(name, value);
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
