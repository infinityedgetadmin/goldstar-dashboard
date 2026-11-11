import { redirect } from 'next/navigation';

/**
 * The application root is a redirect, not a page.
 *
 * This used to render a placeholder reading "The operations dashboard is under construction" — a
 * leftover from the very first task, when the dashboard shell did not exist yet. It does now, so
 * the placeholder was the only thing standing between someone opening the deployed URL and the
 * product: the root is the address people actually type or paste.
 *
 * `/home` is the operator shell's own landing screen and is listed in `proxy.ts`'s PROTECTED
 * prefixes, so this single hop covers both cases: a signed-in user lands on their dashboard, and
 * everyone else is bounced by the proxy to `/sign-in?next=%2Fhome` and returned here after signing
 * in. Guest surfaces (`/t/…`, `/pay/…`) are a separate route group and never reach this file.
 */
export default function RootPage() {
  redirect('/home');
}
