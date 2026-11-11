import type { CSSProperties } from 'react';
import type { Operator } from '@goldstar/platform';

/**
 * Maps an operator's brand colors onto this app's `--color-primary-500`
 * / `--color-accent-500` CSS custom properties as inline styles, so
 * every existing Tailwind class that already references them
 * (`bg-primary-500`, `text-primary-500`, `Button`'s `primary` variant,
 * etc.) picks up the operator's brand without a bespoke theming system.
 *
 * Deliberately narrow: only the base `-500` hook for each scale is
 * overridden, not the full 50-900 ramp. Hover/active states
 * (`primary-600`, `primary-700`, ...) still use the platform's own
 * default scale, not a color generated from the operator's brand — a
 * disclosed simplification (deriving a full accessible shade ramp from
 * an arbitrary operator-supplied hex is a real design-system problem,
 * out of this task's scope) rather than a full per-operator theme.
 */
export function operatorThemeVars(operator: Pick<Operator, 'branding'> | undefined): CSSProperties {
  if (!operator) return {};
  return {
    '--color-primary-500': operator.branding.primaryColor,
    '--color-accent-500': operator.branding.accentColor,
  } as CSSProperties;
}
