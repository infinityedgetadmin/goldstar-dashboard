import * as React from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';

export type StatusTone = 'neutral' | 'positive' | 'warning' | 'negative' | 'info';

const toneToVariant: Record<StatusTone, NonNullable<BadgeProps['variant']>> = {
  neutral: 'default',
  positive: 'success',
  warning: 'warning',
  negative: 'error',
  info: 'info',
};

export interface StatusPillProps extends Omit<BadgeProps, 'variant'> {
  /** Visible label, e.g. "In transit". */
  label: string;
  /** Semantic tone — domain code (ride/driver/vehicle status, etc.) maps to this at the call site. */
  tone?: StatusTone;
}

/**
 * Small status indicator for table rows/cards. Deliberately domain-agnostic
 * (no baked-in ride/driver/vehicle status enums) — the caller maps its own
 * domain status to a `tone`, keeping this component free of a dependency on
 * any particular feature's types.
 */
export function StatusPill({ label, tone = 'neutral', dot = true, size = 'sm', ...props }: StatusPillProps) {
  return (
    <Badge variant={toneToVariant[tone]} dot={dot} size={size} {...props}>
      {label}
    </Badge>
  );
}
