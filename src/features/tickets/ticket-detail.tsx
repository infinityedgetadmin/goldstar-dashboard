'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { orderBy, where, type QueryConstraint } from 'firebase/firestore';
import type { Claim, CustodyEvent, DamageReport, Incident, Ticket, Transaction, User, Venue } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useCollection, useDoc } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import { Button } from '@/components/ui/buttons';
import { EmptyState } from '@/components/ui/empty-state';
import { formatPhone } from '@/lib/format';
import { STATUS_LABEL, STATUS_TONE, ticketSummary } from '@/features/live/status-copy';
import { CustodyTimeline } from './custody-timeline';
import { PhotoGallery } from './photo-gallery';
import { DamageDiagram } from './damage-diagram';
import { PaymentPanel } from './payment-panel';
import { TicketActions } from './ticket-actions';
import { RevealPhoneDialog } from './reveal-phone-dialog';
import { useTicketPhotos } from './use-ticket-photos';
import { venueTimezone } from './ticket-format';

export interface TicketDetailProps {
  ticketId: string;
}

function GuestCard({ ticketId, guest, canReveal }: { ticketId: string; guest: { phoneLast4: string; name?: string; consentSms: boolean; room?: string }; canReveal: boolean }) {
  const [revealedPhone, setRevealedPhone] = useState<string | undefined>(undefined);
  const [revealOpen, setRevealOpen] = useState(false);
  const isSentinel = guest.phoneLast4 === '0000';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guest</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {guest.name && <Text size="sm">{guest.name}</Text>}
        <div className="flex items-center gap-2">
          <Text size="sm" color="secondary">
            {isSentinel ? 'No phone — QR only' : revealedPhone ? formatPhone(revealedPhone) : `•••• ${guest.phoneLast4}`}
          </Text>
          {!isSentinel && !revealedPhone && canReveal && (
            <Button size="sm" variant="ghost" onClick={() => setRevealOpen(true)}>
              Reveal
            </Button>
          )}
        </div>
        {revealedPhone && (
          <Text size="xs" color="tertiary">
            Revealed — this action was audited.
          </Text>
        )}
        {guest.room && (
          <Text size="xs" color="tertiary">
            Room {guest.room}
          </Text>
        )}
      </CardContent>
      {revealOpen && <RevealPhoneDialog ticketId={ticketId} onClose={() => setRevealOpen(false)} onRevealed={setRevealedPhone} />}
    </Card>
  );
}

/**
 * Ticket detail page content (Plan 4b Task 4) — supersedes Task 3's `TicketDrawer` for full
 * detail; the drawer stays minimal and links here (see `ticket-drawer.tsx`'s own header comment).
 * `'use client'` — `operatorId` only exists via `useSession()`, matching every other `(operator)`
 * detail page (`staff-detail.tsx`).
 *
 * Known limitation, disclosed: an ARCHIVED ticket (see `archive.ts`) is deleted from
 * `operators/{op}/tickets/{id}` — `firestore.rules`' `archive/{rest=**}` is Functions-only (Admin
 * SDK), no client read path exists for it. This page can only show full detail for a LIVE ticket;
 * an archived one falls through to the "not found" state below rather than a full detail render.
 * `ticketsSearch`'s `includeArchived` results are still visible in the explorer table itself.
 */
export function TicketDetail({ ticketId }: TicketDetailProps) {
  const { claims } = useSession();
  const operatorId = claims?.operatorId;
  const canReveal = claims?.roles.some((r) => r === 'owner' || r === 'admin' || r === 'platform_admin') ?? false;
  const canRefund = canReveal;

  const { data: ticket, loading: ticketLoading } = useDoc<Ticket>(operatorId ? `operators/${operatorId}/tickets/${ticketId}` : undefined);
  const { data: venues, loading: venuesLoading } = useCollection<Venue>(operatorId ? `operators/${operatorId}/venues` : undefined);
  const { data: staff, loading: staffLoading } = useCollection<User>(operatorId ? `operators/${operatorId}/users` : undefined);
  const staffByUid = useMemo(() => new Map(staff.map((u) => [u.uid, u])), [staff]);

  const custodyConstraints = useMemo<QueryConstraint[]>(() => [orderBy('at', 'asc')], []);
  const { data: custodyEvents } = useCollection<CustodyEvent>(
    operatorId ? `operators/${operatorId}/tickets/${ticketId}/custodyEvents` : undefined,
    custodyConstraints,
  );

  const reportsConstraints = useMemo<QueryConstraint[]>(() => [where('ticketId', '==', ticketId), orderBy('createdAt', 'desc')], [ticketId]);
  const { data: damageReports } = useCollection<DamageReport>(operatorId ? `operators/${operatorId}/damageReports` : undefined, reportsConstraints);
  const { photos } = useTicketPhotos(
    operatorId,
    damageReports.map((r) => ({ id: r.id, phase: r.phase })),
  );

  const txConstraints = useMemo<QueryConstraint[]>(() => [where('ticketId', '==', ticketId)], [ticketId]);
  const { data: transactions } = useCollection<Transaction>(operatorId ? `operators/${operatorId}/transactions` : undefined, txConstraints);

  const incidentConstraints = useMemo<QueryConstraint[]>(() => [where('ticketId', '==', ticketId)], [ticketId]);
  const { data: incidents } = useCollection<Incident>(operatorId ? `operators/${operatorId}/incidents` : undefined, incidentConstraints);

  const claimConstraints = useMemo<QueryConstraint[]>(() => [where('ticketId', '==', ticketId)], [ticketId]);
  const { data: claims_ } = useCollection<Claim>(operatorId ? `operators/${operatorId}/claims` : undefined, claimConstraints);

  if (!operatorId || ticketLoading || venuesLoading || staffLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ticket" description="Loading…" />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  if (!ticket) {
    return (
      <EmptyState
        title="Ticket not found"
        description="This ticket doesn't exist, or it's been archived — archived tickets aren't viewable in full detail from this page yet."
        action={
          <Link href="/tickets" className="text-body-sm font-medium text-text-primary hover:underline">
            Back to tickets
          </Link>
        }
      />
    );
  }

  const venue = venues.find((v) => v.id === ticket.venueId);
  const timezone = venueTimezone(venues, ticket.venueId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/tickets" className="text-body-sm text-text-tertiary hover:text-text-secondary hover:underline">
          ← Back to tickets
        </Link>
      </div>
      <PageHeader
        title={ticketSummary(ticket)}
        description={`${venue?.name ?? ticket.venueId}${ticket.vehicle.plate ? ` · ${ticket.vehicle.plate}` : ''}`}
        actions={<StatusPill label={STATUS_LABEL[ticket.status]} tone={STATUS_TONE[ticket.status]} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GuestCard ticketId={ticket.id} guest={ticket.guest} canReveal={canReveal} />
        <Card>
          <CardHeader>
            <CardTitle>Vehicle &amp; key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Text size="sm">{ticketSummary(ticket)}</Text>
            <Text size="sm" color="secondary">
              Plate: {ticket.vehicle.plate ?? '—'} {ticket.vehicle.state ? `(${ticket.vehicle.state})` : ''}
            </Text>
            <Text size="sm" color="secondary">
              Key tag: {ticket.keyTagId ?? '—'}
            </Text>
            <Text size="sm" color="secondary">
              Zone: {[ticket.zoneId, ticket.spotLabel].filter(Boolean).join(' ') || '—'}
            </Text>
          </CardContent>
        </Card>
      </div>

      <CustodyTimeline events={custodyEvents} staffByUid={staffByUid} timezone={timezone} />

      <PhotoGallery photos={photos} timezone={timezone} />

      {damageReports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Damage diagrams</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {damageReports.map((r) => (
              <div key={r.id} className="space-y-2">
                <Text size="xs" weight="medium" className="capitalize">
                  {r.phase.replace(/_/g, ' ')}
                </Text>
                <DamageDiagram report={r} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <PaymentPanel ticket={ticket} transactions={transactions} timezone={timezone} canRefund={canRefund} />

      {(incidents.length > 0 || claims_.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Incidents &amp; claims</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {incidents.map((i) => (
              <Link key={i.id} href={`/incidents/${i.id}`} className="block text-body-sm font-medium text-text-primary hover:underline">
                Incident · {i.type} · {i.status}
              </Link>
            ))}
            {claims_.map((c) => (
              <Link key={c.id} href={`/claims/${c.id}`} className="block text-body-sm font-medium text-text-primary hover:underline">
                Claim · {c.status}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <TicketActions operatorId={operatorId} ticket={ticket} venue={venue} staff={staff} />
    </div>
  );
}
