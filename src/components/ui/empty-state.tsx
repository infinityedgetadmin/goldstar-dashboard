import * as React from 'react';
import { Heading, Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/**
 * Placeholder shown in place of a list/table when there's nothing to show
 * yet (e.g. "No rides scheduled today").
 */
export function EmptyState({ icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn('border-border flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center', className)}
      {...props}
    >
      {icon && <div className="text-text-tertiary [&_svg]:h-10 [&_svg]:w-10">{icon}</div>}
      <Heading level={3} variant="heading-xs" font="sans">
        {title}
      </Heading>
      {description && (
        <Text size="sm" color="secondary" className="max-w-sm">
          {description}
        </Text>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
