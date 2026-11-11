import { OperatorDetail } from '@/features/platform/operator-detail';

export default async function OperatorDetailPage({ params }: { params: Promise<{ operatorId: string }> }) {
  const { operatorId } = await params;
  return <OperatorDetail operatorId={operatorId} />;
}
