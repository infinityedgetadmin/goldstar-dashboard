import type { OperatorBrand } from './brand';

/** Valet Co B — the white-label demo operator (`valetb`). Mirrors goldstar-mobile's
 * `config/operators/demo.json` and goldstar-platform's seeded second tenant. */
export const demo: OperatorBrand = {
  slug: 'demo',
  operatorId: 'valetb',
  displayName: 'Valet Co B',
  primaryColor: '#1d4ed8',
  accentColor: '#f59e0b',
  supportPhone: '+15555550100',
  hostingTarget: 'demo',
};
