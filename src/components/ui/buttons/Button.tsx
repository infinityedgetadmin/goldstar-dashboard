'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Adapted from goldstar-web's `src/components/ui/buttons/Button.tsx` for the
 * (public) guest surface. Differences from the source (disclosed in
 * task-2-report.md):
 *  - The `icon` prop that accepted a Font Awesome class string is dropped —
 *    this repo has no Font Awesome. `icon` is `ReactNode` only; the loading
 *    spinner uses `lucide-react`'s `Loader2` instead of `far fa-spinner-third`.
 *  - The spin animation is gated with `motion-safe:` so it respects
 *    `prefers-reduced-motion` (the button's `aria-busy` + disabled state and
 *    its own loading label still communicate progress without motion).
 *  - Every size enforces a 44px minimum touch target (`min-h-11`) per this
 *    workspace's accessibility rule; goldstar-web's `sm` size did not.
 *  - The `danger` variant's focus ring and disabled state no longer use
 *    `error-200`/`error-300` — this repo's token package only ships
 *    `error.{50,100,500,600,700}` (see @goldstar/platform/tokens `semantic`),
 *    so those classes would resolve to no CSS variable and silently no-op.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Button visual variant
   * @default 'primary'
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';

  /**
   * Button size
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';

  /**
   * Full width button
   * @default false
   */
  fullWidth?: boolean;

  /**
   * Loading state
   * @default false
   */
  loading?: boolean;

  /**
   * Icon to display
   */
  icon?: React.ReactNode;

  /**
   * Icon position
   * @default 'right'
   */
  iconPosition?: 'left' | 'right';

  /**
   * Children content
   */
  children: React.ReactNode;

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Button type
   * @default 'button'
   */
  type?: 'button' | 'submit' | 'reset';
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: [
    'bg-primary-500 text-white',
    'hover:bg-primary-600 active:bg-primary-700',
    'focus-visible:ring-4 focus-visible:ring-primary-200',
    'disabled:bg-primary-300 disabled:cursor-not-allowed',
  ].join(' '),
  secondary: [
    'bg-white text-primary-500 border-2 border-primary-500',
    'hover:bg-primary-50 active:bg-primary-100',
    'focus-visible:ring-4 focus-visible:ring-primary-200',
    'disabled:bg-gray-100 disabled:text-primary-300 disabled:border-primary-300 disabled:cursor-not-allowed',
  ].join(' '),
  ghost: [
    'bg-transparent text-primary-500',
    'hover:bg-primary-50 active:bg-primary-100',
    'focus-visible:ring-4 focus-visible:ring-primary-200',
    'disabled:text-primary-300 disabled:cursor-not-allowed',
  ].join(' '),
  danger: [
    'bg-error-500 text-white',
    'hover:bg-error-600 active:bg-error-700',
    'focus-visible:ring-4 focus-visible:ring-error-100',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ].join(' '),
  link: [
    'bg-transparent text-primary-500 underline',
    'hover:text-primary-600',
    'disabled:text-primary-300 disabled:cursor-not-allowed',
  ].join(' '),
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'min-h-11 px-3 py-1.5 text-ui-sm rounded-md',
  md: 'min-h-11 px-6 py-3 text-ui-md rounded-lg',
  lg: 'min-h-11 px-8 py-4 text-ui-lg rounded-lg',
  xl: 'min-h-11 px-10 py-5 text-ui-xl rounded-xl',
};

/**
 * Button component with multiple variants and states.
 *
 * @example
 * <Button variant="primary" size="xl" fullWidth loading={busy}>
 *   Request my car
 * </Button>
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      loading = false,
      icon,
      iconPosition = 'right',
      children,
      className,
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const buttonClasses = cn(
      'inline-flex items-center justify-center gap-2',
      'font-medium transition-colors duration-300',
      'focus:outline-none',
      variantStyles[variant],
      sizeStyles[size],
      fullWidth && 'w-full',
      loading && 'relative cursor-wait',
      className
    );

    const leadingIcon = loading ? (
      <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
    ) : icon && iconPosition === 'left' ? (
      icon
    ) : null;
    const trailingIcon = !loading && icon && iconPosition === 'right' ? icon : null;

    return (
      <button
        ref={ref}
        type={type}
        className={buttonClasses}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {leadingIcon}
        {children}
        {trailingIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
