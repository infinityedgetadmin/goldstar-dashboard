'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { DAMAGE_KINDS, VEHICLE_PANELS, e164Schema, uuidv7 } from '@goldstar/platform';
import { z } from 'zod';
import { firebase } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import { stripUndefinedDeep } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/forms/Textarea';
import { Input } from '@/components/ui/forms/Input';
import { Select } from '@/components/ui/forms/Select';
import { FormField } from '@/components/ui/forms/FormField';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';

export interface ClaimIntakeDialogProps {
  operatorId: string;
  ticketId: string;
  /** Auto-attributed `createdBy` — the signed-in staff member filing the claim on the guest's behalf. */
  createdByUid: string;
  /** Prefills the guest-contact name only — per the house PII-masking rule, phone/email are left for
   * staff to type in deliberately rather than silently pulling `ticket.guest.phoneE164` into a form
   * field (that number is already visible on the ticket detail page only behind the audited "Reveal"
   * action; this form isn't that flow). */
  guestName?: string;
  onCreated: (claimId: string) => void;
  onCancel: () => void;
}

interface AllegedDamageRow {
  panel: (typeof VEHICLE_PANELS)[number];
  kind: (typeof DAMAGE_KINDS)[number];
  description: string;
}

const PANEL_OPTIONS = VEHICLE_PANELS.map((p) => ({ value: p, label: p.replace(/_/g, ' ') }));
const KIND_OPTIONS = DAMAGE_KINDS.map((k) => ({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1) }));
const DESCRIPTION_MAX = 4000;
const emailSchema = z.string().email();

function emptyRow(): AllegedDamageRow {
  return { panel: VEHICLE_PANELS[0], kind: DAMAGE_KINDS[0], description: '' };
}

/**
 * Claim intake, from a ticket (`ticket-actions.tsx`'s "Open claim" button target,
 * `/claims/new?ticketId=`). Writes `claims/{uuidv7}` DIRECTLY via `setDoc` (not a callable) — matches
 * `claimSchema`'s create shape and `firestore.rules`' claims create allowlist exactly: `(isAdmin() ||
 * isPlatformAdmin()) && !('evidenceBundle' in request.resource.data)`; this page's own admin+ gate
 * (`claims/new/page.tsx`) enforces the SAME role check before rendering, mirroring
 * `venues/new/page.tsx`'s page-level admin+ gate for the identical reason (a lead who
 * URL-navigates straight here would otherwise fill out the whole form only to have the write denied
 * by rules on submit).
 *
 * Since this is a direct client write (not a callable), there is no server-side zod validation of
 * the payload — `firestore.rules` only checks role/shape-of-keys, not field FORMATS. `contactPhone`/
 * `contactEmail` are therefore format-validated here before being included, so a malformed value
 * can't silently corrupt `claimSchema.safeParse()` reads downstream (the platform's `onClaimWritten`
 * trigger drops and logs a parse failure rather than throwing — a bad phone/email here would just
 * silently disable that claim's status-change emails with no visible error to the admin who typed it).
 */
export function ClaimIntakeDialog({ operatorId, ticketId, createdByUid, guestName, onCreated, onCancel }: ClaimIntakeDialogProps) {
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<AllegedDamageRow[]>([emptyRow()]);
  const [contactName, setContactName] = useState(guestName ?? '');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trimmedDescription = description.trim();
  const descriptionValid = trimmedDescription.length > 0 && trimmedDescription.length <= DESCRIPTION_MAX;
  const trimmedPhone = contactPhone.trim();
  const trimmedEmail = contactEmail.trim();
  const phoneValid = trimmedPhone === '' || e164Schema.safeParse(trimmedPhone).success;
  const emailValid = trimmedEmail === '' || emailSchema.safeParse(trimmedEmail).success;
  const valid = descriptionValid && phoneValid && emailValid;

  const updateRow = (i: number, patch: Partial<AllegedDamageRow>) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      const id = uuidv7();
      const now = new Date().toISOString();
      const { db } = firebase();
      const guestContact = stripUndefinedDeep({
        name: contactName.trim() || undefined,
        phone: trimmedPhone || undefined,
        email: trimmedEmail || undefined,
      });
      await setDoc(doc(db, `operators/${operatorId}/claims/${id}`), {
        id,
        operatorId,
        ticketId,
        status: 'intake',
        reportedAt: now,
        description: trimmedDescription,
        allegedDamage: rows.map((r) => ({ panel: r.panel, kind: r.kind, description: r.description.trim() })),
        guestContact,
        createdBy: createdByUid,
        createdAt: now,
      });
      toast.success('Claim created.');
      onCreated(id);
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Claim details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            label="Description"
            aria-label="Claim description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={4}
            fullWidth
            helperText={`${trimmedDescription.length}/${DESCRIPTION_MAX}`}
            error={!descriptionValid && description.length > 0 ? 'Required, up to 4000 characters.' : undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alleged damage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <FormField htmlFor={`panel-${i}`} label="Panel">
                <Select id={`panel-${i}`} options={PANEL_OPTIONS} value={row.panel} onChange={(e) => updateRow(i, { panel: e.target.value as AllegedDamageRow['panel'] })} />
              </FormField>
              <FormField htmlFor={`kind-${i}`} label="Kind">
                <Select id={`kind-${i}`} options={KIND_OPTIONS} value={row.kind} onChange={(e) => updateRow(i, { kind: e.target.value as AllegedDamageRow['kind'] })} />
              </FormField>
              <Input
                label="Note"
                aria-label={`Alleged damage note ${i + 1}`}
                value={row.description}
                onChange={(e) => updateRow(i, { description: e.target.value })}
                maxLength={500}
              />
              {rows.length > 1 && (
                <Button variant="ghost" size="sm" aria-label={`Remove alleged damage row ${i + 1}`} onClick={() => removeRow(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} iconPosition="left" onClick={addRow}>
            Add damage
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guest contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Input label="Name" fullWidth value={contactName} onChange={(e) => setContactName(e.target.value)} />
          <Input
            label="Phone"
            fullWidth
            placeholder="+13175550100"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            error={!phoneValid ? 'Enter a valid phone number, e.g. +13175550100.' : undefined}
          />
          <Input
            label="Email"
            type="email"
            fullWidth
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            error={!emailValid ? 'Enter a valid email address.' : undefined}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={submit} loading={submitting} disabled={!valid || submitting}>
          Create claim
        </Button>
        {!valid && (
          <Text size="sm" color="tertiary">
            Fix the highlighted fields before saving.
          </Text>
        )}
      </div>
    </div>
  );
}
