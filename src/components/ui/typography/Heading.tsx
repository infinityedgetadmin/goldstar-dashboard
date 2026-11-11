import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Adapted from goldstar-web's `src/components/ui/typography/Heading.tsx` for
 * the (public) guest surface. Only change (disclosed in task-2-report.md):
 * the default font family for levels 3-6 is `sans`, not `body` — this
 * repo's generated `src/styles/tokens.css` (scripts/generate-tokens-css.mjs)
 * only emits `--font-display` and `--font-sans` custom properties, not
 * `--font-body`, so a `font-body` utility class has no backing CSS variable
 * here and would silently no-op. `font="body"` remains a selectable prop
 * value for parity with the tokens package's `fontFamilies.body`, in case a
 * future tokens-generator update adds the variable.
 */
export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /**
   * The heading level (h1-h6)
   */
  level: 1 | 2 | 3 | 4 | 5 | 6;

  /**
   * Visual variant - controls size and styling
   * @default Uses semantic sizing based on level
   */
  variant?:
    | 'display-2xl'
    | 'display-xl'
    | 'display-lg'
    | 'display-md'
    | 'display-sm'
    | 'display-xs'
    | 'heading-xl'
    | 'heading-lg'
    | 'heading-md'
    | 'heading-sm'
    | 'heading-xs'
    | 'page-banner'
    | 'section-title'
    | 'card-title'
    | 'footer-title';

  /**
   * Font family to use
   * @default 'display' for h1-h2, 'sans' for h3-h6
   */
  font?: 'display' | 'body' | 'sans';

  /**
   * Text color
   * @default 'primary'
   */
  color?: 'primary' | 'secondary' | 'inverse' | 'inherit';

  /**
   * Text alignment
   */
  align?: 'left' | 'center' | 'right';

  /**
   * Children content
   */
  children: React.ReactNode;

  /**
   * Additional CSS classes
   */
  className?: string;
}

const defaultSizeByLevel = {
  1: 'text-display-lg',
  2: 'text-heading-lg',
  3: 'text-heading-md',
  4: 'text-heading-sm',
  5: 'text-heading-xs',
  6: 'text-body-lg font-semibold',
} as const;

const variantStyles = {
  'display-2xl': 'text-display-2xl font-display',
  'display-xl': 'text-display-xl font-display',
  'display-lg': 'text-display-lg font-display',
  'display-md': 'text-display-md font-display',
  'display-sm': 'text-display-sm font-display',
  'display-xs': 'text-display-xs font-display',
  'heading-xl': 'text-heading-xl',
  'heading-lg': 'text-heading-lg',
  'heading-md': 'text-heading-md',
  'heading-sm': 'text-heading-sm',
  'heading-xs': 'text-heading-xs',
  'page-banner': 'text-display-lg font-display font-bold',
  'section-title': 'text-heading-lg font-display font-bold',
  'card-title': 'text-heading-sm font-semibold',
  'footer-title': 'text-heading-xs font-semibold uppercase tracking-wide',
} as const;

const colorStyles = {
  primary: 'text-text-primary',
  secondary: 'text-text-secondary',
  inverse: 'text-text-inverse',
  inherit: '',
} as const;

const fontStyles = {
  display: 'font-display',
  body: 'font-body',
  sans: 'font-sans',
} as const;

const alignStyles = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;

/**
 * Heading component for consistent typography hierarchy.
 *
 * @example
 * <Heading level={1} variant="heading-md" font="display">Goldstar</Heading>
 */
export const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ level, variant, font, color = 'primary', align, children, className, ...props }, ref) => {
    const Tag = `h${level}` as React.ElementType;

    const defaultFont = level <= 2 ? 'display' : 'sans';
    const fontClass = font ? fontStyles[font] : fontStyles[defaultFont];

    const sizeClass = variant ? variantStyles[variant] : defaultSizeByLevel[level];

    const headingClasses = cn(sizeClass, fontClass, colorStyles[color], align && alignStyles[align], className);

    return (
      <Tag ref={ref} className={headingClasses} {...props}>
        {children}
      </Tag>
    );
  }
);

Heading.displayName = 'Heading';
