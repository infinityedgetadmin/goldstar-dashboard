'use client';
import Link from 'next/link';
import { MapPin, Users, Settings } from 'lucide-react';
import { useSession } from '@/features/auth/use-session';
import { PageHeader } from '@/components/ui/page-header';
import { Text } from '@/components/ui/typography';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FirstRunChecklist } from '@/features/settings/first-run-checklist';

/**
 * `href: '/settings'` is owner-only (Ruling E-4a / final-review F4 — nav.ts gates Settings to
 * `owner`, and `(operator)/settings/page.tsx` now redirects a non-owner away). Filtered out below
 * for anyone who isn't an owner, same gate the sidebar already applies.
 */
const QUICK_LINKS = [
  { label: 'Venues', href: '/venues', icon: MapPin, description: 'Locations, rates, and key tags.', ownerOnly: false },
  { label: 'Staff', href: '/staff', icon: Users, description: 'Invite staff and manage roles.', ownerOnly: false },
  { label: 'Settings', href: '/settings', icon: Settings, description: 'Operator configuration, payments, messaging, and scheduling.', ownerOnly: true },
] as const;

/**
 * Operator home (Plan 4a T4's brief wanted the first-run checklist here; F6 — final-review.md —
 * picks that up: this repo had no `(operator)/home` page at all, so `first-run-checklist.tsx` was
 * mounted on Settings as a stopgap (see that file's own now-corrected header comment). Real landing
 * page for a signed-in operator with no deep link: `sign-in-form.tsx`'s default `next` and
 * `proxy.ts`'s already-authed-visiting-/sign-in redirect both point here.
 */
export default function HomePage() {
  const { claims, operator } = useSession();
  const operatorId = claims?.operatorId;
  const isOwner = claims?.roles.includes('owner') ?? false;
  const links = QUICK_LINKS.filter((link) => !link.ownerOnly || isOwner);

  if (!operatorId || !operator) {
    return (
      <div className="space-y-6">
        <PageHeader title="Home" description="Welcome back." />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Home" description={`Welcome back to ${operator.branding.displayName}.`} />
      {/* Sign-off micro-fix round (final-review.md "Re-review (final wave)"): owner-only render.
          Three of the checklist's seven items link to /settings (owner-only, Ruling E-4a) and its
          Dismiss action writes a non-branding field on operators/{op} (owner/platform_admin only
          under firestore.rules) — an admin/lead would hit dead ends on most of it. Simplest honest
          fix: admin/lead see the welcome header + their quick links only, no checklist. */}
      {isOwner && <FirstRunChecklist operatorId={operatorId} operator={operator} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-200">
            <Card variant="solid" hoverable className="h-full">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <link.icon className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden />
                  <CardTitle>{link.label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <Text size="sm" color="tertiary">
                  {link.description}
                </Text>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
