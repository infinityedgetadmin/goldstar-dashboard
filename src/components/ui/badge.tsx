import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center gap-1 whitespace-nowrap font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-bg-secondary text-text-secondary border border-border',
        primary: 'bg-primary-100 text-primary-700 border border-primary-200',
        accent: 'bg-accent-100 text-accent-700 border border-accent-200',
        success: 'bg-success-100 text-success-700 border border-success-100',
        warning: 'bg-warning-100 text-warning-700 border border-warning-100',
        error: 'bg-error-100 text-error-700 border border-error-100',
        info: 'bg-info-100 text-info-700 border border-info-100',
        'solid-primary': 'bg-primary-500 text-white border-transparent',
        'solid-success': 'bg-success-500 text-white border-transparent',
        'solid-warning': 'bg-warning-500 text-white border-transparent',
        'solid-error': 'bg-error-500 text-white border-transparent',
      },
      size: {
        sm: 'px-2 py-0.5 text-ui-xs rounded-full',
        md: 'px-2.5 py-1 text-ui-sm rounded-full',
        lg: 'px-3 py-1.5 text-ui-md rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, dot, children, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant, size, className }))} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
);
Badge.displayName = 'Badge';
