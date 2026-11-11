import React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '../typography/Label';
import { Text } from '../typography/Text';

/**
 * Adapted from goldstar-web's `src/components/ui/forms/FormField.tsx`
 * (task-1-report.md). goldstar-web's source styled this with its own
 * legacy template CSS classes (`form-group gs-field`, `.gs-field__label`,
 * `.gs-field__hint`, etc.) that don't exist in this repo — rewritten here
 * with tokens-styled Tailwind classes using this repo's own
 * `typography/Label` and `typography/Text`, same visual language as
 * `ui/forms/Input`. API kept identical to the source.
 */
export interface FormFieldProps {
  /** id of the control this label points at. */
  htmlFor: string;
  /** Visible label text. */
  label: React.ReactNode;
  /** Marks the field required (adds the asterisk) or optional (adds the tag). */
  required?: boolean;
  /** Short helper sentence rendered under the control. */
  hint?: React.ReactNode;
  /** Extra classes on the wrapper. */
  className?: string;
  /** The control itself. Pass `aria-describedby={hintIdFor(id)}` if you use a hint. */
  children: React.ReactNode;
}

/** Stable id for the hint so controls can reference it via aria-describedby. */
export const hintIdFor = (htmlFor: string) => `${htmlFor}-hint`;

export const FormField = ({ htmlFor, label, required, hint, className, children }: FormFieldProps) => (
  <div className={cn('space-y-1.5', className)}>
    <div className="flex items-baseline justify-between">
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {!required && (
        <Text as="span" size="xs" color="tertiary">
          Optional
        </Text>
      )}
    </div>
    {children}
    {hint && (
      <Text as="p" id={hintIdFor(htmlFor)} size="sm" color="tertiary">
        {hint}
      </Text>
    )}
  </div>
);

export default FormField;
