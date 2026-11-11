import * as React from 'react';
import { Heading } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

export interface SectionTitleProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  action?: React.ReactNode;
}

/**
 * Smaller heading used to divide a page into sections (e.g. within a card
 * or a dashboard panel) — one step down from `PageHeader`.
 */
export function SectionTitle({ title, action, className, ...props }: SectionTitleProps) {
  return (
    <div className={cn('flex items-center justify-between gap-2', className)} {...props}>
      <Heading level={2} variant="heading-xs" font="sans">
        {title}
      </Heading>
      {action}
    </div>
  );
}
