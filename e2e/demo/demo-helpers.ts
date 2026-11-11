import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Shared helpers for the owner-demo capture suite (playwright.demo.config.ts). Each persona test
 * opens its own browser context with `recordVideo`, so it produces exactly one video with a stable
 * name, and screenshots every page it visits into ../demo-media/web/<persona>/.
 *
 * Every walkthrough is READ-ONLY: it navigates, opens drawers/dialogs/tabs, filters and runs
 * searches, and never clicks anything that writes (the demo dataset is shared with the mobile
 * recordings running against the same emulators).
 */

/** Where captures land: goldstar/demo-media/web, a sibling of this repo (outside git). */
export const MEDIA_DIR = process.env.DEMO_MEDIA_DIR ?? path.resolve(__dirname, '..', '..', '..', 'demo-media', 'web');

/**
 * The owner-demo seed's fixed test password (goldstar-platform scripts/demo/constants.ts
 * DEMO_PASSWORD, the same value seed-emulator.ts gives every emulator account). It only exists in
 * the local Auth emulator, never in a real project.
 */
const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD ?? 'password123';

const DESKTOP = { width: 1440, height: 900 } as const;
/** Guests open /t/<token> from a text message, so the public walkthrough is recorded on a phone. */
const PHONE = { width: 430, height: 932 } as const;
/** Pause on each page so a viewer can read it before the walkthrough moves on. */
const READ_PAUSE_MS = Number(process.env.DEMO_READ_PAUSE_MS ?? 1_800);

export type Persona = 'owner' | 'lead' | 'venue' | 'hotel' | 'platform' | 'public';

export interface PersonaSession {
  context: BrowserContext;
  page: Page;
  /** Navigate to `url` and wait until its real content (`ready`) is on screen and healthy. */
  visit: (url: string, ready: Ready) => Promise<void>;
  /** Wait until the current page shows `ready` and no error state (after a click-through). */
  expectReady: (ready: Ready) => Promise<void>;
  /** Screenshot the current page as the next numbered step (01-, 02-, ...), then pause. */
  shot: (name: string) => Promise<void>;
  /** Close the context and save this persona's video to MEDIA_DIR/videos/<persona>.webm. */
  finish: () => Promise<void>;
}

/** One text, or several that must ALL be visible. */
export type Ready = RegExp | string | readonly (RegExp | string)[];

/**
 * Text that means a page did NOT render its real content. Asserted absent on every captured page,
 * alongside page-specific positive assertions, so a broken page fails the run instead of being
 * captured on camera.
 */
const BROKEN_PAGE_TEXT = [
  /something went wrong/i,
  /application error/i,
  /this page could not be found/i,
  /unhandled runtime error/i,
  /you don.t have access to this page/i,
  /permission[- _]denied/i,
  /missing or insufficient permissions/i,
];

export async function startPersona(browser: Browser, persona: Persona): Promise<PersonaSession> {
  const videoTmp = path.join(MEDIA_DIR, '.video-tmp', persona);
  const shotsDir = path.join(MEDIA_DIR, persona);
  rmSync(videoTmp, { recursive: true, force: true });
  rmSync(shotsDir, { recursive: true, force: true });
  mkdirSync(videoTmp, { recursive: true });
  mkdirSync(shotsDir, { recursive: true });
  mkdirSync(path.join(MEDIA_DIR, 'videos'), { recursive: true });

  const viewport = persona === 'public' ? PHONE : DESKTOP;
  const context = await browser.newContext({
    viewport,
    ...(persona === 'public' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
    recordVideo: { dir: videoTmp, size: viewport },
  });
  const page = await context.newPage();

  // An uncaught exception is a broken page even when it still paints something.
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  const expectReady = async (ready: Ready) => {
    const wanted = typeof ready === 'string' || ready instanceof RegExp ? [ready] : ready;
    for (const text of wanted) await expect(page.getByText(text).first()).toBeVisible();
    const body = page.locator('body');
    for (const pattern of BROKEN_PAGE_TEXT) await expect(body).not.toContainText(pattern);
    expect(pageErrors, `uncaught page errors on ${page.url()}`).toEqual([]);
  };

  let step = 0;
  return {
    context,
    page,
    expectReady,
    visit: async (url, ready) => {
      await page.goto(url);
      await expectReady(ready);
    },
    shot: async (name) => {
      step += 1;
      await page.screenshot({ path: path.join(shotsDir, `${String(step).padStart(2, '0')}-${name}.png`), fullPage: true });
      await page.waitForTimeout(READ_PAUSE_MS);
    },
    finish: async () => {
      const video = page.video();
      await context.close();
      if (video) await video.saveAs(path.join(MEDIA_DIR, 'videos', `${persona}.webm`));
      rmSync(videoTmp, { recursive: true, force: true });
    },
  };
}

/** Sign in through the real form and wait until the app has routed the persona to `landing`. */
export async function signIn(page: Page, uid: string, landing: RegExp): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(`${uid}@goldstar.example.com`);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(landing);
}

/**
 * Read-only lookups against the running Firestore emulator, so the walkthroughs assert on whatever
 * the seed (and the parallel mobile recordings) actually hold rather than on hard-coded vehicles
 * and states. `Bearer owner` is the emulator's admin bypass; it does not exist on a real project.
 */
const FIRESTORE_DOCS = `http://127.0.0.1:${process.env.DEMO_FIRESTORE_PORT ?? '8080'}/v1/projects/demo-goldstar/databases/(default)/documents`;

interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

interface FirestoreDoc {
  name: string;
  fields?: Record<string, FirestoreValue>;
}

async function firestoreGet<T>(docPath: string): Promise<T> {
  const res = await fetch(`${FIRESTORE_DOCS}/${docPath}`, { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) throw new Error(`Firestore emulator read ${docPath} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function str(fields: Record<string, FirestoreValue> | undefined, key: string): string {
  const value = fields?.[key]?.stringValue;
  if (value === undefined) throw new Error(`Firestore field ${key} is missing`);
  return value;
}

/** A guest ticket page's live projection: what /t/<token> renders right now. */
export async function guestTicket(token: string): Promise<{ vehicle: string; status: string; jobType: string; venueName: string }> {
  const doc = await firestoreGet<FirestoreDoc>(`guestTickets/${token}`);
  return { vehicle: str(doc.fields, 'vehicleSummary'), status: str(doc.fields, 'status'), jobType: str(doc.fields, 'jobType'), venueName: str(doc.fields, 'venueName') };
}

/** The token of some guest ticket currently in `status` (e.g. a parked car for the checked_in page). */
export async function guestTokenInState(jobType: string, status: string): Promise<string> {
  const list = await firestoreGet<{ documents?: FirestoreDoc[] }>('guestTickets?pageSize=300');
  const match = (list.documents ?? [])
    .filter((d) => d.fields?.jobType?.stringValue === jobType && d.fields?.status?.stringValue === status)
    .map((d) => d.name.split('/').pop() ?? '')
    .sort()[0];
  if (!match) throw new Error(`no ${jobType} guest ticket is ${status} right now`);
  return match;
}

/** The plate of the car on the operator's claim with `status` (e.g. the seeded settled claim). */
export async function claimPlate(operatorId: string, status: string): Promise<string> {
  const list = await firestoreGet<{ documents?: FirestoreDoc[] }>(`operators/${operatorId}/claims?pageSize=100`);
  const claim = (list.documents ?? []).find((d) => d.fields?.status?.stringValue === status);
  if (!claim) throw new Error(`no ${status} claim seeded for ${operatorId}`);
  const ticket = await firestoreGet<FirestoreDoc>(`operators/${operatorId}/tickets/${str(claim.fields, 'ticketId')}`);
  return str(ticket.fields?.vehicle?.mapValue?.fields, 'plate');
}

/**
 * Resolves once the live board's Mapbox map has fetched its first tile and had a moment to paint.
 * Start it BEFORE navigating: the board's ticket cards render long before the basemap does, so a
 * screenshot taken on the cards alone shows an empty grey map.
 */
export function waitForMapTiles(page: Page): Promise<void> {
  return page
    .waitForResponse((res) => res.url().includes('api.mapbox.com') && /\/v4\/|\.pbf|\.mvt|tiles/.test(res.url()) && res.ok(), { timeout: 30_000 })
    .then(() => page.waitForTimeout(3_000));
}

/** YYYY-MM-DD for `daysAgo` days before today, in local time (what a date input expects). */
export function isoDate(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
