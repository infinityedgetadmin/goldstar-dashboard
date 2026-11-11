import { StatusPill, type StatusTone } from '@/components/ui/status-pill';

export interface IntegrationHealth {
  ok: boolean;
  message?: string;
}

export interface IntegrationDoc {
  status?: 'configured' | 'active' | 'error' | 'disabled';
  health?: IntegrationHealth;
  lastSyncAt?: string;
  lastError?: string;
}

/** One venue's status for a venue-scoped manifest entry (`opera_cloud`, `toast`) — see `HealthBadge`
 * and `integrations-grid.tsx` for where `configured` comes from. */
export interface VenueIntegrationStatus {
  venueId: string;
  venueName: string;
  /** Ground truth from the VENUE doc (`venue.pms` / `venue.pos` presence) — see `HealthBadge`. */
  configured: boolean;
  /** `integrations/{entryId}_{venueId}`, if one exists at all. */
  doc?: IntegrationDoc;
}

/**
 * Task 8 (task-89-report.md): small presentational status pill for an `integrations/{id}` doc's
 * `health`/`status`. Handles the "never health-checked yet" state explicitly (`unknown`, neutral
 * tone) — most manifest entries only get a real `health` value the first time someone clicks "Test
 * connection" (`integrationsHealthCheck`), so an absent `health` must read as "not tested" rather
 * than silently falling into either the ok or error bucket.
 *
 * `integrationsHealthCheck`'s current per-provider coverage (see that handler's own doc comment in
 * `goldstar-platform`) means every provider except scheduling's `internal` returns `ok: false,
 * message: 'health check not implemented for this provider yet'` today — this badge renders that
 * honestly (negative tone, the real message) rather than hiding it, so "Test connection" never
 * looks like it silently did nothing.
 *
 * THE THIRD STATE (Plan 7 T6, Ruling AC). Health alone is binary, so a not-configured integration
 * used to be indistinguishable from an untested one — and once anything stamped `health.ok:false`
 * on it, from a red one. Ruling AC: "a missing adapter is not a failing one, and wiring it red
 * teaches operators to ignore red, which destroys the page." So `configured` is a SEPARATE input,
 * and passing `false` short-circuits to a neutral "Not configured" that no health value can
 * override.
 *
 * `configured` is deliberately NOT read from `doc.status`. Nothing writes `status` for
 * venue-scoped docs today (`integrationsSetSecret` merges only `secretRef`, and zod's `'configured'`
 * default applies at parse time, not in Firestore), and a venue with `venue.pms` set but no secret
 * has no integration doc at all — so the doc is silent exactly where the answer is needed. The
 * ground truth is the VENUE doc: `venue.pms` / `venue.pos` presence, which is also precisely what
 * the platform's registries key on (`getPms`/`getPos` reject unconfigured venues distinctly from
 * configured-but-no-adapter ones). Callers that pass no `configured` — every operator-scoped card —
 * behave exactly as before.
 */
export function HealthBadge({ doc, configured }: { doc?: IntegrationDoc; configured?: boolean }) {
  if (configured === false) {
    return <StatusPill label="Not configured" tone="neutral" title="No credentials or settings for this venue yet — not a failure." />;
  }
  if (!doc?.health) {
    return <StatusPill label="Not tested" tone="neutral" />;
  }
  const tone: StatusTone = doc.health.ok ? 'positive' : 'negative';
  const label = doc.health.ok ? 'Healthy' : 'Error';
  return <StatusPill label={label} tone={tone} title={doc.health.message ?? doc.lastError} />;
}
