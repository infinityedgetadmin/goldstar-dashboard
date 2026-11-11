'use client';
import { useState } from 'react';
import type { IntegrationManifestEntry, Operator } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { formatDateTime } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { HealthBadge, type IntegrationDoc, type VenueIntegrationStatus } from './health-badge';
import { PROVIDERS_WITHOUT_HEALTH_PROBE } from './venue-scope';

export interface IntegrationCardProps {
  entry: IntegrationManifestEntry;
  operator: Operator;
  /** The `operators/{op}/integrations/{entry.id}` doc — operator-scoped entries only; a venue-scoped
   * entry has no single doc (see `venueConfiguredCount` instead). */
  doc?: IntegrationDoc;
  /** Venue-scoped entries only: one row per venue, each with its own configured/health state. */
  venueRows?: VenueIntegrationStatus[];
  onConfigure: () => void;
}

/**
 * `operator.modules.{payments,messaging,scheduling,vision,accounting}` each carry a single active
 * `provider` — the 5 manifest modules that have that concept at all (`pms`/`pos`/`maps` don't; see
 * `integration-config-dialog.tsx`'s header comment for the full module-by-module breakdown). Used
 * only to render an "Active" badge — never gates anything, since a manifest entry can legitimately
 * be configured/tested before ever being switched on.
 */
function isActiveProvider(entry: IntegrationManifestEntry, operator: Operator): boolean {
  switch (entry.module) {
    case 'payments':
      return operator.modules.payments.provider === entry.id;
    case 'messaging':
      return operator.modules.messaging.provider === entry.id;
    case 'scheduling':
      return operator.modules.scheduling.provider === entry.id;
    case 'vision':
      return operator.modules.vision.provider === entry.id;
    case 'accounting':
      return operator.modules.accounting.provider === entry.id;
    default:
      return false;
  }
}

/**
 * Per-venue status for a venue-scoped entry (Plan 7 T6). Each row is one of Ruling AC's three
 * states, and the not-configured one is rendered in a NEUTRAL tone on purpose: a venue that simply
 * has no PMS is not a fault, and showing it red is what trains an operator to stop reading red.
 *
 * `configured` is passed explicitly rather than inferred from the doc, because the integration doc
 * cannot answer it — see `HealthBadge`'s comment.
 *
 * For a provider nothing can probe (Ruling AV) the list says so once, under the rows. This states a
 * fact about OUR OWN surface — no test is offered — rather than a claim about the provider's
 * condition, which is the part this page has no way to know.
 */
function VenueStatusList({ entry, rows }: { entry: IntegrationManifestEntry; rows: VenueIntegrationStatus[] }) {
  const configuredCount = rows.filter((r) => r.configured).length;

  if (rows.length === 0) {
    return (
      <Text size="xs" color="tertiary">
        No venues yet.
      </Text>
    );
  }

  return (
    <div className="space-y-2">
      <Text size="xs" color="tertiary">
        {configuredCount} of {rows.length} venue(s) configured
      </Text>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.venueId} className="flex items-center justify-between gap-2">
            <Text as="span" size="xs" color="secondary" className="min-w-0 truncate">
              {row.venueName}
            </Text>
            <HealthBadge doc={row.doc} configured={row.configured} />
          </li>
        ))}
      </ul>
      {PROVIDERS_WITHOUT_HEALTH_PROBE.has(entry.id) && (
        <Text size="xs" color="tertiary">
          Connection testing isn&apos;t available for this provider yet, so a configured venue shows
          as configured rather than as tested.
        </Text>
      )}
    </div>
  );
}

/**
 * Task 8 (task-89-report.md): one card per `INTEGRATION_MANIFEST` entry in the Integrations grid.
 *
 * "Test connection" (`integrationsHealthCheck`) is offered here only for `scope: 'operator'`
 * entries — a venue-scoped one (`opera_cloud`, `toast`) needs a venue picked first, which only the
 * Configure dialog has room for; testing per-venue happens there.
 *
 * Plan 7 T6: a venue-scoped card now lists PER-VENUE status instead of a bare count of how many
 * `integrations/{id}_{venueId}` docs exist. Three states, per Ruling AC — configured and healthy,
 * configured and failing, and NOT CONFIGURED, which is not an error. A card for a provider nothing
 * can probe (Ruling AV) also says so in place of offering a test that would only paint it red.
 *
 * "Sync now" (`schedulingSyncNow`) is offered only when this card IS the operator's currently
 * ACTIVE scheduling provider — the callable has no `provider` input at all, it always syncs
 * whichever provider `operator.modules.scheduling.provider` currently names. Showing the button on
 * an inactive scheduling card (e.g. `ical` while `internal` is active) would silently sync the
 * WRONG provider when clicked — this card guards against that rather than relying on the operator
 * to already know the callable's scope.
 */
export function IntegrationCard({ entry, operator, doc, venueRows, onConfigure }: IntegrationCardProps) {
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const active = isActiveProvider(entry, operator);

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await callable('integrationsHealthCheck')({ provider: entry.id });
      if (res.ok) toast.success(`${entry.label}: connection healthy.`);
      else toast.error(res.message ? new Error(res.message) : new Error('health_check_failed'));
    } catch (err) {
      toast.error(err);
    } finally {
      setTesting(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await callable('schedulingSyncNow')({});
      toast.success(`Synced — ${res.upserted} shift(s) updated${res.errors.length ? `, ${res.errors.length} error(s)` : ''}.`);
    } catch (err) {
      toast.error(err);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1.5">
          <CardTitle as="h4" className="text-heading-xs">
            {entry.label}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {active && (
              <Badge variant="primary" size="sm">
                Active
              </Badge>
            )}
            {entry.scope === 'venue' && (
              <Badge variant="default" size="sm">
                Venue-scoped
              </Badge>
            )}
          </div>
        </div>
        {entry.scope === 'operator' && <HealthBadge doc={doc} />}
      </CardHeader>
      <CardContent className="space-y-3">
        {entry.scope === 'venue' ? (
          <VenueStatusList entry={entry} rows={venueRows ?? []} />
        ) : (
          <Text size="xs" color="tertiary">
            {doc?.lastSyncAt
              ? `Last synced ${formatDateTime(doc.lastSyncAt)}`
              : doc?.status
                ? `Status: ${doc.status}`
                : 'Not configured yet'}
          </Text>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onConfigure}>
            Configure
          </Button>
          {entry.scope === 'operator' && (
            <Button type="button" size="sm" variant="secondary" onClick={testConnection} loading={testing}>
              Test connection
            </Button>
          )}
          {entry.module === 'scheduling' && active && (
            <Button type="button" size="sm" variant="secondary" onClick={syncNow} loading={syncing}>
              Sync now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
