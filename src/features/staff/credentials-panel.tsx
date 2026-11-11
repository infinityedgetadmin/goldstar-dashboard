'use client';
import { useState, type ChangeEvent } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, updateDoc, deleteField, arrayUnion, type FieldValue } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import type { Credentials } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import { sameSet } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/forms/Input';
import { Select } from '@/components/ui/forms/Select';
import { Button } from '@/components/ui/buttons';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';

export interface CredentialsPanelProps {
  operatorId: string;
  uid: string;
  credentials?: Credentials;
}

const ACCEPTED_DOC_TYPES = 'application/pdf,image/jpeg,image/png';
const DOCUMENT_KINDS = [
  { kind: 'license' as const, label: 'License' },
  { kind: 'insurance' as const, label: 'Insurance' },
  { kind: 'background' as const, label: 'Background check' },
];

function toIsoDateOnly(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00.000Z`).toISOString();
}
function fromIsoDateOnly(iso?: string): string {
  return iso ? iso.slice(0, 10) : '';
}
function parseEndorsements(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

/** `undefined` = omit the key entirely (never had a value); `deleteField()` = clear a value that
 * existed before; a non-empty string = the new value. Mirrors `venue-form.tsx`'s
 * `withClearedFieldsDeleted` reasoning, applied per-field since this panel writes dotted
 * `credentials.*` paths (so untouched siblings — `documents`, `endorsements`, `backgroundCheck` —
 * are never clobbered by a whole-map `credentials: {...}` replacement). */
function fieldOrDelete(next: string, hadValue: boolean): string | FieldValue | undefined {
  const trimmed = next.trim();
  if (trimmed) return trimmed;
  return hadValue ? deleteField() : undefined;
}

function expiryChip(iso?: string): { label: string; tone: StatusTone } | null {
  if (!iso) return null;
  const days = Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
  if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, tone: 'negative' };
  if (days < 7) return { label: `Expires in ${days}d`, tone: 'negative' };
  if (days < 30) return { label: `Expires in ${days}d`, tone: 'warning' };
  return { label: `Expires in ${days}d`, tone: 'positive' };
}

const formSchema = z.object({
  licenseNumber: z.string(),
  licenseState: z.string(),
  licenseClass: z.string(),
  licenseExpiresAt: z.string(),
  insuranceCarrier: z.string(),
  insuranceExpiresAt: z.string(),
  backgroundStatus: z.enum(['pending', 'approved', 'rejected']),
  backgroundAt: z.string(),
  backgroundProvider: z.string(),
  endorsements: z.string(),
});
type FormValues = z.infer<typeof formSchema>;

function defaultsFrom(c?: Credentials): FormValues {
  return {
    licenseNumber: c?.licenseNumber ?? '',
    licenseState: c?.licenseState ?? '',
    licenseClass: c?.licenseClass ?? '',
    licenseExpiresAt: fromIsoDateOnly(c?.licenseExpiresAt),
    insuranceCarrier: c?.insuranceCarrier ?? '',
    insuranceExpiresAt: fromIsoDateOnly(c?.insuranceExpiresAt),
    backgroundStatus: c?.backgroundCheck?.status ?? 'pending',
    backgroundAt: fromIsoDateOnly(c?.backgroundCheck?.at),
    backgroundProvider: c?.backgroundCheck?.provider ?? '',
    endorsements: (c?.endorsements ?? []).join(', '),
  };
}

const BACKGROUND_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

/**
 * Admin-edited license/insurance/background-check fields plus document uploads, for
 * `operators/{op}/users/{uid}/credentials`. Direct `updateDoc` with dotted `credentials.*` paths
 * (see `fieldOrDelete`'s header comment) — same rules basis as `user-editor.tsx`. Document uploads go
 * to Storage at `operators/{op}/users/{uid}/credentials/{kind}-{timestamp}.{ext}`; `storage.rules`'
 * `operators/{op}/users/{uid}/credentials/{file}` write rule already allows `isAdmin()` to upload on
 * behalf of the staff member (confirmed against the installed rule directly — it carries an inline
 * "admins may upload on behalf (Plan 4a T6)" comment, so no rules change was needed for this task).
 */
export function CredentialsPanel({ operatorId, uid, credentials }: CredentialsPanelProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: defaultsFrom(credentials) });

  // The ORIGINAL, as-loaded values — FROZEN at mount (fix round 1, task-6-review.md Major 2), same
  // reasoning and same mechanism as `user-editor.tsx`'s own `original`: `credentials` is fed by a
  // live subscription one level up, so comparing against the LIVE prop instead of a mount-time
  // snapshot would mean a concurrent edit changes what "unchanged" means mid-session, and an
  // untouched field would then look "changed" and get overwritten with this admin's stale copy —
  // reintroducing the exact clobbering bug this fix exists to eliminate, just via the opposite path.
  const [original] = useState(() => defaultsFrom(credentials));

  /**
   * Fix round 1 (task-6-review.md Major 2): EVERY field here used to resend its mount-time form
   * value unconditionally on every save — `backgroundCheck`/`endorsements` most consequentially,
   * since both feed `computeEligibility` directly, but the scalar license/insurance fields had the
   * identical bug. A second admin's concurrent, unrelated edit (e.g. approving a background check)
   * made between this admin opening the form and clicking Save got silently reverted by this
   * admin's own save, even though they never touched that section. Fixed the same way as
   * `user-editor.tsx`'s Major 3 fix: compare each field's current value against the FROZEN original
   * and only include genuinely-changed keys in the `updateDoc` payload — untouched sections are
   * never resent, so they can never clobber a concurrent edit to the same field.
   */
  const onSubmit = async (values: FormValues) => {
    try {
      const { db } = firebase();
      const payload: Record<string, unknown> = {};
      const set = (key: string, v: string | FieldValue | undefined) => {
        if (v !== undefined) payload[key] = v;
      };
      if (values.licenseNumber !== original.licenseNumber) set('credentials.licenseNumber', fieldOrDelete(values.licenseNumber, !!credentials?.licenseNumber));
      const licenseState = values.licenseState.toUpperCase();
      if (licenseState !== original.licenseState.toUpperCase()) set('credentials.licenseState', fieldOrDelete(licenseState, !!credentials?.licenseState));
      if (values.licenseClass !== original.licenseClass) set('credentials.licenseClass', fieldOrDelete(values.licenseClass, !!credentials?.licenseClass));
      if (values.licenseExpiresAt !== original.licenseExpiresAt) {
        set('credentials.licenseExpiresAt', values.licenseExpiresAt ? toIsoDateOnly(values.licenseExpiresAt) : credentials?.licenseExpiresAt ? deleteField() : undefined);
      }
      if (values.insuranceCarrier !== original.insuranceCarrier) set('credentials.insuranceCarrier', fieldOrDelete(values.insuranceCarrier, !!credentials?.insuranceCarrier));
      if (values.insuranceExpiresAt !== original.insuranceExpiresAt) {
        set('credentials.insuranceExpiresAt', values.insuranceExpiresAt ? toIsoDateOnly(values.insuranceExpiresAt) : credentials?.insuranceExpiresAt ? deleteField() : undefined);
      }
      const endorsements = parseEndorsements(values.endorsements);
      if (!sameSet(endorsements, parseEndorsements(original.endorsements))) payload['credentials.endorsements'] = endorsements;
      const backgroundChanged = values.backgroundStatus !== original.backgroundStatus || values.backgroundAt !== original.backgroundAt || values.backgroundProvider.trim() !== original.backgroundProvider;
      if (backgroundChanged) {
        payload['credentials.backgroundCheck'] = {
          status: values.backgroundStatus,
          at: values.backgroundAt ? toIsoDateOnly(values.backgroundAt) : new Date().toISOString(),
          ...(values.backgroundProvider.trim() ? { provider: values.backgroundProvider.trim() } : {}),
        };
      }
      if (Object.keys(payload).length === 0) {
        toast.info('Nothing to save.');
        return;
      }
      await updateDoc(doc(db, `operators/${operatorId}/users/${uid}`), payload);
      toast.success('Credentials updated.');
    } catch (e) {
      toast.error(e);
    }
  };

  const handleUpload = (kind: (typeof DOCUMENT_KINDS)[number]['kind']) => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(kind);
    try {
      const { db, storage } = firebase();
      const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
      const path = `operators/${operatorId}/users/${uid}/credentials/${kind}-${Date.now()}.${ext}`;
      await uploadBytes(ref(storage, path), file, { contentType: file.type });
      await updateDoc(doc(db, `operators/${operatorId}/users/${uid}`), {
        'credentials.documents': arrayUnion({ kind, storagePath: path, uploadedAt: new Date().toISOString() }),
      });
      toast.success('Document uploaded.');
    } catch (err) {
      toast.error(err);
    } finally {
      setUploading(null);
    }
  };

  const licenseChip = expiryChip(credentials?.licenseExpiresAt);
  const insuranceChip = expiryChip(credentials?.insuranceExpiresAt);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>License</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Input label="License number" fullWidth {...register('licenseNumber')} />
          <Input label="State" fullWidth maxLength={2} {...register('licenseState')} />
          <Input label="Class" fullWidth {...register('licenseClass')} />
          <div className="space-y-1.5">
            <Input label="Expires" type="date" fullWidth {...register('licenseExpiresAt')} />
            {licenseChip && <StatusPill label={licenseChip.label} tone={licenseChip.tone} />}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Insurance</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Input label="Carrier" fullWidth {...register('insuranceCarrier')} />
          <div className="space-y-1.5">
            <Input label="Expires" type="date" fullWidth {...register('insuranceExpiresAt')} />
            {insuranceChip && <StatusPill label={insuranceChip.label} tone={insuranceChip.tone} />}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Background check</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Controller
            name="backgroundStatus"
            control={control}
            render={({ field }) => <Select label="Status" options={BACKGROUND_STATUS_OPTIONS} value={field.value} onChange={(e) => field.onChange(e.target.value)} />}
          />
          <Input label="Checked on" type="date" fullWidth {...register('backgroundAt')} />
          <Input label="Provider" fullWidth {...register('backgroundProvider')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endorsements</CardTitle>
        </CardHeader>
        <CardContent>
          <Input label="Endorsements (comma-separated)" fullWidth placeholder="wheelchair, child_seat" {...register('endorsements')} />
        </CardContent>
      </Card>

      <Button type="submit" loading={isSubmitting}>
        Save credentials
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            {DOCUMENT_KINDS.map(({ kind, label }) => {
              const inputId = `credentials-upload-${kind}`;
              const busy = uploading === kind;
              return (
                <label
                  key={kind}
                  htmlFor={inputId}
                  className="border-border text-text-secondary hover:bg-bg-secondary flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg border px-4 text-body-sm font-medium transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                  aria-disabled={busy}
                >
                  {busy ? 'Uploading…' : `Upload ${label.toLowerCase()}`}
                  <input id={inputId} type="file" accept={ACCEPTED_DOC_TYPES} className="sr-only" onChange={handleUpload(kind)} disabled={busy} />
                </label>
              );
            })}
          </div>
          {(credentials?.documents ?? []).length === 0 ? (
            <Text size="sm" color="tertiary">
              No documents uploaded yet.
            </Text>
          ) : (
            <ul className="space-y-1">
              {(credentials?.documents ?? []).map((docEntry, i) => (
                <li key={i}>
                  <Text size="sm" color="tertiary">
                    {docEntry.kind} — {docEntry.storagePath.split('/').pop()}
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </form>
  );
}
