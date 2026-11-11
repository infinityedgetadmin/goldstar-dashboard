import { IncidentDetail } from '@/features/incidents/incident-detail';

export default async function IncidentDetailPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const { incidentId } = await params;
  return <IncidentDetail incidentId={incidentId} />;
}
