#!/usr/bin/env node
/**
 * Guest ticket page ("/t/[token]") first-load JS budget check (Plan 3
 * Task 6 Step 2, spec §11). Run AFTER `npm run build`.
 *
 * Deviation from task-6-brief.md's literal prescription, disclosed here
 * (see task-6-report.md for the full writeup): the brief says to parse
 * `.next/build-manifest.json` + `.next/app-build-manifest.json`. Neither
 * works for this build: this repo's Turbopack production build (Next.js
 * 16.1.1 `next build`, no `--webpack` flag available) does not emit
 * `app-build-manifest.json` at all, and `build-manifest.json` is a
 * near-empty legacy/Pages-Router compatibility stub (`{"pages":{"/_app":
 * []},...}` — no per-App-Router-route entries) — confirmed by inspecting
 * the actual `.next/` output of a real build, not assumed. The RSC
 * client-reference-manifest per route
 * (`.next/server/app/**\/page_client-reference-manifest.js`) was also
 * tried and rejected: it only lists React Server/Client Component
 * *serialization boundary* modules (framework runtime chunks), not the
 * full bundled-JS graph a browser actually downloads — for `/t/[token]`
 * it resolved to the same ~8 framework chunks regardless of the page's
 * own code, clearly not what "first-load JS" means here.
 *
 * What this script does instead: starts the already-built production
 * server (`next start`), loads `/t/[token]` in a real headless Chromium
 * (via the `playwright` package, already a devDependency), and captures
 * every `/_next/static/**\/*.js` response actually requested before the
 * page settles (`networkidle`). This is what "first-load JS" means as a
 * product concept — what a real browser downloads before any
 * interaction — and it excludes lazy Stripe/Mapbox chunks BY
 * CONSTRUCTION rather than by filename-matching: `use-stripe-loader.ts`
 * only calls `loadStripe()` (which injects Stripe's own external
 * `<script>`) when the guest taps "Continue to payment", and this script
 * never clicks anything, so that request never fires. Each captured
 * chunk's response body is gzipped locally (Node's zlib, matching
 * standard gzip semantics) rather than trusting `next start`'s own
 * `Content-Encoding` — `next start` doesn't compress responses without a
 * reverse proxy in front of it, so measuring on the wire would silently
 * report uncompressed sizes.
 */
import { gzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from 'playwright';

const PORT = 3400;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ROUTE = '/t/e2e-bundle-check-nonexistent-token';
// 100 KB = 100 * 1024 bytes (KiB), the conventional unit for JS budget tooling
// (webpack-bundle-analyzer, bundlesize, etc.) absent a more specific spec
// definition — flagged here since "100 KB" is otherwise ambiguous.
// CONTROLLER RULING (Plan 3 T6, ledgered): the spec's 100 KB first-load
// budget is unachievable with the mandated stack — the measured floor is
// ~283 KB gzip, of which the Firebase JS SDK's Firestore chunk alone is
// ~99 KB (live onSnapshot subscriptions are the product; firestore/lite
// has no realtime), plus Next/React framework chunks and root-layout
// provider baggage the (public) group currently inherits from the
// dashboard's app/layout.tsx. Gate set to 300 KB so it FAILS on real
// regressions today; Plan 4a's root-layout restructure re-measures and
// tightens this (target ≈200 KB). The original 100 KB remains recorded in
// the plan as a spec deviation disclosed in the final report.
// RULING D (Plan 4a, ledgered): raised 300 -> 320. The margin erosion is
// Turbopack re-splitting genuinely-shared chunks as APP-WIDE route count
// grows (proven twice by isolated-worktree chunk audits: zero dashboard
// code reaches the guest graph; adding any two routes anywhere costs the
// guest route ~4 KB of re-chunking). Only the Task 7 root-layout split
// ((public) as its own root layout) decouples the graphs; T7 re-measures
// and tightens to floor+margin.
// TASK 7 (Plan 4a, ledgered): the root-layout split landed —
// `src/app/(public)/layout.tsx` is now its own root layout (html/body,
// its own fonts, no `Providers`), and the former shared
// `src/app/layout.tsx` (dashboard `Providers` + fonts, wrapping every
// route including `(public)`) was deleted; the dashboard groups moved
// under `src/app/(app)/layout.tsx` as their own separate root. Re-measured
// against a clean build: 305.07 KB -> 289.30 KB gzip (-15.77 KB, exactly
// one chunk — `Providers`' React Query + Sonner, the only dashboard-
// attributable bytes ever in this route's graph; confirmed by grepping the
// built chunks for `tanstack`/`sonner`/dashboard component names before
// and after — zero hits in either). The re-chunking-noise mechanism Ruling
// D described is also gone: added a real, routable dashboard page under
// `(app)` (a folder WITHOUT a leading underscore — Next.js treats an
// `_`-prefixed folder as a "private folder" excluded from routing
// entirely; a first attempt at this experiment used one and silently
// tested nothing, since a route Next never compiles can't perturb
// anything — caught in fix-round-1 review, redone correctly here),
// confirmed it actually appeared in the build's route table, rebuilt,
// re-measured — 289.30 KB, byte-identical, same 14 chunks at the same
// hashes; removed it, rebuilt again — still 289.30 KB. Dashboard route
// count can no longer perturb this number, because Turbopack now treats
// `(public)` and `(app)` as genuinely separate root chunk graphs instead
// of one shared app-wide graph. The remaining ~289 KB is guest-owned
// weight this task doesn't touch: Firebase SDK (Firestore realtime,
// ~105 KB of it), React/Next framework runtime, and the guest-pay
// Stripe chunk — matches the "~283 KB floor" the very first ruling
// above already predicted. New budget: measured floor (289.30 KB) +
// 7.2% margin, rounded to a clean
// number = 310 KB. Smaller margin than 320's was intentional: that 320
// existed specifically to absorb re-chunking noise from dashboard route
// growth, which this split eliminated as a source of variance — what's
// left is ordinary build-to-build determinism (verified reproducible
// above) plus room for the guest surface's own future growth.
const BUDGET_BYTES = 310 * 1024;

function log(msg) {
  console.log(`[check-guest-bundle] ${msg}`);
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 60_000) {
  const start = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - start > timeoutMs) throw new Error(`next start did not open port ${PORT} in time`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main() {
  log('starting production server (next start)...');
  // NEXT_PUBLIC_USE_EMULATORS=1 for the *server process only*: `env.ts`
  // reads process.env at SSR request time (the /t route is dynamic, so the
  // module-load throw fires per-request, not at build), and without it the
  // measured page is an HTTP 500 error shell. Client chunk bytes come from
  // the already-built assets either way, but measuring an error page is
  // meaningless — the 200 assertion below makes that a hard failure
  // instead of a silently-wrong number.
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    stdio: 'inherit',
    env: { ...process.env, NEXT_PUBLIC_USE_EMULATORS: '1' },
  });
  let serverExited = false;
  server.on('exit', () => {
    serverExited = true;
  });

  let exitCode = 0;
  try {
    await waitForServer();
    if (serverExited) throw new Error('next start exited before becoming ready');

    const browser = await chromium.launch();
    const page = await browser.newPage();

    /** @type {Map<string, Buffer>} */
    const jsResponses = new Map();
    page.on('response', async (res) => {
      const url = res.url();
      if (!url.includes('/_next/static/') || !url.endsWith('.js')) return;
      try {
        const body = await res.body();
        jsResponses.set(url, body);
      } catch {
        // Response body unavailable (e.g. request aborted/redirected) — skip it.
      }
    });

    log(`loading ${ROUTE} ...`);
    // Not `waitUntil: 'networkidle'`: the guest ticket page opens a live Firestore
    // `onSnapshot` listener on mount (`use-guest-ticket.ts`), which keeps a persistent
    // long-polling connection open — network activity never actually goes idle, so
    // `networkidle` would hang until Playwright's own timeout regardless of how long we
    // wait. `load` + a short fixed settle window catches everything the initial render
    // needs (including anything requested a beat after `load`) without waiting on a
    // connection that's supposed to stay open.
    const nav = await page.goto(`${BASE_URL}${ROUTE}`, { waitUntil: 'load', timeout: 30_000 });
    if (!nav || nav.status() !== 200) {
      throw new Error(
        `route ${ROUTE} responded ${nav ? nav.status() : 'no response'} — refusing to measure an error page. ` +
          'The budget is only meaningful against the real rendered route.'
      );
    }
    await page.waitForTimeout(2000);
    await browser.close();

    const rows = [...jsResponses.entries()]
      .map(([url, body]) => ({ url: url.replace(BASE_URL, ''), raw: body.length, gzip: gzipSync(body).length }))
      .sort((a, b) => b.gzip - a.gzip);

    const totalGzip = rows.reduce((sum, r) => sum + r.gzip, 0);

    log(`captured ${rows.length} JS chunk(s) for ${ROUTE}:`);
    for (const r of rows) {
      log(`  ${(r.gzip / 1024).toFixed(2).padStart(8)} KB gzip  (${(r.raw / 1024).toFixed(2)} KB raw)  ${r.url}`);
    }
    log(`total first-load JS (gzip): ${(totalGzip / 1024).toFixed(2)} KB  (budget: ${(BUDGET_BYTES / 1024).toFixed(0)} KB)`);

    if (totalGzip > BUDGET_BYTES) {
      log(`FAIL — ${(totalGzip / 1024).toFixed(2)} KB exceeds the ${(BUDGET_BYTES / 1024).toFixed(0)} KB budget.`);
      exitCode = 1;
    } else {
      log('PASS — within budget.');
    }
  } catch (e) {
    console.error(`[check-guest-bundle] ${e.stack ?? e}`);
    exitCode = 1;
  } finally {
    if (!serverExited) {
      server.kill('SIGTERM');
    }
  }

  process.exit(exitCode);
}

main();
