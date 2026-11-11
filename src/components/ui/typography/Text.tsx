import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Adapted from goldstar-web's `src/components/ui/typography/Text.tsx` for
 * the (public) guest surface. Disclosed changes (see task-2-report.md):
 *  - Default `font` is `sans`, not `body`, for the same reason as
 *    `Heading` — this repo's tokens.css has no `--font-body` variable.
 *  - The polymorphic `as` render used `ref={ref as any}` in the source,
 *    which this workspace's rules forbid. Replaced with the same
 *    `Tag = as as React.ElementType` pattern `Heading` already uses (no
 *    `any` involved) so the ref stays correctly typed.
 */
export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * HTML element to render
   * @default 'p'
   */
  as?: 'p' | 'span' | 'div' | 'label' | 'small';

  /**
   * Text size variant
   * @default 'md'
   */
  size?: 'xl' | 'lg' | 'md' | 'sm' | 'xs';

  /**
   * Font weight
   * @default 'normal'
   */
  weight?: 'light' | 'normal' | 'medium' | 'semibold' | 'bold';

  /**
   * Text color
   * @default 'primary'
   */
  color?: 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'inherit' | 'success' | 'error';

  /**
   * Text alignment
   */
  align?: 'left' | 'center' | 'right' | 'justify';

  /**
   * Font family
   * @default 'sans'
   */
  font?: 'body' | 'sans' | 'display';

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
  xl: 'text-body-xl',
  lg: 'text-body-lg',
  md: 'text-body-md',
  sm: 'text-body-sm',
  xs: 'text-body-xs',
} as const;

const weightStyles = {
  light: 'font-light',
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
} as const;

const colorStyles = {
  primary: 'text-text-primary',
  secondary: 'text-text-secondary',
  tertiary: 'text-text-tertiary',
  inverse: 'text-text-inverse',
  inherit: '',
  success: 'text-success-600',
  error: 'text-error-600',
} as const;

const alignStyles = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify',
} as const;

const fontStyles = {
  body: 'font-body',
  sans: 'font-sans',
  display: 'font-display',
} as const;

/**
 * Text component for body text, paragraphs, and inline text.
 *
 * @example
 * <Text size="sm" color="secondary">St. Elmo</Text>
 */
export const Text = React.forwardRef<HTMLElement, TextProps>(
  (
    { as = 'p', size = 'md', weight = 'normal', color = 'secondary', align, font = 'sans', children, className, ...props },
    ref
  ) => {
    const Tag = as as React.ElementType;

    const textClasses = cn(
      sizeStyles[size],
      weightStyles[weight],
      colorStyles[color],
      fontStyles[font],
      align && alignStyles[align],
      className
    );

    return (
      <Tag ref={ref} className={textClasses} {...props}>
        {children}
      </Tag>
    );
  }
);

Text.displayName = 'Text';
