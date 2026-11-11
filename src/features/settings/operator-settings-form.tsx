'use client';
import { useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, updateDoc } from 'firebase/firestore';
import { currencySchema, e164Schema, operatorFeaturesSchema, type Operator } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { useSession } from '@/features/auth/use-session';
import { toast } from '@/lib/toast';
import { useCollectionExists } from './use-collection-exists';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/forms';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';

export interface OperatorSettingsFormProps {
  operatorId: string;
  operator: Operator;
}

/** Blank -> undefined so an unfilled preset 2-4 number input doesn't fail `.int()`/`.min()`. */
const optionalTipPreset = z.preprocess(
  (v) => (typeof v === 'number' && Number.isNaN(v) ? undefined : v),
  z.number().int().min(0).max(100).optional(),
);

const FEATURE_LABELS: { key: keyof z.infer<typeof operatorFeaturesSchema>; label: string }[] = [
  { key: 'driveHome', label: 'Drive-home' },
  { key: 'passengerRides', label: 'Passenger rides' },
  { key: 'venuePortals', label: 'Venue portals' },
  { key: 'tapToPay', label: 'Tap to pay' },
  { key: 'plateOcr', label: 'Plate OCR' },
  { key: 'payouts', label: 'Payouts' },
];

const settingsFormSchema = z.object({
  name: z.string().min(1, 'Required'),
  timezone: z.string().min(1, 'Required'),
  currency: currencySchema,
  supportPhone: z.union([e164Schema, z.literal('')]),
  supportEmail: z.union([z.string().email(), z.literal('')]),
  receiptFooter: z.string().max(200),
  tipPreset1: z.number().int().min(0).max(100),
  tipPreset2: optionalTipPreset,
  tipPreset3: optionalTipPreset,
  tipPreset4: optionalTipPreset,
  tipPolicy: z.enum(['deliverer', 'shift_pool']),
  platformFeeBps: z.number().int().min(0).max(10_000),
  features: operatorFeaturesSchema,
  requireMfaForAdmins: z.boolean(),
});
// `z.input` (not `z.infer`/`z.output`) for the form's own field-values type: `optionalTipPreset`'s
// `z.preprocess` makes tipPreset2-4's PRE-resolver type `unknown` (preprocess accepts arbitrary raw
// input by design), which is what `zodResolver`'s inferred `Resolver<...>` type actually requires
// for `useForm`'s first generic — `z.output`/`z.infer` (used below for `onSubmit`'s parameter,
// which IS post-resolver) mismatched here and failed to type-check against `zodResolver`'s return
// type. Same pattern as `@hookform/resolvers`' own "Handle Input and Output Types with Zod" docs.
type SettingsFormInput = z.input<typeof settingsFormSchema>;
type SettingsFormValues = z.output<typeof settingsFormSchema>;

function defaultsFrom(operator: Operator): SettingsFormInput {
  const presets = operator.modules.payments.tipPresets;
  return {
    name: operator.name,
    timezone: operator.timezone,
    currency: operator.currency,
    supportPhone: operator.branding.supportPhone ?? '',
    supportEmail: operator.branding.supportEmail ?? '',
    receiptFooter: operator.branding.receiptFooter ?? '',
    tipPreset1: presets[0] ?? 0,
    tipPreset2: presets[1],
    tipPreset3: presets[2],
    tipPreset4: presets[3],
    tipPolicy: operator.modules.payments.tipPolicy,
    platformFeeBps: operator.modules.payments.platformFeeBps,
    features: operator.features,
    requireMfaForAdmins: operator.security.requireMfaForAdmins,
  };
}

/**
 * Currency lock (brief: "currency read-only after first ticket"), implemented honestly rather
 * than skipped: `useCollectionExists` — see that file's header for why an
 * `onSnapshot(collection(...))`-based check (not `query`/`getDocs`/`getCountFromServer`, and
 * capped with `limit(1)`) is safe for `check:guest-bundle`.
 */
export function OperatorSettingsForm({ operatorId, operator }: OperatorSettingsFormProps) {
  const { isPlatformAdmin } = useSession();
  const { exists: currencyLocked } = useCollectionExists(`operators/${operatorId}/tickets`);

  const defaultValues = useMemo(() => defaultsFrom(operator), [operator]);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormInput, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues,
  });

  const onSubmit = async (values: SettingsFormValues) => {
    const tipPresets = [values.tipPreset1, values.tipPreset2, values.tipPreset3, values.tipPreset4].filter(
      (v): v is number => typeof v === 'number',
    );
    const payload: Record<string, unknown> = {
      name: values.name,
      timezone: values.timezone,
      'branding.supportPhone': values.supportPhone,
      'branding.supportEmail': values.supportEmail,
      'branding.receiptFooter': values.receiptFooter,
      'modules.payments.tipPresets': tipPresets,
      'modules.payments.tipPolicy': values.tipPolicy,
      features: values.features,
      'security.requireMfaForAdmins': values.requireMfaForAdmins,
      updatedAt: new Date().toISOString(),
    };
    // currency is left off the pinned-fields list in firestore.rules (only the ID-like fields and
    // 4 modules.payments.* fields are locked), so this is a client-side-only policy, not a rules
    // gate — only send it when it's actually still editable.
    if (!currencyLocked) payload.currency = values.currency;
    // platformFeeBps is pinned client-side in firestore.rules for an owner (only `isPlatformAdmin()`
    // may change it) — never include it for a non-platform-admin submit, even though the field
    // still round-trips through the schema/defaultValues for them (unchanged from the server value).
    if (isPlatformAdmin) payload['modules.payments.platformFeeBps'] = values.platformFeeBps;

    try {
      const { db } = firebase();
      await updateDoc(doc(db, `operators/${operatorId}`), payload);
      toast.success('Settings saved.');
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" fullWidth error={errors.name?.message} {...register('name')} />
            <Input label="Timezone" fullWidth error={errors.timezone?.message} {...register('timezone')} />
            <Input
              label="Currency"
              fullWidth
              disabled={currencyLocked}
              helperText={currencyLocked ? 'Locked after the first ticket.' : undefined}
              error={errors.currency?.message}
              {...register('currency')}
            />
            <Input label="Support phone" fullWidth error={errors.supportPhone?.message} {...register('supportPhone')} />
            <Input label="Support email" fullWidth error={errors.supportEmail?.message} {...register('supportEmail')} />
          </div>

          <Textarea label="Receipt footer" fullWidth error={errors.receiptFooter?.message} {...register('receiptFooter')} />

          <div className="space-y-2">
            <Text size="sm" weight="medium">
              Tip presets
            </Text>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Input
                label="Preset 1"
                type="number"
                fullWidth
                min={0}
                max={100}
                error={errors.tipPreset1?.message}
                {...register('tipPreset1', { valueAsNumber: true })}
              />
              <Input label="Preset 2" type="number" fullWidth min={0} max={100} {...register('tipPreset2', { valueAsNumber: true })} />
              <Input label="Preset 3" type="number" fullWidth min={0} max={100} {...register('tipPreset3', { valueAsNumber: true })} />
              <Input label="Preset 4" type="number" fullWidth min={0} max={100} {...register('tipPreset4', { valueAsNumber: true })} />
            </div>
            <Select
              label="Tip policy"
              fullWidth
              options={[
                { value: 'deliverer', label: 'Goes to the deliverer' },
                { value: 'shift_pool', label: 'Pooled across the shift' },
              ]}
              {...register('tipPolicy')}
            />
          </div>

          {isPlatformAdmin ? (
            <Input
              label="Platform fee (bps)"
              type="number"
              fullWidth
              min={0}
              max={10000}
              helperText="Platform admin only — 100 bps = 1%."
              error={errors.platformFeeBps?.message}
              {...register('platformFeeBps', { valueAsNumber: true })}
            />
          ) : (
            <div>
              <Text size="sm" weight="medium">
                Platform fee
              </Text>
              <Text size="xs" color="tertiary">
                {(operator.modules.payments.platformFeeBps / 100).toFixed(2)}% — set by the Goldstar platform team.
              </Text>
            </div>
          )}

          <div className="space-y-2">
            <Text size="sm" weight="medium">
              Feature toggles
            </Text>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FEATURE_LABELS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <Controller
                    name={`features.${key}`}
                    control={control}
                    render={({ field }) => (
                      <Checkbox
                        id={`feature-${key}`}
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                        aria-label={label}
                      />
                    )}
                  />
                  <label htmlFor={`feature-${key}`} className="cursor-pointer text-body-sm text-text-primary">
                    {label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Controller
              name="requireMfaForAdmins"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="require-mfa-for-admins"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  aria-label="Require MFA for admins"
                />
              )}
            />
            <label htmlFor="require-mfa-for-admins" className="cursor-pointer text-body-sm text-text-primary">
              Require MFA for admins
            </label>
          </div>

          <Button type="submit" loading={isSubmitting}>
            Save settings
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
