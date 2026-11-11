'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatInTimeZone } from 'date-fns-tz';
import { doc, updateDoc } from 'firebase/firestore';
import { nowIso, type AuditLogEntry, type Claim, type Ticket } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useDoc } from '@/lib/firebase/hooks';
import { callable } from '@/lib/firebase/callables';
import { firebase } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/typography';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/buttons';
import { Input } from '@/components/ui/forms/Input';
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_TONE } from './claims-table';
import { AdjudicationForm } from './adjudication-form';
import { EvidencePanel } from './evidence-panel';

export interface ClaimDetailProps {
  claimId: string;
}

const CLAIM_STATUSES: Claim['status'][] = ['intake', 'under_review', 'accepted', 'denied', 'settled'];

interface TimelineEntry {
  at: string;
  label: string;
  detail?: string;
}

function GuestContactCard({ guestContact }: { guestContact: Claim['guestContact'] }) {
  const [revealed, setRevealed] = useState(false);
  const maskedPhone = guestContact.phone ? `•••• ${guestContact.phone.slice(-4)}` : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guest contact</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {guestContact.name && <Text size="sm">{guestContact.name}</Text>}
        {guestContact.phone && (
          <div className="flex items-center gap-2">
            <Text size="sm" color="secondary">
              {revealed ? guestContact.phone : maskedPhone}
            </Text>
            {!revealed && (
              <Button size="sm" variant="ghost" onClick={() => setRevealed(true)}>
                Show
              </Button>
            )}
          </div>
        )}
        {guestContact.email && (
          <Text size="sm" color="secondary">
            {guestContact.email}
          </Text>
        )}
        {!guestContact.name && !guestContact.phone && !guestContact.email && (
          <Text size="sm" color="tertiary">
            No contact on file.
          </Text>
        )}
      </CardContent>
    </Card>
  );
}

function InsurerCard({ operatorId, claim, canEdit }: { operatorId: string; claim: Claim; canEdit: boolean }) {
  const [carrier, setCarrier] = useState(claim.insurer?.carrier ?? '');
  const [claimNumber, setClaimNumber] = useState(claim.insurer?.claimNumber ?? '');
  const [saving, setSaving] = useState(false);
  const valid = carrier.trim().length > 0 && claimNumber.trim().length > 0;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const { db } = firebase();
      await updateDoc(doc(db, `operators/${operatorId}/claims/${claim.id}`), {
        insurer: { carrier: carrier.trim(), claimNumber: claimNumber.trim(), submittedAt: claim.insurer?.submittedAt ?? nowIso() },
      });
      toast.success('Insurer info saved.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit && !claim.insurer) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Insurer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Carrier" fullWidth value={carrier} onChange={(e) => setCarrier(e.target.value)} />
              <Input label="Claim number" fullWidth value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} />
            </div>
            {claim.insurer && (
              <Text size="xs" color="tertiary">
                Submitted {new Date(claim.insurer.submittedAt).toLocaleString()}
              </Text>
            )}
            <Button size="sm" onClick={save} loading={saving} disabled={!valid || saving}>
              Save insurer info
            </Button>
          </>
        ) : (
          <>
            <Text size="sm">{claim.insurer?.carrier}</Text>
            <Text size="sm" color="secondary">
              {claim.insurer?.claimNumber}
            </Text>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusActions({ operatorId, claim, uid }: { operatorId: string; claim: Claim; uid: string }) {
  const [busy, setBusy] = useState<Claim['status'] | null>(null);

  const setStatus = async (status: Claim['status']) => {
    setBusy(status);
    try {
      const { db } = firebase();
      // `updatedBy` is deliberately NOT part of claimSchema (a handler-only field, same convention
      // as `processedEvents` docs) — `onClaimWritten` reads it off the raw write to suppress
      // emailing the admin about their own status change (final whole-branch review nit).
      await updateDoc(doc(db, `operators/${operatorId}/claims/${claim.id}`), { status, updatedBy: uid });
      toast.success(`Claim moved to ${CLAIM_STATUS_LABEL[status]}.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const actions: { status: Claim['status']; label: string; variant?: 'primary' | 'danger' }[] =
    claim.status === 'intake'
      ? [{ status: 'under_review', label: 'Move to review' }]
      : claim.status === 'under_review'
        ? [
            { status: 'accepted', label: 'Accept' },
            { status: 'denied', label: 'Deny', variant: 'danger' },
          ]
        : claim.status === 'accepted'
          ? [{ status: 'settled', label: 'Mark settled' }]
          : [];

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button key={a.status} variant={a.variant ?? 'primary'} loading={busy === a.status} disabled={busy !== null} onClick={() => setStatus(a.status)}>
          {a.label}
        </Button>
      ))}
    </div>
  );
}

function StatusStepper({ status }: { status: Claim['status'] }) {
  // accepted/denied fork at the same step — both render at that position rather than one being
  // "further along" than the other; a denied claim never visually implies it also passed through
  // "accepted".
  const steps: Claim['status'][] = status === 'denied' ? ['intake', 'under_review', 'denied'] : CLAIM_STATUSES.filter((s) => s !== 'denied');
  const currentIndex = steps.indexOf(status);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <StatusPill label={CLAIM_STATUS_LABEL[s]} tone={i <= currentIndex ? CLAIM_STATUS_TONE[s] : 'neutral'} />
          {i < steps.length - 1 && (
            <Text size="xs" color="tertiary">
              →
            </Text>
          )}
        </div>
      ))}
    </div>
  );
}

function useClaimTimeline(operatorId: string | undefined, claim: Claim | undefined): { entries: TimelineEntry[]; loading: boolean } {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!operatorId || !claim) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const localEntries: TimelineEntry[] = [
      { at: claim.createdAt, label: 'Claim created' },
      { at: claim.reportedAt, label: 'Reported', detail: claim.description },
    ];
    if (claim.insurer) localEntries.push({ at: claim.insurer.submittedAt, label: 'Submitted to insurer', detail: `${claim.insurer.carrier} · ${claim.insurer.claimNumber}` });
    if (claim.adjudication) localEntries.push({ at: claim.adjudication.decidedAt, label: `Claim ${claim.status}`, detail: claim.adjudication.notes });

    // auditQuery has no `target` filter (contracts v0.3.5) — queried by action and filtered
    // client-side to this claim's own audit rows, per the brief's disclosed carry ("reuse it
    // filtered by the claim"). Errors here are non-fatal: the local, claim-field-derived entries
    // above still render even if this fetch fails (e.g. a non-admin caller — auditQuery is admin+).
    callable('auditQuery')({ from: claim.createdAt, to: nowIso(), action: 'claims.generateBundle', limit: 100 })
      .then((out) => {
        if (cancelled) return;
        const bundleEntries: TimelineEntry[] = out.entries
          .filter((e: AuditLogEntry) => e.target === claim.id)
          .map((e: AuditLogEntry) => ({ at: e.at, label: 'Evidence bundle generated', detail: (e.after as { sha256?: string } | null)?.sha256 }));
        setEntries([...localEntries, ...bundleEntries].sort((a, b) => a.at.localeCompare(b.at)));
      })
      .catch(() => {
        if (!cancelled) setEntries(localEntries.sort((a, b) => a.at.localeCompare(b.at)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [operatorId, claim]);

  return { entries, loading };
}

export function ClaimDetail({ claimId }: ClaimDetailProps) {
  const { claims, uid } = useSession();
  const operatorId = claims?.operatorId;
  const isAdmin = claims?.roles.some((r) => r === 'owner' || r === 'admin' || r === 'platform_admin') ?? false;

  const { data: claim, loading: claimLoading } = useDoc<Claim>(operatorId ? `operators/${operatorId}/claims/${claimId}` : undefined);
  const { data: ticket } = useDoc<Ticket>(operatorId && claim ? `operators/${operatorId}/tickets/${claim.ticketId}` : undefined);
  const { data: venue } = useDoc<{ timezone?: string; name?: string }>(operatorId && ticket ? `operators/${operatorId}/venues/${ticket.venueId}` : undefined);
  const timezone = venue?.timezone || 'UTC';

  const { entries: timeline, loading: timelineLoading } = useClaimTimeline(operatorId, claim);

  if (!operatorId || claimLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Claim" description="Loading…" />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  if (!claim) {
    return (
      <EmptyState
        title="Claim not found"
        description="This claim doesn't exist, or you don't have access to it."
        action={
          <Link href="/claims" className="text-body-sm font-medium text-text-primary hover:underline">
            Back to claims
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/claims" className="text-body-sm text-text-tertiary hover:text-text-secondary hover:underline">
          ← Back to claims
        </Link>
      </div>
      <PageHeader
        title={`Claim · ${ticket?.vehicle.plate ?? claim.ticketId.slice(0, 8)}`}
        description={`Ticket ${claim.ticketId} · Reported ${formatInTimeZone(new Date(claim.reportedAt), timezone, 'MMM d, yyyy h:mm a')}`}
        actions={<StatusPill label={CLAIM_STATUS_LABEL[claim.status]} tone={CLAIM_STATUS_TONE[claim.status]} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusStepper status={claim.status} />
          {isAdmin && <StatusActions operatorId={operatorId} claim={claim} uid={uid ?? ''} />}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <Text size="sm">{claim.description}</Text>
          </CardContent>
        </Card>
        <GuestContactCard guestContact={claim.guestContact} />
      </div>

      {claim.allegedDamage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Alleged damage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {claim.allegedDamage.map((d, i) => (
              <Text size="sm" key={i}>
                • {d.panel.replace(/_/g, ' ')} — {d.kind}
                {d.description ? `: ${d.description}` : ''}
              </Text>
            ))}
          </CardContent>
        </Card>
      )}

      {isAdmin && <AdjudicationForm operatorId={operatorId} claim={claim} uid={uid ?? ''} />}
      <InsurerCard operatorId={operatorId} claim={claim} canEdit={isAdmin} />
      {isAdmin && <EvidencePanel claimId={claim.id} evidenceBundle={claim.evidenceBundle} />}

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {timelineLoading && timeline.length === 0 ? (
            <Text size="sm" color="tertiary">
              Loading…
            </Text>
          ) : (
            timeline.map((e, i) => (
              <div key={i} className="flex flex-wrap items-baseline justify-between gap-2">
                <Text size="sm" weight="medium">
                  {e.label}
                  {e.detail ? ` — ${e.detail}` : ''}
                </Text>
                <Text size="xs" color="tertiary">
                  {formatInTimeZone(new Date(e.at), timezone, 'MMM d, h:mm a')}
                </Text>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
