import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Heading, Text } from '../typography';
import { Button } from '../buttons';

/**
 * Adapted from goldstar-web's `src/components/ui/forms/FormSuccess.tsx`
 * (task-1-report.md). goldstar-web's source used a Font Awesome icon
 * (`far fa-check`) and its legacy `.gs-form-success`/`.theme-btn` template
 * classes — this repo has neither. Rewritten with `lucide-react`'s
 * `CheckCircle2` and this repo's own `Button`/`typography` components.
 * API kept identical to the source.
 */
export interface FormSuccessProps {
  title: string;
  /** One or two sentences confirming what happens next. */
  children: React.ReactNode;
  /** Label for the button that brings the form back. */
  actionLabel: string;
  onAction: () => void;
}

/**
 * Inline confirmation rendered in place of a form after a successful send.
 * The form itself should stay mounted (hidden) so the reCAPTCHA widget
 * survives and can be reset for a second submission.
 */
export const FormSuccess = ({ title, children, actionLabel, onAction }: FormSuccessProps) => (
  <div className="border-success-100 bg-success-50 flex flex-col items-center gap-3 rounded-lg border px-6 py-10 text-center" role="status" aria-live="polite">
    <span className="text-success-600" aria-hidden>
      <CheckCircle2 className="h-10 w-10" />
    </span>
    <Heading level={4} variant="heading-xs" font="sans">
      {title}
    </Heading>
    <Text size="sm" color="secondary">
      {children}
    </Text>
    <Button type="button" variant="secondary" onClick={onAction} className="mt-2">
      {actionLabel}
    </Button>
  </div>
);

export default FormSuccess;
