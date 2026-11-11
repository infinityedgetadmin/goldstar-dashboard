import { VenueDetail } from '@/features/venues/venue-detail';

export default async function VenueDetailPage({ params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params;
  return <VenueDetail venueId={venueId} />;
}
