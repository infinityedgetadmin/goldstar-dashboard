'use client';
import { PageHeader } from '@/components/ui/page-header';
import { useVenue } from './venue-context';
import { HostRequestForm } from './host-request-form';
import { PreArrivalForm } from './pre-arrival-form';
import { RideRequestForm } from './ride-request-form';

/**
 * Requests page: the host forms — request a guest's car, announce a pre-arrival, and (contracts
 * v0.4.0) request a venue-billed passenger ride. Each form owns its own submission; this only
 * lays them out.
 */
export function VenueRequests() {
  const { venue } = useVenue();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests"
        description={venue ? `${venue.name} — send requests to the valet stand.` : 'Send requests to the valet stand.'}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <HostRequestForm />
        <PreArrivalForm />
        <RideRequestForm />
      </div>
    </div>
  );
}
