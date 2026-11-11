import { TicketDetail } from '@/features/tickets/ticket-detail';

export default async function TicketDetailPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  return <TicketDetail ticketId={ticketId} />;
}
