import type { IntegrationId, Venue } from '@goldstar/platform';

/**
 * Which field on the VENUE document holds a venue-scoped provider's real configuration.
 *
 * Plan 7 T2/T3 put PMS and POS config on `venues/{id}.pms` / `.pos`, not on
 * `integrations/{id}_{venueId}.config` where the manifest's `configSchema` describes it — the
 * manifest's `opera_cloud` entry even declares a `gatewayUrl` that exists nowhere in
 * `venueSchema.pms`. Every consumer that actually charges a folio or applies a validation reads
 * the venue doc, so that is the config's home and this map is the single statement of it.
 *
 * Shared rather than restated: `integration-config-dialog.tsx` had this ternary inline and
 * `integrations-grid.tsx` now needs the same answer to decide whether a venue is configured at
 * all. Two copies of a mapping that must agree is how they stop agreeing.
 */
export function venueConfigKey(entryId: IntegrationId): 'pms' | 'pos' | undefined {
  if (entryId === 'opera_cloud') return 'pms';
  if (entryId === 'toast') return 'pos';
  return undefined;
}

/** Ground truth for "is this venue configured for this provider" — the venue doc, never the
 * integration doc (see `HealthBadge`'s comment on why `doc.status` cannot answer this). */
export function isVenueConfigured(entryId: IntegrationId, venue: Venue): boolean {
  const key = venueConfigKey(entryId);
  return key ? venue[key] !== undefined : false;
}

/**
 * Providers whose connection cannot be probed at all, so no surface may offer "Test connection"
 * for them (Ruling AV).
 *
 * `opera_cloud` has no adapter and is not getting one this plan (Ruling H). The platform's
 * `integrationsHealthCheck` hard-routes by module: scheduling reaches a provider, and everything
 * else returns "not implemented" AND stamps `health.ok:false` + `lastError` on the doc. So a Test
 * button here would not merely do nothing — it would turn the card RED for an integration that was
 * never broken, which is exactly the meaningless red Ruling AC says destroys the page's value.
 *
 * `toast` is deliberately NOT in this set: `ToastPos.healthCheck()` is a real, live, cache-bypassing
 * probe, and T6's platform half wires the pos branch to it through the registry. A provider belongs
 * here only while nothing can probe it — REMOVE an id from this set when its adapter lands, rather
 * than adding a second mechanism.
 */
export const PROVIDERS_WITHOUT_HEALTH_PROBE: ReadonlySet<IntegrationId> = new Set<IntegrationId>(['opera_cloud']);
