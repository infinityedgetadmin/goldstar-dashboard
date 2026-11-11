'use client';
import { useState } from 'react';
import Link from 'next/link';
import { formatInTimeZone } from 'date-fns-tz';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import type { Incident, Ticket, User } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useDoc } from '@/lib/firebase/hooks';
import { firebase } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/typography';
import { StatusPill } from '@/components/ui/status-pill';
import { Select } from '@/components/ui/forms/Select';
import { useCollection } from '@/lib/firebase/hooks';
import { INCIDENT_STATUS_LABEL, INCIDENT_STATUS_TONE, INCIDENT_TYPE_LABEL } from './incidents-table';
import { IncidentPhotos } from './incident-photos';

export interface IncidentDetailProps {
  incidentId: string;
}

const INCIDENT_STATUSES: Incident['status'][] = ['open', 'reviewing', 'resolved'];

function StatusAssigneeCard({ operatorId, incident, staff }: { operatorId: string; incident: Incident; staff: User[] }) {
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingAssignee, setSavingAssignee] = useState(false);

  const setStatus = async (status: Incident['status']) => {
    setSavingStatus(true);
    try {
      const { db } = firebase();
      await updateDoc(doc(db, `operators/${operatorId}/incidents/${incident.id}`), { status });
    } catch (e) {
      toast.error(e);
    } finally {
      setSavingStatus(false);
    }
  };

  const setAssignee = async (uid: string) => {
    setSavingAssignee(true);
    try {
      const { db } = firebase();
      // `firestore.rules`' incidents update rule only pins `id`/`operatorId`/`reportedBy`/`at` as
      // immutable for a manager — `assignedTo` is a plain writable field, no separate callable
      // needed (verified directly against `firestore.rules` before building this, per task-6-brief's
      // instruction to read the actual update rule rather than assume one exists). `assignedTo` is
      // `z.ZodOptional<z.ZodString>` (optional, not nullable) — clearing it back to "Unassigned"
      // writes `deleteField()`, not `null`, same established precedent as `messaging-settings.tsx`'s
      // Ruling N4 for clearing an optional string field.
      await updateDoc(doc(db, `operators/${operatorId}/incidents/${incident.id}`), { assignedTo: uid ? uid : deleteField() });
    } catch (e) {
      toast.error(e);
    } finally {
      setSavingAssignee(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status &amp; assignment</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Status"
          value={incident.status}
          onChange={(e) => setStatus(e.target.value as Incident['status'])}
          disabled={savingStatus}
          options={INCIDENT_STATUSES.map((s) => ({ value: s, label: INCIDENT_STATUS_LABEL[s] }))}
        />
        <Select
          label="Assigned to"
          value={incident.assignedTo ?? ''}
          onChange={(e) => setAssignee(e.target.value)}
          disabled={savingAssignee}
          options={staff.map((u) => ({ value: u.uid, label: u.displayName ?? u.uid }))}
          placeholder="Unassigned"
        />
      </CardContent>
    </Card>
  );
}

/** Incident detail (Task 6 brief): photos via signed URLs, status/assignee updates per rules (a
 * manager may change any field except `id`/`operatorId`/`reportedBy`/`at` — verified against
 * `firestore.rules`' `incidents/{incidentId}` update rule directly). No callable needed — the
 * update happens via a plain client-side `updateDoc`, same as `claims/claim-detail.tsx`'s
 * `StatusActions`.
 */
export function IncidentDetail({ incidentId }: IncidentDetailProps) {
  const { claims } = useSession();
  const operatorId = claims?.operatorId;

  const { data: incident, loading: incidentLoading } = useDoc<Incident>(operatorId ? `operators/${operatorId}/incidents/${incidentId}` : undefined);
  const { data: venue } = useDoc<{ timezone?: string; name?: string }>(operatorId && incident ? `operators/${operatorId}/venues/${incident.venueId}` : undefined);
  const { data: ticket } = useDoc<Ticket>(operatorId && incident?.ticketId ? `operators/${operatorId}/tickets/${incident.ticketId}` : undefined);
  const { data: staff } = useCollection<User>(operatorId ? `operators/${operatorId}/users` : undefined);
  const staffByUid = new Map(staff.map((u) => [u.uid, u]));
  const timezone = venue?.timezone || 'UTC';

  if (!operatorId || incidentLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Incident" description="Loading…" />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  if (!incident) {
    return (
      <EmptyState
        title="Incident not found"
        description="This incident doesn't exist, or you don't have access to it."
        action={
          <Link href="/incidents" className="text-body-sm font-medium text-text-primary hover:underline">
            Back to incidents
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/incidents" className="text-body-sm text-text-tertiary hover:text-text-secondary hover:underline">
          ← Back to incidents
        </Link>
      </div>
      <PageHeader
        title={`Incident · ${INCIDENT_TYPE_LABEL[incident.type]}`}
        description={`${venue?.name ?? incident.venueId} · Reported ${formatInTimeZone(new Date(incident.at), timezone, 'MMM d, yyyy h:mm a')}`}
        actions={<StatusPill label={INCIDENT_STATUS_LABEL[incident.status]} tone={INCIDENT_STATUS_TONE[incident.status]} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Text size="sm">{incident.description}</Text>
            <Text size="xs" color="tertiary">
              Reported by {staffByUid.get(incident.reportedBy)?.displayName ?? incident.reportedBy}
            </Text>
            {incident.ticketId && (
              <Link href={`/tickets/${incident.ticketId}`} className="text-body-sm font-medium text-text-primary hover:underline">
                {ticket?.vehicle.plate ? `Ticket · ${ticket.vehicle.plate}` : `Ticket ${incident.ticketId.slice(0, 8)}`}
              </Link>
            )}
          </CardContent>
        </Card>

        {incident.witnesses.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Witnesses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {incident.witnesses.map((w, i) => (
                <div key={i}>
                  <Text size="sm">{w.name}</Text>
                  {w.contact && (
                    <Text size="xs" color="tertiary">
                      {w.contact}
                    </Text>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <StatusAssigneeCard operatorId={operatorId} incident={incident} staff={staff} />
      <IncidentPhotos photos={incident.photos} />
    </div>
  );
}
