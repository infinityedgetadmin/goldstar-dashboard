import React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '../typography/Label';

/**
 * Adapted from goldstar-web's `src/components/ui/forms/Input.tsx`
 * (task-1-report.md). Disclosed change: `font-body` -> `font-sans` — same
 * reason as `typography/Heading` and `typography/Text` (P3): this repo's
 * `tokens.css` has no `--font-body` variable, so `font-body` would
 * silently no-op. Also bumped to a 44px minimum touch target (`min-h-11`)
 * per this workspace's accessibility rule, which the source did not have.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  inputSize?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  wrapperClassName?: string;
  labelClassName?: string;
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-body-sm',
  md: 'px-4 py-2.5 text-body-md',
  lg: 'px-5 py-3 text-body-lg',
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { label, helperText, error, inputSize = 'md', fullWidth = false, wrapperClassName, labelClassName, className, id, required, disabled, ...props },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).slice(2, 11)}`;
    const hasError = !!error;

    const inputClasses = cn(
      'block min-h-11 rounded-lg border font-sans',
      'transition-all duration-300',
      'focus:outline-none focus:ring-2',
      'disabled:bg-bg-secondary disabled:cursor-not-allowed disabled:text-text-disabled',
      sizeStyles[inputSize],
      fullWidth && 'w-full',
      hasError
        ? 'border-error-500 text-error-700 focus:border-error-500 focus:ring-error-100'
        : 'border-border text-text-primary focus:border-primary-500 focus:ring-primary-200',
      className
    );

    return (
      <div className={cn(fullWidth && 'w-full', wrapperClassName)}>
        {label && (
          <Label htmlFor={inputId} required={required} disabled={disabled} className={labelClassName}>
            {label}
          </Label>
        )}

        <input
          ref={ref}
          id={inputId}
          className={inputClasses}
          disabled={disabled}
          required={required}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          {...props}
        />

        {hasError && error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-body-sm text-error-600" role="alert">
            {error}
          </p>
        )}
        {!hasError && helperText && (
          <p id={`${inputId}-helper`} className="text-text-tertiary mt-1.5 text-body-sm">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
