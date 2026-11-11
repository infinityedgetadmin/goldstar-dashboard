'use client';
import type { Venue } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useDoc } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/typography';
import { VenueForm } from './venue-form';
import { KeyTagsPanel } from './key-tags-panel';
import { StaticQrPanel } from './static-qr-panel';

export interface VenueDetailProps {
  venueId: string;
}

/**
 * Venue detail/edit page content. `useDoc` (live `onSnapshot`, not a one-shot read — this
 * workspace's ledger constraint) so `KeyTagsPanel`/`StaticQrPanel` immediately see server-minted
 * state (`qr.staticCheckoutToken`, live key-tag counts) without a manual refetch.
 */
export function VenueDetail({ venueId }: VenueDetailProps) {
  const { claims, operator } = useSession();
  const operatorId = claims?.operatorId;
  const { data: venue, loading, error } = useDoc<Venue>(operatorId ? `operators/${operatorId}/venues/${venueId}` : undefined);

  if (!operatorId || !operator || loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Venue" description="Loading…" />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  if (error || !venue) {
    return <EmptyState title="Venue not found" description="This venue doesn't exist or couldn't be loaded." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={venue.name} description={`${venue.address.city}, ${venue.address.region}`} />
      <VenueForm operatorId={operatorId} currency={operator.currency} venue={venue} />
      <KeyTagsPanel operatorId={operatorId} venueId={venue.id} venueName={venue.name} operatorName={operator.branding.displayName} />
      <StaticQrPanel operatorId={operatorId} venue={venue} operatorName={operator.branding.displayName} />
    </div>
  );
}
