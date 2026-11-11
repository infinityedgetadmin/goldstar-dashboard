import { StaticCheckoutView } from '@/features/guest-pay/static-checkout-view';

export default async function Page({ params }: { params: Promise<{ venueToken: string }> }) {
  const { venueToken } = await params;
  return <StaticCheckoutView venueToken={venueToken} />;
}
