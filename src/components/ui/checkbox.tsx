'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Radix renders `Root` as the actual interactive element (a real
 * `<button role="checkbox">`), so it — not a decorative wrapper — is what
 * needs the 44px touch target: it's sized `h-11 w-11` and centers a
 * smaller, purely visual 20x20 box inside it. This keeps `<label
 * htmlFor="checkbox-id">` working exactly as before (the id still lands on
 * `Root`, the actual control) while satisfying this workspace's 44px
 * minimum touch target rule without inflating the visible checkbox.
 * `className` now targets the 44x44 hit area rather than the visual box —
 * there were no consumers of `Checkbox` in the tree yet, so this is a safe
 * API adjustment, not a breaking change to any call site.
 */
export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'group peer flex h-11 w-11 shrink-0 items-center justify-center rounded-sm focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    <span
      aria-hidden
      className={cn(
        'border-border flex h-5 w-5 items-center justify-center rounded-sm border shadow-sm transition-colors',
        'group-data-[state=checked]:bg-primary-500 group-data-[state=checked]:border-primary-500 group-data-[state=checked]:text-white',
        'group-focus-visible:ring-primary-200 group-focus-visible:ring-2'
      )}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check className="h-3.5 w-3.5" />
      </CheckboxPrimitive.Indicator>
    </span>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;
