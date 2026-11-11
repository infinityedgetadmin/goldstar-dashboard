'use client';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormField } from '@/components/ui/forms/FormField';
import { Input } from '@/components/ui/forms/Input';
import { Select } from '@/components/ui/forms/Select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/typography/Label';

/**
 * Renders a form from a plain `z.object` shape — string/number/boolean/enum/url fields
 * only (task-4-brief.md's stated scope for provider integration `configSchema`s, e.g.
 * `INTEGRATION_MANIFEST`'s ical/when_i_work entries). Any other field kind (record,
 * array, nested object, etc.) is silently skipped rather than crashed on — disclosed in
 * task-4-report.md; today's manifest only has one such case (when_i_work's
 * `venueMap: z.record(...)`).
 *
 * Introspects the schema via zod v3's PUBLIC API only (`ZodObject.shape`,
 * `instanceof z.Zod*`, `ZodOptional.unwrap()`, `ZodDefault.removeDefault()`,
 * `ZodString.isURL`, `ZodNumber.minValue/maxValue/isInt`, `ZodEnum.options`) — verified
 * directly against the installed `zod@3.25.76`'s `node_modules/zod/v3/types.d.ts` rather
 * than assumed. The one internal-shaped read, `ZodDefault`'s default VALUE (as opposed to
 * its default TYPE, which `.removeDefault()` covers), has no public accessor in zod v3 —
 * only `_def.defaultValue()` — but that field IS part of `ZodDefault`'s own public type
 * signature (`ZodDefaultDef<T>.defaultValue: () => T`), not an `any`-typed escape hatch,
 * so no isolation comment or eslint-disable is needed for it either.
 *
 * Fix round 1 (Major M1): `unwrapField` now actually CALLS `_def.defaultValue()` and
 * `defaultsWithSchemaFallback` seeds it into `useForm`'s `defaultValues` for any field the
 * caller didn't already supply a value for. Previously the default value was discarded —
 * an uncontrolled `register()`-bound input with no seeded value falls back to a *browser*
 * default (the DOM's first `<option>` for a `<select>`, empty string/NaN for text/number),
 * which has no relationship to zod's `.default()` at all. That bug was dormant only because
 * the one `.default()`-bearing field reachable through shipped UI (`ical`'s
 * `matchBy: z.enum(['email','name']).default('email')`) happened to have its default equal
 * to the first enum member.
 *
 * Manages its own internal `react-hook-form` instance (a self-contained "island" sub-form)
 * rather than taking a `register`/`control` from a parent form: the schema — and therefore
 * the field-name type — is only known at runtime (a manifest entry chosen by the operator),
 * so there is no single static `FieldValues` type a parent form could share with this
 * component through react-hook-form's generic `Path<T>` typing. Reports its current values
 * and validity up via `onChange` on every edit; the parent (e.g. `scheduling-settings.tsx`)
 * decides when/how to persist them.
 */
export interface SchemaFormProps {
  schema: z.ZodObject<z.ZodRawShape>;
  defaultValues?: Record<string, unknown>;
  /** Field keys to omit from rendering — keeps manifest `secretFields` out of the general config form. */
  exclude?: readonly string[];
  onChange?: (values: Record<string, unknown>, valid: boolean) => void;
  idPrefix?: string;
}

interface UnwrappedField {
  type: z.ZodTypeAny;
  required: boolean;
  hasDefault: boolean;
  defaultValue?: unknown;
}

function unwrapField(schema: z.ZodTypeAny): UnwrappedField {
  if (schema instanceof z.ZodDefault) {
    const inner = unwrapField(schema.removeDefault());
    return { type: inner.type, required: false, hasDefault: true, defaultValue: schema._def.defaultValue() };
  }
  if (schema instanceof z.ZodOptional) {
    const inner = unwrapField(schema.unwrap());
    return { type: inner.type, required: false, hasDefault: inner.hasDefault, defaultValue: inner.defaultValue };
  }
  return { type: schema, required: true, hasDefault: false };
}

/**
 * Merges a zod object schema's `.default()` values into a caller-supplied `defaultValues`
 * object, WITHOUT overriding anything the caller already provided for that key — a caller
 * explicitly seeding a field (e.g. `scheduling-settings.tsx` re-loading a previously-saved
 * config) always wins over the schema's own default.
 */
function defaultsWithSchemaFallback(schema: z.ZodObject<z.ZodRawShape>, defaultValues?: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...defaultValues };
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    const hasCallerValue = defaultValues ? Object.prototype.hasOwnProperty.call(defaultValues, key) : false;
    if (hasCallerValue) continue;
    const unwrapped = unwrapField(fieldSchema);
    if (unwrapped.hasDefault) merged[key] = unwrapped.defaultValue;
  }
  return merged;
}

/** `feedUrl` -> "Feed url", `apiKey` -> "Api key" — a readable label from a camelCase manifest field name. */
function labelFor(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function SchemaForm({ schema, defaultValues, exclude = [], onChange, idPrefix = 'schema-form' }: SchemaFormProps) {
  const {
    register,
    control,
    watch,
    trigger,
    formState: { errors, isValid },
  } = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema),
    // `mode: 'onChange'` — needed for `isValid` to update live as the operator types, not only
    // after a submit that doesn't exist here (this sub-form has no submit button of its own).
    mode: 'onChange',
    // `useForm`'s `defaultValues` is read once at mount, not on every render — so it's safe (and
    // simplest) to recompute this plain merge inline rather than memoize it; only the value
    // present on this component's FIRST render is ever actually used by react-hook-form.
    defaultValues: defaultsWithSchemaFallback(schema, defaultValues),
  });

  const values = watch();

  useEffect(() => {
    // react-hook-form doesn't run the resolver on mount — `isValid` optimistically reads `true`
    // until the first validation pass, which otherwise only happens on the first user edit. A
    // parent gating its own Save button on this `onChange`'s `valid` flag (e.g.
    // `scheduling-settings.tsx`) would wrongly enable Save for an untouched, actually-invalid
    // config (blank required fields) until the operator happened to touch one. Forcing one
    // `trigger()` right after mount makes `isValid` reflect the real starting state immediately.
    void trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onChange?.(values, isValid);
    // `values` is a fresh object identity from `watch()` on every render, which is exactly the
    // "fire on every edit" behavior this effect needs — an exhaustive-deps-satisfying primitive
    // dependency (e.g. JSON.stringify(values)) would only add cost, not correctness, here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, isValid]);

  const SUPPORTED = [z.ZodBoolean, z.ZodEnum, z.ZodNumber, z.ZodString] as const;
  const fields = Object.entries(schema.shape)
    .filter(([key]) => !exclude.includes(key))
    .map(([key, fieldSchema]) => ({ key, ...unwrapField(fieldSchema) }))
    .filter(({ type }) => SUPPORTED.some((Kind) => type instanceof Kind));
  if (fields.length === 0) return null;

  return (
    <div className="space-y-4">
      {fields.map(({ key, type, required }) => {
        const fieldId = `${idPrefix}-${key}`;
        const fieldError = errors[key];
        const error = typeof fieldError?.message === 'string' ? fieldError.message : undefined;
        const label = labelFor(key);

        if (type instanceof z.ZodBoolean) {
          return (
            <div key={key} className="flex items-center gap-3">
              <Controller
                name={key}
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id={fieldId}
                    checked={Boolean(field.value)}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    aria-label={label}
                  />
                )}
              />
              <Label htmlFor={fieldId}>{label}</Label>
            </div>
          );
        }

        if (type instanceof z.ZodEnum) {
          const options = type.options.map((value: string) => ({ value, label: value }));
          return (
            <FormField key={key} htmlFor={fieldId} label={label} required={required}>
              <Select id={fieldId} fullWidth options={options} error={error} {...register(key)} />
            </FormField>
          );
        }

        if (type instanceof z.ZodNumber) {
          return (
            <FormField key={key} htmlFor={fieldId} label={label} required={required}>
              <Input
                id={fieldId}
                type="number"
                fullWidth
                min={type.minValue ?? undefined}
                max={type.maxValue ?? undefined}
                step={type.isInt ? 1 : 'any'}
                error={error}
                {...register(key, { valueAsNumber: true })}
              />
            </FormField>
          );
        }

        if (type instanceof z.ZodString) {
          return (
            <FormField key={key} htmlFor={fieldId} label={label} required={required}>
              <Input id={fieldId} type={type.isURL ? 'url' : 'text'} fullWidth error={error} {...register(key)} />
            </FormField>
          );
        }

        return null;
      })}
    </div>
  );
}
