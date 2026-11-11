import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPERATOR_NAV, PLATFORM_NAV, VENUE_NAV, venueNav } from '../nav';

const APP_DIR = path.join(process.cwd(), 'src/app');

/**
 * Every URL path that has a `page.tsx` under `src/app`. `(group)` folders are Next.js route groups:
 * they organise files but add no URL segment, so they are skipped when building the path.
 */
function appRoutes(dir: string = APP_DIR, segments: readonly string[] = []): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const isRouteGroup = /^\(.+\)$/.test(entry.name);
      routes.push(...appRoutes(path.join(dir, entry.name), isRouteGroup ? segments : [...segments, entry.name]));
    } else if (entry.name === 'page.tsx') {
      routes.push(`/${segments.join('/')}`);
    }
  }
  return routes;
}

/**
 * A nav entry whose page does not exist sends owners to a 404 (operator `/invoices` and the
 * platform `/platform/*` items did exactly that). This walks the real `src/app` tree so adding a
 * nav link without its page, or deleting a page a link still points at, fails here.
 */
describe('nav hrefs resolve to real pages', () => {
  const routes = appRoutes();
  const everyNavItem = [...OPERATOR_NAV, ...PLATFORM_NAV, ...venueNav(true)];

  it('finds the app routes it is checking against', () => {
    expect(routes).toEqual(expect.arrayContaining(['/operators', '/venue', '/venue/invoices', '/settings']));
  });

  it.each(everyNavItem.map((item) => [item.label, item.href] as const))('%s (%s) has a page', (_label, href) => {
    expect(routes).toContain(href);
  });

  it('does not link to the pages that are not built yet', () => {
    const hrefs = everyNavItem.map((item) => item.href);
    for (const unbuilt of ['/invoices', '/platform/plans', '/platform/settings', '/platform/audit']) {
      expect(hrefs).not.toContain(unbuilt);
    }
  });
});

/**
 * "Hotel" is per-VENUE, not per-operator, so it cannot go through `visibleNavItems`' roles/features
 * gates — those key off the operator. A restaurant host must never see it; a two-venue host with
 * one of each sees it appear and disappear as they switch.
 */
describe('venueNav', () => {
  it('omits Hotel entirely for a venue with no PMS', () => {
    expect(venueNav(false).map((i) => i.label)).not.toContain('Hotel');
    expect(venueNav(false)).toEqual(VENUE_NAV);
  });

  it('adds Hotel for a PMS venue, directly after Requests', () => {
    const labels = venueNav(true).map((i) => i.label);
    expect(labels).toEqual(['Live board', 'Requests', 'Hotel', 'Validations', 'Reports', 'Invoices', 'Staffing']);
  });

  it('points Hotel at /venue/hotel', () => {
    expect(venueNav(true).find((i) => i.label === 'Hotel')?.href).toBe('/venue/hotel');
  });

  it('does not mutate the shared VENUE_NAV', () => {
    const before = VENUE_NAV.length;
    venueNav(true);
    venueNav(true);
    expect(VENUE_NAV).toHaveLength(before);
    expect(VENUE_NAV.map((i) => i.label)).not.toContain('Hotel');
  });

  it('leaves every non-Hotel item and its order untouched', () => {
    expect(venueNav(true).filter((i) => i.label !== 'Hotel')).toEqual(VENUE_NAV);
  });
});
