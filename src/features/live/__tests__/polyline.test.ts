import { describe, expect, it } from 'vitest';
import { decodePolyline } from '../polyline';

describe('decodePolyline', () => {
  it('decodes the canonical Google polyline-algorithm example into [lng, lat] pairs', () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm — the
    // documented (lat, lng) points are (38.5, -120.2), (40.7, -120.95), (43.252, -126.453).
    const coords = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(coords).toHaveLength(3);
    coords.forEach(([lng, lat], i) => {
      const expected: [number, number][] = [
        [-120.2, 38.5],
        [-120.95, 40.7],
        [-126.453, 43.252],
      ];
      expect(lng).toBeCloseTo(expected[i][0], 5);
      expect(lat).toBeCloseTo(expected[i][1], 5);
    });
  });

  it('returns an empty array for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
