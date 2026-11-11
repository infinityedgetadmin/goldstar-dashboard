'use client';
import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { venueSchema, type IntegrationManifestEntry, type Venue } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { useDoc } from '@/lib/firebase/hooks';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { stripUndefinedDeep } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/forms';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { SchemaForm } from '@/components/forms/schema-form';
import { SecretsCard } from '@/features/settings/secrets-card';
import { HealthBadge, type IntegrationDoc } from './health-badge';
import { PROVIDERS_WITHOUT_HEALTH_PROBE, venueConfigKey } from './venue-scope';

export interface IntegrationConfigDialogProps {
  entry: IntegrationManifestEntry;
  operatorId: string;
  venues: Venue[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Manifest entries whose real config already lives on the OPERATOR doc, managed by a dedicated
 * Settings section (`operator-settings-form.tsx` -> `payments-settings.tsx` / `messaging-settings.tsx`
 * / `scheduling-settings.tsx`) rather than the generic `integrations/{id}.config` this dialog writes
 * to for everything else. Re-implementing config storage for these here would either duplicate a
 * write path that already exists (drift risk — two places able to disagree about the same value) or
 * actively conflict with it: `scheduling`'s three manifest ids (`internal`/`ical`/`when_i_work`)
 * share ONE active-provider slot (`operator.modules.scheduling.{provider,config}`), not one config
 * per id, so a per-card config form here would misrepresent three independent configs where the
 * data model only has one. `stripe`/`twilio` don't have that multi-id conflict, but their config
 * already has a home (`operator.modules.payments`/`messaging`) that matches the manifest's
 * `configSchema` field-for-field — no reason to write it twice.
 *
 * Every other manifest entry (vision/`plate_recognizer`, accounting's `csv`/`quickbooks_online`,
 * maps/`mapbox`) has NO existing Settings section and, for `plate_recognizer`, no config slot on
 * the operator doc at all (`operator.modules.vision` is just `{ provider }`) — `integrations/{id}`
 * is the only place its `config` (e.g. `region`) can live today. `quickbooks_online` DOES have an
 * `operator.modules.accounting.config` slot (shared with `csv`, same single-active-slot shape as
 * scheduling) — deliberately NOT used here for the same multi-id-sharing-one-slot reason as
 * scheduling; disclosed in task-89-report.md as a real gap: this dialog's Save for
 * `quickbooks_online` stores config/secrets and makes "Test connection" meaningful, but does NOT
 * activate it as the operator's accounting provider — that switch has no UI anywhere yet (Plan 7).
 */
const SETTINGS_MANAGED_IDS = new Set(['stripe', 'twilio', 'internal', 'ical', 'when_i_work']);

interface VenuePmsPosDoc extends Venue {
  pms?: Venue['pms'];
  pos?: Venue['pos'];
}

/** Unwraps `venueSchema.shape.pms`/`.pos` (both `z.object(...).optional()`) to the inner object —
 * the REAL schema `venue-form.tsx`'s PMS/POS Controller sections are built from, deliberately used
 * instead of `INTEGRATION_MANIFEST`'s own `opera_cloud`/`toast` `configSchema`: the two have
 * actually drifted (manifest's `opera_cloud.configSchema` has a `gatewayUrl` field `venueSchema.pms`
 * doesn't define at all) — disclosed in task-89-report.md as a contracts inconsistency worth a Plan
 * 7 fix. Driving this dialog off `venueSchema` itself means Save always writes a shape
 * `venueSchema.parse` actually accepts. */
const PMS_FIELDS_SCHEMA = venueSchema.shape.pms.unwrap().omit({ provider: true });
const POS_FIELDS_SCHEMA = venueSchema.shape.pos.unwrap().omit({ provider: true });

/**
 * Task 8 (task-89-report.md): manifest-driven "Configure" dialog for one `INTEGRATION_MANIFEST`
 * entry — reused across every card in the Integrations grid rather than one dialog per provider.
 */
export function IntegrationConfigDialog({ entry, operatorId, venues, open, onOpenChange }: IntegrationConfigDialogProps) {
  const [venueId, setVenueId] = useState('');
  const [configValues, setConfigValues] = useState<Record<string, unknown>>({});
  const [configValid, setConfigValid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const isVenueScoped = entry.scope === 'venue';
  const isSettingsManaged = SETTINGS_MANAGED_IDS.has(entry.id);
  const docId = isVenueScoped && venueId ? `${entry.id}_${venueId}` : entry.id;
  const { data: integrationDoc } = useDoc<IntegrationDoc & { config?: Record<string, unknown> }>(
    !isVenueScoped || venueId ? `operators/${operatorId}/integrations/${docId}` : undefined,
  );
  const { data: venueDoc, loading: venueLoading } = useDoc<VenuePmsPosDoc>(isVenueScoped && venueId ? `operators/${operatorId}/venues/${venueId}` : undefined);

  // `venueConfigKey` is shared with the grid rather than restated here — see `venue-scope.ts`.
  const venueKey = venueConfigKey(entry.id);
  const venueFieldSchema = venueKey === 'pms' ? PMS_FIELDS_SCHEMA : venueKey === 'pos' ? POS_FIELDS_SCHEMA : undefined;
  const currentVenueConfig = venueKey ? venueDoc?.[venueKey] : undefined;
  /** Ruling AV: some providers cannot be probed at all, so no surface offers the button. */
  const canProbe = !PROVIDERS_WITHOUT_HEALTH_PROBE.has(entry.id);
  /**
   * Ground truth for the badge's third state, same source the grid uses: the VENUE doc.
   *
   * `undefined` — not `false` — while that doc is still in flight (review N1). `currentVenueConfig`
   * reads `undefined` both for "this venue has no PMS" and for "the document hasn't arrived yet",
   * so passing the bare comparison flashed "Not configured" at a venue that IS configured, for as
   * long as the read took. Safe direction and dialog-only, but it is the same loading-versus-real-
   * state confusion the venue shell guards with `operatorLoaded` and the grid never has (its docs
   * arrive with the collection). Withholding the prop falls back to the health-driven states, which
   * is the honest answer while the answer is genuinely unknown.
   */
  const venueConfigured = isVenueScoped && venueId && !venueLoading ? currentVenueConfig !== undefined : undefined;

  const saveOperatorScopedConfig = async () => {
    setSaving(true);
    try {
      const { db } = firebase();
      // KEPT, deliberately — Ruling BH named this line too, and the re-grep it asked for shows it
      // has four readers, not none. The operator-scoped doc is where an operator-scoped provider's
      // config actually lives (there is no venue doc to hold it): this dialog's own SchemaForm
      // reads it straight back as `defaultValues={integrationDoc?.config}` below, and platform-side
      // `healthCheck.ts`, `scheduling/sync.ts` and `scheduling/pushClock.ts` all merge
      // `integ.config` into the provider ctx — pushClock's own comment calls the integration doc
      // "genuinely where pushClock lives per the manifest's when_i_work schema". Deleting this
      // would drop a saved config on reopen and strip When I Work's live config source. Only the
      // VENUE-scoped mirror was unread; see `saveVenueScopedConfig`.
      await setDoc(doc(db, `operators/${operatorId}/integrations/${entry.id}`), { config: stripUndefinedDeep(configValues) }, { merge: true });
      toast.success(`${entry.label} configuration saved.`);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const saveVenueScopedConfig = async () => {
    if (!venueId || !venueKey) return;
    setSaving(true);
    try {
      const { db } = firebase();
      const value = { provider: entry.id, ...stripUndefinedDeep(configValues) };
      // ONE write. `venues/{id}.pms|pos` is the authoritative config every real consumer reads —
      // `getPms`/`getPos` gate on `venue.pms`/`venue.pos`, `pmsPostRoomCharge` and the POS charge
      // flow price from it, and `integrationsHealthCheck`'s pms/pos branch loads the VENUE doc.
      //
      // Ruling BH: this used to ALSO mirror into `integrations/{provider}_{venueId}.config`, on the
      // stated grounds that the health check read config from there. It does not — re-grepped
      // before deleting, per BH's own instruction. `healthCheck.ts` only touches `integ.config`
      // inside its SCHEDULING branch, and every scheduling manifest entry is `scope: 'operator'`,
      // so a venue-scoped doc never reaches it; its pms/pos branch reads `P.venue(...)`. Both
      // registries type that doc as `{ secretRef?: string }` and read nothing else from it. So the
      // mirror had no readers at all — a second copy of the same values, able to disagree with the
      // authoritative one and never consulted when it did.
      await updateDoc(doc(db, `operators/${operatorId}/venues/${venueId}`), { [venueKey]: value, updatedAt: new Date().toISOString() });
      toast.success(`${entry.label} configuration saved for this venue.`);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await callable('integrationsHealthCheck')({ provider: entry.id, ...(isVenueScoped && venueId ? { venueId } : {}) });
      if (res.ok) toast.success(`${entry.label}: connection healthy.`);
      else toast.error(res.message ? new Error(res.message) : new Error('health_check_failed'));
    } catch (err) {
      toast.error(err);
    } finally {
      setTesting(false);
    }
  };

  const canTest = !isVenueScoped || Boolean(venueId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{entry.label}</DialogTitle>
          <DialogDescription>{entry.docsUrl ? <Link href={entry.docsUrl} target="_blank" rel="noreferrer" className="underline">Provider documentation</Link> : `Configure the ${entry.label} integration.`}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {isSettingsManaged && (
            <Text size="sm" color="tertiary">
              This provider&apos;s configuration is managed from{' '}
              <Link href="/settings" className="text-primary-500 hover:underline">
                Settings
              </Link>
              . You can still test its connection and manage its secrets here.
            </Text>
          )}

          {isVenueScoped && (
            <Select
              label="Venue"
              fullWidth
              value={venueId}
              onChange={(e) => {
                setVenueId(e.target.value);
                setConfigValues({});
              }}
              options={venues.map((v) => ({ value: v.id, label: v.name }))}
              placeholder="Select a venue"
            />
          )}

          {isVenueScoped && venueId && venueFieldSchema && (
            <SchemaForm
              key={venueId}
              schema={venueFieldSchema}
              defaultValues={currentVenueConfig ?? {}}
              onChange={(values, valid) => {
                setConfigValues(values);
                setConfigValid(valid);
              }}
              idPrefix={`integration-${entry.id}-${venueId}`}
            />
          )}

          {!isVenueScoped && !isSettingsManaged && entry.configSchema instanceof z.ZodObject && (
            <SchemaForm
              schema={entry.configSchema}
              defaultValues={integrationDoc?.config ?? {}}
              exclude={entry.secretFields}
              onChange={(values, valid) => {
                setConfigValues(values);
                setConfigValid(valid);
              }}
              idPrefix={`integration-${entry.id}`}
            />
          )}

          {!configValid && (
            <Text size="xs" color="error">
              Fix the highlighted fields above before saving.
            </Text>
          )}

          {!isSettingsManaged && (isVenueScoped ? venueId && venueFieldSchema : entry.configSchema instanceof z.ZodObject) && (
            <Button
              type="button"
              size="sm"
              onClick={isVenueScoped ? saveVenueScopedConfig : saveOperatorScopedConfig}
              loading={saving}
              disabled={!configValid}
            >
              Save configuration
            </Button>
          )}

          {entry.secretFields.length > 0 && (isVenueScoped ? Boolean(venueId) : true) && (
            <SecretsCard provider={entry.id} secretFields={entry.secretFields} {...(isVenueScoped && venueId ? { venueId } : {})} />
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <HealthBadge
              doc={isVenueScoped ? (venueId ? integrationDoc : undefined) : integrationDoc}
              {...(venueConfigured !== undefined ? { configured: venueConfigured } : {})}
            />
            {canProbe ? (
              <Button type="button" variant="secondary" size="sm" onClick={testConnection} loading={testing} disabled={!canTest}>
                Test connection
              </Button>
            ) : (
              // RULING AV. Not a disabled button — a disabled control still advertises that testing
              // is a thing this provider does and will one day work. It cannot: there is no adapter,
              // and `integrationsHealthCheck` would return not-implemented AND stamp
              // `health.ok:false` + `lastError` on the doc, painting a never-broken integration red.
              // Ruling AC: that red is what teaches operators to ignore red.
              <Text size="xs" color="tertiary" className="max-w-[22rem] text-right">
                Connection testing isn&apos;t available for {entry.label} yet. Saved settings and
                secrets are still used when a charge is posted.
              </Text>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
