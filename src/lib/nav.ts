import {
  Home,
  Radio,
  Ticket,
  Route,
  MapPin,
  Users,
  Clock,
  AlertTriangle,
  ShieldAlert,
  CreditCard,
  Receipt,
  BarChart3,
  TrendingUp,
  Plug,
  Palette,
  ScrollText,
  Settings,
  Building2,
  Car,
  ConciergeBell,
  BadgePercent,
  BedDouble,
} from 'lucide-react';
import { MANAGER_ROLES } from '@goldstar/platform';
import type { NavItem } from '@/components/layout/sidebar';

const OWNER_ADMIN = ['owner', 'admin'] as const;
const OWNER_ONLY = ['owner'] as const;

/**
 * Operator-shell nav (spec's list, task-2-brief.md): Home, Live ops,
 * Tickets, Dispatch, Venues, Staff, Shifts, Damage claims, Incidents,
 * Payments, Reports, Integrations, Branding, Audit, Settings. The spec also
 * lists an operator-level Invoices page; it is not built yet (only the venue
 * portal's `/venue/invoices` exists), so it is left out of the nav rather
 * than linking to a 404. `__tests__/nav.test.ts` fails if any nav href here
 * has no page under `src/app`, so re-add the entry together with the page.
 * Every route under `(operator)` requires owner/admin/lead (or an
 * assumed platform admin) to even reach the shell — see
 * `(operator)/layout.tsx` — so `roles` here only needs to narrow
 * FURTHER, to owner/admin-only items; `MANAGER_ROLES`-restricted items
 * are really just documentation of intent since every viewer already
 * satisfies them.
 */
export const OPERATOR_NAV: NavItem[] = [
  { label: 'Home', href: '/home', icon: Home },
  { label: 'Live ops', href: '/live', icon: Radio },
  { label: 'Tickets', href: '/tickets', icon: Ticket },
  { label: 'Dispatch', href: '/dispatch', icon: Route, features: ['driveHome', 'passengerRides'] },
  // Plan 5 Task 4: fleet-vehicle CRUD for dispatch's chase/ride vehicle picker. Same `features`
  // gate as Dispatch (fleet vehicles are only meaningful when drive-home/ride jobs exist) — no
  // `roles` restriction beyond that, matching Dispatch: `firestore.rules`' `fleetVehicles` read is
  // `staffOf(op)`, which every viewer who can reach the `(operator)` shell already satisfies (this
  // file's own header comment on `roles` above).
  { label: 'Fleet', href: '/fleet', icon: Car, features: ['driveHome', 'passengerRides'] },
  { label: 'Venues', href: '/venues', icon: MapPin, roles: [...MANAGER_ROLES] },
  { label: 'Staff', href: '/staff', icon: Users, roles: [...MANAGER_ROLES] },
  { label: 'Shifts', href: '/shifts', icon: Clock },
  { label: 'Damage claims', href: '/claims', icon: AlertTriangle, roles: [...MANAGER_ROLES] },
  { label: 'Incidents', href: '/incidents', icon: ShieldAlert, roles: [...MANAGER_ROLES] },
  { label: 'Payments', href: '/payments', icon: CreditCard, roles: [...MANAGER_ROLES] },
  { label: 'Reports', href: '/reports', icon: BarChart3, roles: [...MANAGER_ROLES] },
  { label: 'Executive', href: '/executive', icon: TrendingUp, roles: [...MANAGER_ROLES] },
  { label: 'Integrations', href: '/integrations', icon: Plug, roles: [...OWNER_ADMIN] },
  { label: 'Branding', href: '/branding', icon: Palette, roles: [...OWNER_ADMIN] },
  { label: 'Audit', href: '/audit', icon: ScrollText, roles: [...OWNER_ADMIN] },
  // Ruling E-4a (final-review F4): Settings is owner-only — firestore.rules' operators/{op} update
  // rule admits only platform_admin/owner for non-branding fields (Branding's own admin write path
  // is the NEW carve-out this ruling added; Settings' writers — operator-settings-form.tsx,
  // payments-settings.tsx, messaging-settings.tsx, scheduling-settings.tsx — all touch non-branding
  // fields, so admin was never actually able to save here). `(operator)/settings/page.tsx` enforces
  // this with its own redirect; this entry just keeps the sidebar from advertising a dead end.
  { label: 'Settings', href: '/settings', icon: Settings, roles: [...OWNER_ONLY] },
];

/**
 * Platform-shell nav. The spec also lists Plans, Platform settings and Global audit, to be
 * namespaced under `/platform/*` (`proxy.ts`'s `PROTECTED` regex already covers `platform`, and
 * `/platform/audit` avoids colliding with the operator shell's own `/audit`). None of those pages
 * is built yet, so they are left out of the nav rather than linking to a 404; add each entry back
 * together with its page (`__tests__/nav.test.ts` enforces that every href resolves).
 */
export const PLATFORM_NAV: NavItem[] = [{ label: 'Operators', href: '/operators', icon: Building2 }];

/**
 * Venue-shell nav (Plan 7 Task 1): Live board, Requests, Validations,
 * Reports, Invoices, Staffing. Every route under `(venue)` already
 * requires the `venue_user` role (or a platform admin) to reach the shell
 * at all — see `(venue)/layout.tsx` — so, exactly as with `OPERATOR_NAV`
 * above, no item needs its own `roles` narrowing.
 *
 * "Live board" is the group's index route (`/venue`), a prefix of every
 * other href here, so it sets `exact` — see `NavItem['exact']` in
 * `components/layout/sidebar.tsx` for why.
 */
export const VENUE_NAV: NavItem[] = [
  { label: 'Live board', href: '/venue', icon: Radio, exact: true },
  { label: 'Requests', href: '/venue/requests', icon: ConciergeBell },
  { label: 'Validations', href: '/venue/validations', icon: BadgePercent },
  { label: 'Reports', href: '/venue/reports', icon: BarChart3 },
  { label: 'Invoices', href: '/venue/invoices', icon: Receipt },
  { label: 'Staffing', href: '/venue/staffing', icon: Clock },
];

/** Hotel tools, shown only for a venue with a PMS configured — see `venueNav`. */
const VENUE_HOTEL_ITEM: NavItem = { label: 'Hotel', href: '/venue/hotel', icon: BedDouble };

/**
 * The venue nav for a SPECIFIC venue. "Hotel" is per-VENUE, not per-operator, so it cannot go
 * through `visibleNavItems`' `roles`/`features` gates — those key off the operator. A restaurant
 * host should never see a Hotel tab, and a two-venue host with one of each should see it appear
 * and disappear as they switch, which is informative rather than surprising.
 *
 * Placed directly after Requests: for a hotel, looking a guest up and charging their room is
 * front-desk work done constantly, not a report consulted occasionally.
 */
export function venueNav(hasPms: boolean): NavItem[] {
  if (!hasPms) return VENUE_NAV;
  const i = VENUE_NAV.findIndex((item) => item.href === '/venue/requests');
  return [...VENUE_NAV.slice(0, i + 1), VENUE_HOTEL_ITEM, ...VENUE_NAV.slice(i + 1)];
}
