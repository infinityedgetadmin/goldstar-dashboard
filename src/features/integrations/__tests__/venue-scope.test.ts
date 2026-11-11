import { describe, expect, it } from 'vitest';
import { INTEGRATION_MANIFEST, type Venue } from '@goldstar/platform';
import { PROVIDERS_WITHOUT_HEALTH_PROBE, isVenueConfigured, venueConfigKey } from '../venue-scope';

const venue = (over: Partial<Venue> = {}): Venue => ({ id: 'v1', name: 'The Grand', operatorId: 'op1', type: 'hotel', ...over }) as unknown as Venue;
const PMS = { provider: 'opera_cloud', hotelId: 'h1', chargeCode: 'VLT', noPostBehavior: 'block' } as unknown as Venue['pms'];
const POS = { provider: 'toast', restaurantGuid: 'r1' } as unknown as Venue['pos'];

describe('venueConfigKey', () => {
  it('maps each venue-scoped provider to the venue field its real config lives in', () => {
    expect(venueConfigKey('opera_cloud')).toBe('pms');
    expect(venueConfigKey('toast')).toBe('pos');
  });

  it('covers every venue-scoped manifest entry — a new one must not fall through silently', () => {
    // This is the assertion that catches a third venue-scoped provider being added upstream: it
    // would arrive here as `undefined` and read as permanently unconfigured on the page.
    for (const entry of INTEGRATION_MANIFEST.filter((e) => e.scope === 'venue')) {
      expect(venueConfigKey(entry.id)).toBeDefined();
    }
  });

  it('returns undefined for operator-scoped providers, which have no venue config field', () => {
    expect(venueConfigKey('stripe')).toBeUndefined();
    expect(venueConfigKey('when_i_work')).toBeUndefined();
  });
});

describe('isVenueConfigured', () => {
  it('reads the venue document, provider by provider', () => {
    expect(isVenueConfigured('opera_cloud', venue({ pms: PMS }))).toBe(true);
    expect(isVenueConfigured('toast', venue({ pms: PMS }))).toBe(false);
    expect(isVenueConfigured('toast', venue({ pos: POS }))).toBe(true);
  });

  it('a venue with neither is configured for neither', () => {
    expect(isVenueConfigured('opera_cloud', venue())).toBe(false);
    expect(isVenueConfigured('toast', venue())).toBe(false);
  });

  it('is false for an operator-scoped provider rather than throwing', () => {
    expect(isVenueConfigured('stripe', venue({ pms: PMS }))).toBe(false);
  });
});

describe('PROVIDERS_WITHOUT_HEALTH_PROBE (Ruling AV)', () => {
  it('holds opera_cloud, which has no adapter to probe', () => {
    expect(PROVIDERS_WITHOUT_HEALTH_PROBE.has('opera_cloud')).toBe(true);
  });

  it('does NOT hold toast — ToastPos.healthCheck is a real live probe', () => {
    expect(PROVIDERS_WITHOUT_HEALTH_PROBE.has('toast')).toBe(false);
  });

  it('does not quietly disable testing for any operator-scoped provider', () => {
    // Scheduling's health check works today; sweeping an operator-scoped id in here would remove a
    // working button rather than a false one.
    for (const entry of INTEGRATION_MANIFEST.filter((e) => e.scope === 'operator')) {
      expect(PROVIDERS_WITHOUT_HEALTH_PROBE.has(entry.id)).toBe(false);
    }
  });
});
