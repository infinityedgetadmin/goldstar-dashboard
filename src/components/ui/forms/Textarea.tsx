import React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '../typography/Label';

/**
 * Adapted from goldstar-web's `src/components/ui/forms/Textarea.tsx`
 * (task-1-report.md). Same disclosed fix as `Input`: `font-body` -> `font-sans`.
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  textareaSize?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  wrapperClassName?: string;
  labelClassName?: string;
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-body-sm',
  md: 'px-4 py-2.5 text-body-md',
  lg: 'px-5 py-3 text-body-lg',
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      helperText,
      error,
      textareaSize = 'md',
      fullWidth = false,
      wrapperClassName,
      labelClassName,
      className,
      id,
      required,
      disabled,
      rows = 4,
      ...props
    },
    ref
  ) => {
    const textareaId = id || `textarea-${Math.random().toString(36).slice(2, 11)}`;
    const hasError = !!error;

    const textareaClasses = cn(
      'block min-h-11 rounded-lg border font-sans',
      'resize-vertical transition-all duration-300',
      'focus:outline-none focus:ring-2',
      'disabled:bg-bg-secondary disabled:cursor-not-allowed disabled:text-text-disabled',
      sizeStyles[textareaSize],
      fullWidth && 'w-full',
      hasError
        ? 'border-error-500 text-error-700 focus:border-error-500 focus:ring-error-100'
        : 'border-border text-text-primary focus:border-primary-500 focus:ring-primary-200',
      className
    );

    return (
      <div className={cn(fullWidth && 'w-full', wrapperClassName)}>
        {label && (
          <Label htmlFor={textareaId} required={required} disabled={disabled} className={labelClassName}>
            {label}
          </Label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          className={textareaClasses}
          disabled={disabled}
          required={required}
          rows={rows}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
          {...props}
        />

        {hasError && error && (
          <p id={`${textareaId}-error`} className="mt-1.5 text-body-sm text-error-600" role="alert">
            {error}
          </p>
        )}
        {!hasError && helperText && (
          <p id={`${textareaId}-helper`} className="text-text-tertiary mt-1.5 text-body-sm">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
