import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '../typography/Label';

/**
 * Adapted from goldstar-web's `src/components/ui/forms/Select.tsx`
 * (task-1-report.md). This is the plain native `<select>` variant (label +
 * helper/error text), distinct from the Radix-based `@/components/ui/select`
 * used for richer dropdowns. Disclosed changes: `font-body` -> `font-sans`
 * (same reason as `Input`); the dropdown chevron used a Font Awesome class
 * (`far fa-chevron-down`) — this repo has no Font Awesome, replaced with
 * `lucide-react`'s `ChevronDown`, matching the rest of this workspace's icon
 * usage (see `ui/buttons/Button.tsx`'s header comment).
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  selectSize?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  wrapperClassName?: string;
  labelClassName?: string;
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-body-sm',
  md: 'px-4 py-2.5 text-body-md',
  lg: 'px-5 py-3 text-body-lg',
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      helperText,
      error,
      options,
      placeholder,
      selectSize = 'md',
      fullWidth = false,
      wrapperClassName,
      labelClassName,
      className,
      id,
      required,
      disabled,
      ...props
    },
    ref
  ) => {
    const selectId = id || `select-${Math.random().toString(36).slice(2, 11)}`;
    const hasError = !!error;

    const selectClasses = cn(
      'block min-h-11 appearance-none rounded-lg border bg-white bg-no-repeat font-sans',
      'transition-all duration-300',
      'focus:outline-none focus:ring-2',
      'disabled:bg-bg-secondary disabled:cursor-not-allowed disabled:text-text-disabled',
      sizeStyles[selectSize],
      fullWidth && 'w-full',
      'pr-10',
      hasError
        ? 'border-error-500 text-error-700 focus:border-error-500 focus:ring-error-100'
        : 'border-border text-text-primary focus:border-primary-500 focus:ring-primary-200',
      className
    );

    return (
      <div className={cn(fullWidth && 'w-full', wrapperClassName)}>
        {label && (
          <Label htmlFor={selectId} required={required} disabled={disabled} className={labelClassName}>
            {label}
          </Label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={selectClasses}
            disabled={disabled}
            required={required}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="text-text-tertiary pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>

        {hasError && error && (
          <p id={`${selectId}-error`} className="mt-1.5 text-body-sm text-error-600" role="alert">
            {error}
          </p>
        )}
        {!hasError && helperText && (
          <p id={`${selectId}-helper`} className="text-text-tertiary mt-1.5 text-body-sm">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
