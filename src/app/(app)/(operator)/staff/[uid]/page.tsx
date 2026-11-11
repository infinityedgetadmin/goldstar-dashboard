import { StaffDetail } from '@/features/staff/staff-detail';

export default async function StaffDetailPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  return <StaffDetail uid={uid} />;
}
