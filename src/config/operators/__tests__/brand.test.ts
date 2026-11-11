import { describe, expect, it } from 'vitest';
import { BRANDS, DEFAULT_OPERATOR_SLUG, resolveOperatorBrand } from '../brand';
import { demo } from '../demo';
import { goldstar } from '../goldstar';

describe('operator brand registry (Plan 8 Task 15)', () => {
  it('defaults to goldstar when NEXT_PUBLIC_OPERATOR is unset or empty', () => {
    expect(resolveOperatorBrand(undefined)).toBe(goldstar);
    expect(resolveOperatorBrand('')).toBe(goldstar);
    expect(DEFAULT_OPERATOR_SLUG).toBe('goldstar');
  });

  it('resolves each registered slug to its brand', () => {
    expect(resolveOperatorBrand('goldstar')).toBe(goldstar);
    expect(resolveOperatorBrand('demo')).toBe(demo);
  });

  it('an unknown slug throws at build time rather than shipping a mis-branded build', () => {
    expect(() => resolveOperatorBrand('nope')).toThrow(/Unknown NEXT_PUBLIC_OPERATOR "nope"/);
  });

  it('every brand is internally consistent: slug is its registry key, hosting target is unique, colors are hex', () => {
    const targets = new Set<string>();
    for (const [key, b] of Object.entries(BRANDS)) {
      expect(b.slug).toBe(key);
      expect(b.primaryColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(b.accentColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(b.supportPhone).toMatch(/^\+1\d{10}$/);
      expect(targets.has(b.hostingTarget)).toBe(false);
      targets.add(b.hostingTarget);
    }
  });

  it('the demo brand fronts the seeded second tenant (valetb) with Valet Co B branding', () => {
    expect(demo).toMatchObject({ operatorId: 'valetb', displayName: 'Valet Co B', primaryColor: '#1d4ed8', accentColor: '#f59e0b' });
  });
});
