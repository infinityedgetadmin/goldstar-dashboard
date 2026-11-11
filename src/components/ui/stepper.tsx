import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Text } from '@/components/ui/typography';

export interface StepperStep {
  key: string;
  label: string;
}

export interface StepperProps extends React.HTMLAttributes<HTMLOListElement> {
  steps: StepperStep[];
  /** Index of the step currently being shown. */
  currentIndex: number;
}

/**
 * Generic numbered progress indicator for a multi-step flow (onboarding
 * wizards, multi-step forms). Deliberately domain-agnostic — callers pass
 * their own `{ key, label }[]`, same pattern as `StatusPill`'s `tone` prop.
 */
export function Stepper({ steps, currentIndex, className, ...props }: StepperProps) {
  return (
    <ol className={cn('flex flex-wrap items-center gap-x-2 gap-y-3', className)} aria-label="Progress" {...props}>
      {steps.map((step, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-ui-xs font-medium',
                complete && 'border-primary-500 bg-primary-500 text-white',
                active && !complete && 'border-primary-500 text-primary-700',
                !active && !complete && 'border-border text-text-tertiary'
              )}
            >
              {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <Text
              as="span"
              size="sm"
              weight={active ? 'semibold' : 'normal'}
              color={active ? 'primary' : complete ? 'secondary' : 'tertiary'}
              aria-current={active ? 'step' : undefined}
            >
              {step.label}
            </Text>
            {index < steps.length - 1 && <span aria-hidden className="h-px w-6 bg-border sm:w-10" />}
          </li>
        );
      })}
    </ol>
  );
}
