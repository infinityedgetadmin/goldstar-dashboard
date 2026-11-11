import { ClaimDetail } from '@/features/claims/claim-detail';

export default async function ClaimDetailPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  return <ClaimDetail claimId={claimId} />;
}
