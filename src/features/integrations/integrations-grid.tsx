'use client';
import { useMemo, useState } from 'react';
import { INTEGRATION_MANIFEST, type IntegrationManifestEntry, type Operator, type Venue } from '@goldstar/platform';
import { useCollection } from '@/lib/firebase/hooks';
import { Text } from '@/components/ui/typography';
import { IntegrationCard } from './integration-card';
import { IntegrationConfigDialog } from './integration-config-dialog';
import type { IntegrationDoc, VenueIntegrationStatus } from './health-badge';
import { isVenueConfigured } from './venue-scope';

const MODULE_LABEL: Record<IntegrationManifestEntry['module'], string> = {
  payments: 'Payments',
  messaging: 'Messaging',
  scheduling: 'Scheduling',
  pms: 'Property management (PMS)',
  pos: 'Point of sale (POS)',
  accounting: 'Accounting',
  vision: 'Vision',
  maps: 'Maps',
};

const MODULE_ORDER: IntegrationManifestEntry['module'][] = ['payments', 'messaging', 'scheduling', 'pms', 'pos', 'accounting', 'vision', 'maps'];

export interface IntegrationsGridProps {
  operatorId: string;
  operator: Operator;
  venues: Venue[];
}

/**
 * Task 8 (task-89-report.md): renders every `INTEGRATION_MANIFEST` entry, grouped by module — the
 * brief's "grid renders every INTEGRATION_MANIFEST entry grouped by module" requirement. One live
 * subscription to the whole `integrations` collection (not one `useDoc` per manifest entry — 11
 * entries would mean 11 listeners for a page that's read far more often than written) feeds every
 * card's status: operator-scoped entries look up their doc by exact id; venue-scoped entries
 * (`opera_cloud`, `toast`) count how many `{id}_{venueId}` docs exist.
 */
export function IntegrationsGrid({ operatorId, operator, venues }: IntegrationsGridProps) {
  const [openEntry, setOpenEntry] = useState<IntegrationManifestEntry | null>(null);
  const { data: integrationDocs, loading } = useCollection<IntegrationDoc & { id: string }>(`operators/${operatorId}/integrations`);

  const docsById = useMemo(() => new Map(integrationDocs.map((d) => [d.id, d])), [integrationDocs]);

  /**
   * Per-venue status rows for each venue-scoped entry (Plan 7 T6). The grid used to pass
   * `doc={undefined}` for these and show only a count, so the page had no per-venue status at all —
   * the thing T6 exists to add.
   *
   * The row's `configured` comes from the VENUE doc, not from the presence of an
   * `integrations/{id}_{venueId}` document. Those are genuinely different questions: a venue with
   * `venue.pms` filled in but no secret saved yet has NO integration doc, and would have counted as
   * unconfigured under the old count. The venue doc is what every real consumer reads, so it is what
   * "configured" has to mean here — see `venue-scope.ts`.
   *
   * The doc lookup keeps the `{id}_` PREFIX form deliberately (bug fix, task-89-report.md):
   * splitting a doc id on its first underscore breaks every real venue-scoped manifest id, because
   * the ids themselves contain underscores — `'opera_cloud_v1'.split('_')[0]` reads as `'opera'`.
   * Composing the id from the entry and the venue avoids the parse entirely.
   */
  const venueRowsByProvider = useMemo(() => {
    const rows = new Map<string, VenueIntegrationStatus[]>();
    for (const entry of INTEGRATION_MANIFEST) {
      if (entry.scope !== 'venue') continue;
      rows.set(
        entry.id,
        venues.map((v) => {
          const doc = docsById.get(`${entry.id}_${v.id}`);
          return {
            venueId: v.id,
            venueName: v.name,
            configured: isVenueConfigured(entry.id, v),
            ...(doc ? { doc } : {}),
          };
        }),
      );
    }
    return rows;
  }, [venues, docsById]);

  const byModule = useMemo(() => {
    const grouped = new Map<IntegrationManifestEntry['module'], IntegrationManifestEntry[]>();
    for (const entry of INTEGRATION_MANIFEST) {
      const list = grouped.get(entry.module) ?? [];
      list.push(entry);
      grouped.set(entry.module, list);
    }
    return grouped;
  }, []);

  if (loading) {
    return (
      <Text size="sm" color="tertiary">
        Loading…
      </Text>
    );
  }

  return (
    <div className="space-y-8">
      {MODULE_ORDER.filter((m) => byModule.has(m)).map((moduleKey) => (
        <section key={moduleKey} className="space-y-3">
          <Text size="sm" weight="medium" color="secondary" className="uppercase tracking-wide">
            {MODULE_LABEL[moduleKey]}
          </Text>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(byModule.get(moduleKey) ?? []).map((entry) => (
              <IntegrationCard
                key={entry.id}
                entry={entry}
                operator={operator}
                doc={entry.scope === 'operator' ? docsById.get(entry.id) : undefined}
                venueRows={entry.scope === 'venue' ? (venueRowsByProvider.get(entry.id) ?? []) : undefined}
                onConfigure={() => setOpenEntry(entry)}
              />
            ))}
          </div>
        </section>
      ))}

      {openEntry && (
        <IntegrationConfigDialog
          entry={openEntry}
          operatorId={operatorId}
          venues={venues}
          open={openEntry !== null}
          onOpenChange={(next) => {
            if (!next) setOpenEntry(null);
          }}
        />
      )}
    </div>
  );
}
