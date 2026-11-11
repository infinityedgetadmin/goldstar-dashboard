import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Copied verbatim from goldstar-web's `src/components/ui/typography/Label.tsx`
 * (task-1-report.md) — no adaptation needed; every class it uses
 * (`text-ui-*`, `text-text-*`, `text-error-500`) already resolves against
 * this repo's `src/styles/tokens.css`. Added here (not present when this
 * repo's `typography/` folder was first adapted in Plan 3) because the
 * new `ui/forms/{Input,Select,Textarea}` need it.
 */
export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /**
   * Label size
   * @default 'md'
   */
  size?: 'lg' | 'md' | 'sm';

  /**
   * Label text color
   * @default 'primary'
   */
  color?: 'primary' | 'secondary' | 'inverse' | 'inherit';

  /**
   * Whether the field is required
   */
  required?: boolean;

  /**
   * Whether the field is disabled
   */
  disabled?: boolean;

  /**
   * Children content
   */
  children: React.ReactNode;

  /**
   * Additional CSS classes
   */
  className?: string;
}

const sizeStyles = {
  lg: 'text-ui-lg',
  md: 'text-ui-md',
  sm: 'text-ui-sm',
} as const;

const colorStyles = {
  primary: 'text-text-primary',
  secondary: 'text-text-secondary',
  inverse: 'text-text-inverse',
  inherit: '',
} as const;

/**
 * Label component for form field labels
 *
 * @example
 * <Label htmlFor="email" required>
 *   Email Address
 * </Label>
 */
export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ size = 'md', color = 'primary', required, disabled, children, className, ...props }, ref) => {
    const labelClasses = cn(
      'block mb-2 font-medium',
      sizeStyles[size],
      colorStyles[color],
      disabled && 'text-text-disabled cursor-not-allowed',
      className
    );

    return (
      <label ref={ref} className={labelClasses} {...props}>
        {children}
        {required && (
          <span className="text-error-500 ml-1" aria-label="required">
            *
          </span>
        )}
      </label>
    );
  }
);

Label.displayName = 'Label';
