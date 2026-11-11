import * as React from 'react';
import { Heading, Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

/**
 * Standard page-top header: title + optional description on the left,
 * optional action buttons on the right (e.g. "New ride").
 */
export function PageHeader({ title, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)} {...props}>
      <div className="space-y-1">
        <Heading level={1} variant="heading-lg">
          {title}
        </Heading>
        {description && (
          <Text size="md" color="secondary">
            {description}
          </Text>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
