import { TicketView } from '@/features/guest-ticket/ticket-view';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TicketView token={token} />;
}
