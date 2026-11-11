import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
}

/**
 * KPI tile for dashboard summary rows, e.g. "Rides today: 42".
 */
export function StatTile({ label, value, subtitle, icon, trend, className, ...props }: StatTileProps) {
  return (
    <Card variant="elevated" padding="md" className={cn(className)} {...props}>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Text size="xs" weight="medium" color="tertiary" className="tracking-wide uppercase">
            {label}
          </Text>
          <p className="text-display-xs text-text-primary font-display font-semibold">{value}</p>
          {subtitle && (
            <Text size="sm" color="secondary">
              {subtitle}
            </Text>
          )}
          {trend && (
            <Text size="sm" weight="medium" className={trend.isPositive ? 'text-success-600' : 'text-error-600'}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%{' '}
              <span className="text-text-tertiary font-normal">vs last period</span>
            </Text>
          )}
        </div>
        {icon && <div className="bg-primary-100 text-primary-600 shrink-0 rounded-xl p-3 [&_svg]:h-5 [&_svg]:w-5">{icon}</div>}
      </CardContent>
    </Card>
  );
}
