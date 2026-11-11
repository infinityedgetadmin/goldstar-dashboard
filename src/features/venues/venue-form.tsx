'use client';
import { useRouter } from 'next/navigation';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, deleteField, setDoc, updateDoc } from 'firebase/firestore';
import { venueSchema, VENUE_TYPES, uuidv7, type Venue } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import { stripUndefinedDeep } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/forms/FormField';
import { Input } from '@/components/ui/forms/Input';
import { Select } from '@/components/ui/forms/Select';
import { Textarea } from '@/components/ui/forms/Textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { ZonesEditor } from './zones-editor';
import { RatesEditor } from './rates-editor';
import { SmsTemplatesEditor } from './sms-templates-editor';

export interface VenueFormProps {
  operatorId: string;
  /** The operator's currency (`Operator.currency`) — threaded through to `RatesEditor`'s live
   * example formatting only; not itself a venue field. */
  currency: string;
  /** Omit to create a new venue; pass the existing doc to edit one. */
  venue?: Venue;
}

/**
 * `VenueForm` = `venueSchema.omit({ createdAt: true, updatedAt: true })`, per task-5-brief.md,
 * extended with two preprocessing steps (disclosed deviation, task-5-report.md): `phone` and
 * `timezone` are both `.optional()` in the real schema, but a plain, never-cleared `<input>` submits
 * `''` rather than `undefined` for an untouched-then-cleared field — `e164Schema`/`.min(1)` would
 * then reject the empty string as an invalid PHONE/timezone rather than treating it as "not set".
 * Same fix, same reasoning as this codebase's own `operator-settings-form.tsx` (`supportPhone`'s
 * `z.union([e164Schema, z.literal('')])`) — done here via `z.preprocess` instead so the field stays
 * the schema's real optional type rather than a widened union.
 *
 * `id`/`operatorId`/`qr` are part of the validated shape but have NO rendered control: `id` is
 * minted once (uuidv7) and never user-editable (changing it would silently orphan the Firestore doc,
 * not rename it); `operatorId` comes from the signed-in session; `qr.staticCheckoutEnabled` /
 * `staticCheckoutToken` are owned entirely by `StaticQrPanel` (a separate, direct `updateDoc` — see
 * that file) and `onVenueWritten` (token minting) — this form only ever carries the venue's CURRENT
 * `qr` value through untouched on edit (via `updateDoc`, which never even sends the key — see
 * `onSubmit`) and seeds the create-time default `{ staticCheckoutEnabled: false }` so a brand new
 * venue never starts with static checkout already on.
 *
 * PMS (Opera Cloud) / POS (Toast) config: plain identifiers on `venueSchema` itself (`hotelId`,
 * `chargeCode`, `restaurantGuid`, ...), NOT secrets — real provider API credentials go through
 * `integrationsSetSecret` separately, and that callable currently rejects venue-scoped secrets
 * outright (`functions/src/modules/integrations/setSecret.ts`: "venue-scoped integrations are not
 * supported yet"). Wiring venue-scoped secret storage is out of this task's scope; these fields are
 * just the non-secret config half, toggled on/off per provider.
 */
const formSchema = venueSchema.omit({ createdAt: true, updatedAt: true }).extend({
  phone: z.preprocess((v) => (v === '' ? undefined : v), venueSchema.shape.phone),
  timezone: z.preprocess((v) => (v === '' ? undefined : v), venueSchema.shape.timezone),
});
// `z.input` (not `z.infer`/`z.output`) for the form's own field-values type, `z.output` for
// `onSubmit`'s parameter — same split, same reason as `operator-settings-form.tsx`'s own comment:
// `z.preprocess`'s PRE-resolver type is `unknown` (by design — it accepts arbitrary raw input),
// which is what `zodResolver`'s inferred `Resolver<...>` actually requires for `useForm`'s first
// generic; `z.output` (post-resolver) is what a valid, submitted `onSubmit` payload looks like.
type VenueFormInput = z.input<typeof formSchema>;
type VenueFormValues = z.output<typeof formSchema>;

const TYPE_OPTIONS = VENUE_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }));
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
const CONTRACT_MODEL_OPTIONS = [
  { value: 'per_ticket', label: 'Per ticket' },
  { value: 'flat', label: 'Flat' },
  { value: 'rev_share', label: 'Revenue share' },
];
const NO_POST_OPTIONS = [
  { value: 'block', label: 'Block checkout' },
  { value: 'fallback_card', label: 'Fall back to card' },
];

function defaultRates(): Venue['rates'] {
  return {
    valet: { model: 'flat', items: [{ id: uuidv7(), label: 'Valet', amount: 1500 }], taxRateBps: 700, fees: [] },
    driveHome: { base: 2500, perMile: 250, perMinute: 50, minimum: 3900 },
    passengerRide: { base: 1000, perMile: 200, perMinute: 40, minimum: 1500 },
    validations: { allowPartial: true, maxAmount: 1500 },
  };
}

function defaultsFrom(operatorId: string, venue?: Venue): VenueFormInput {
  return {
    id: venue?.id ?? uuidv7(),
    operatorId,
    name: venue?.name ?? '',
    type: venue?.type ?? 'restaurant',
    status: venue?.status ?? 'active',
    address: venue?.address ?? { line1: '', city: '', region: '', postalCode: '', country: 'US' },
    geo: venue?.geo ?? { lat: 0, lng: 0 },
    phone: venue?.phone,
    zones: venue?.zones ?? [],
    rates: venue?.rates ?? defaultRates(),
    sms: venue?.sms ?? {},
    qr: venue?.qr ?? { staticCheckoutEnabled: false },
    contract: venue?.contract ?? { model: 'per_ticket', terms: '', billingEmail: '', invoiceDay: 1 },
    timezone: venue?.timezone,
    pms: venue?.pms,
    pos: venue?.pos,
  };
}

/**
 * Fix round 2 (task-5-review.md, new Major): `stripUndefinedDeep` alone makes clearing a
 * previously-set field on EDIT a silent no-op. `updateDoc`'s field mask only covers the keys
 * actually present in the payload — an OMITTED key means "leave this field unchanged", not "clear
 * it". So a venue with an existing `phone`, edited to blank that field and save, would have `phone`
 * stripped out of the payload entirely (it's `undefined`), `updateDoc` would touch every other field
 * and simply never mention `phone`, Firestore leaves the old value in place, and the toast still says
 * "Venue saved." — the operator has no way to know the clear didn't take.
 *
 * Only relevant on the EDIT path — a brand-new doc (`setDoc`) has no prior value to preserve, so
 * `stripUndefinedDeep` alone (an absent key = "this venue never had one") is already correct there,
 * and this function is never called for create.
 *
 * `rest`'s (not `stripped`'s) keys are the full candidate set — every top-level field this form
 * manages, whether or not this particular submission cleared it. For each one NOT surviving the
 * strip (i.e. it resolved to `undefined` this submission), check the PRE-EDIT `venue` prop: if it
 * had a real value there, this is an intentional clear -> send Firestore's `deleteField()` sentinel
 * instead of omitting the key. If `venue` never had a value for it either, leave it omitted — sending
 * `deleteField()` for a field that was never set would be pure no-op noise ("deleteField spam").
 *
 * Deliberately top-level only, matching what actually needs it: `zones`/`rates`/`sms` are always
 * sent as complete replacement values for their own top-level key (never themselves `undefined`), so
 * `updateDoc` replaces the WHOLE array/object wholesale — a cleared leaf inside one of them (a zone's
 * `capacity`, a tiered rate's `upToMinutes`, an SMS override reverted to blank) is already handled
 * correctly by `stripUndefinedDeep` alone, since the containing key's own new value is what's being
 * written, not merged key-by-key against the old one.
 */
function withClearedFieldsDeleted(stripped: Record<string, unknown>, rest: Record<string, unknown>, priorVenue: Venue): Record<string, unknown> {
  const payload = { ...stripped };
  for (const key of Object.keys(rest)) {
    if (Object.hasOwn(stripped, key)) continue; // still has a real value in this submission
    if ((priorVenue as unknown as Record<string, unknown>)[key] !== undefined) {
      payload[key] = deleteField();
    }
  }
  return payload;
}

export function VenueForm({ operatorId, currency, venue }: VenueFormProps) {
  const router = useRouter();
  const isEdit = !!venue;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<VenueFormInput, unknown, VenueFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFrom(operatorId, venue),
  });

  // `useWatch` rather than `watch()`: the latter is flagged by the React Compiler as an
  // incompatible library call and silently opts this whole component out of compilation.
  const contractModel = useWatch({ control, name: 'contract.model' });

  const onSubmit = async (values: VenueFormValues) => {
    const { db } = firebase();
    const ref = doc(db, `operators/${operatorId}/venues/${values.id}`);
    const now = new Date().toISOString();
    try {
      if (!venue) {
        // stripUndefinedDeep (task-5-review.md Critical #1): `values` can carry own keys set to
        // literal `undefined` (phone/timezone when cleared, pms/pos when toggled off, and any
        // nested optional leaf the zones/rates/sms editors cleared the same way) — real Firestore
        // rejects those with "Unsupported field value: undefined"; only the mocked SDK in tests let
        // this through silently. Strip right here, at the write boundary, rather than globally.
        // No `withClearedFieldsDeleted` needed here — a brand-new doc has no prior value for
        // `deleteField()` to preserve; an absent key on create just means "never had one".
        await setDoc(ref, stripUndefinedDeep({ ...values, createdAt: now, updatedAt: now }));
        toast.success('Venue created.');
        router.push(`/venues/${values.id}`);
        return;
      }
      // `qr` is deliberately excluded from the update payload — StaticQrPanel is the only writer of
      // qr.staticCheckoutEnabled/staticCheckoutToken; updateDoc's merge semantics mean simply never
      // sending the key leaves whatever it currently holds untouched, with no risk of this form's
      // (possibly stale, since the token is minted server-side after this form last loaded)
      // in-memory `qr` value clobbering it.
      const { qr: _qr, id: _id, operatorId: _operatorId, ...rest } = values;
      const stripped = stripUndefinedDeep({ ...rest, updatedAt: now }) as Record<string, unknown>;
      await updateDoc(ref, withClearedFieldsDeleted(stripped, rest, venue));
      toast.success('Venue saved.');
    } catch (e) {
      toast.error(e);
    }
  };

  // noValidate: without it, jsdom (and real browsers) run native HTML5 constraint validation on
  // `type="email"` inputs BEFORE the submit event ever reaches React — an invalid-format value
  // silently blocks the click from ever calling `handleSubmit`, bypassing zod entirely and leaving
  // no error state for this form's own error UI to show. zod is the single source of validation
  // truth here; native browser validation would only add a second, differently-worded, un-styled
  // message on top of it.
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Name" fullWidth error={errors.name?.message} {...register('name')} />
            <Input label="Phone" fullWidth placeholder="+13175550100" error={errors.phone?.message} {...register('phone')} />
            <FormField htmlFor="venue-type" label="Type">
              <Select id="venue-type" fullWidth options={TYPE_OPTIONS} {...register('type')} />
            </FormField>
            <FormField htmlFor="venue-status" label="Status">
              <Select id="venue-status" fullWidth options={STATUS_OPTIONS} {...register('status')} />
            </FormField>
            <Input label="Timezone" fullWidth placeholder="America/Indiana/Indianapolis" error={errors.timezone?.message} {...register('timezone')} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Input label="Address line 1" fullWidth error={errors.address?.line1?.message} {...register('address.line1')} />
          <Input label="Address line 2" fullWidth {...register('address.line2')} />
          <Input label="City" fullWidth error={errors.address?.city?.message} {...register('address.city')} />
          <Input label="State / region" fullWidth error={errors.address?.region?.message} {...register('address.region')} />
          <Input label="Postal code" fullWidth error={errors.address?.postalCode?.message} {...register('address.postalCode')} />
          <Input label="Country" fullWidth maxLength={2} error={errors.address?.country?.message} {...register('address.country')} />
          <Input label="Latitude" type="number" step="any" fullWidth error={errors.geo?.lat?.message} {...register('geo.lat', { valueAsNumber: true })} />
          <Input label="Longitude" type="number" step="any" fullWidth error={errors.geo?.lng?.message} {...register('geo.lng', { valueAsNumber: true })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zones</CardTitle>
        </CardHeader>
        <CardContent>
          <Controller name="zones" control={control} render={({ field }) => <ZonesEditor value={field.value} onChange={field.onChange} />} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rates</CardTitle>
        </CardHeader>
        <CardContent>
          <Controller name="rates" control={control} render={({ field }) => <RatesEditor value={field.value} onChange={field.onChange} currency={currency} />} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SMS templates</CardTitle>
        </CardHeader>
        <CardContent>
          <Controller
            name="sms"
            control={control}
            render={({ field }) => <SmsTemplatesEditor value={field.value} onChange={field.onChange} errors={errors.sms} />}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contract</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor="contract-model" label="Billing model">
            <Select
              id="contract-model"
              fullWidth
              options={CONTRACT_MODEL_OPTIONS}
              {...register('contract.model', {
                onChange: () => {
                  // Foreign figures are rejected by the schema, so they must not survive a model
                  // change. `undefined` (not 0) — the new model's own figure is then blank and
                  // required, which is the state the operator should be asked to resolve.
                  setValue('contract.perTicketFee', undefined);
                  setValue('contract.flatMonthly', undefined);
                  setValue('contract.revShareBps', undefined);
                },
              })}
            />
          </FormField>
          <Input
            label="Invoice day of month"
            type="number"
            min={1}
            max={28}
            fullWidth
            error={errors.contract?.invoiceDay?.message}
            {...register('contract.invoiceDay', { valueAsNumber: true })}
          />
          {/*
            The active model's FIGURE, required by `venueSchema.contract`'s superRefine (contracts
            v0.4.6): `per_ticket` needs `perTicketFee`, `flat` needs `flatMonthly`, `rev_share`
            needs `revShareBps` — and a foreign figure is REJECTED, not ignored, because "a flat
            contract carrying a stray revShareBps is how a venue gets billed on a rule nobody
            chose" (that schema's own words). Before this the form rendered no figure input at all,
            so under v0.4.6 no venue could be saved: the refinement failed on every submit.

            NOT DEFAULTED. A blank is an error the operator resolves, never a number this form
            picks — a defaulted 0 here is a venue invoiced for nothing, which is precisely the
            silent money default the schema was tightened to prevent.

            Switching model CLEARS the other two, because leaving a stale figure behind turns the
            rejection into a validation error the operator cannot see the cause of.
          */}
          {contractModel === 'per_ticket' && (
            <Input
              label="Fee per ticket (cents)"
              type="number"
              min={0}
              fullWidth
              error={errors.contract?.perTicketFee?.message}
              {...register('contract.perTicketFee', { valueAsNumber: true })}
            />
          )}
          {contractModel === 'flat' && (
            <Input
              label="Monthly fee (cents)"
              type="number"
              min={0}
              fullWidth
              error={errors.contract?.flatMonthly?.message}
              {...register('contract.flatMonthly', { valueAsNumber: true })}
            />
          )}
          {contractModel === 'rev_share' && (
            <Input
              label="Revenue share (basis points)"
              type="number"
              min={0}
              max={10000}
              fullWidth
              error={errors.contract?.revShareBps?.message}
              {...register('contract.revShareBps', { valueAsNumber: true })}
            />
          )}
          <Input label="Billing email" type="email" fullWidth error={errors.contract?.billingEmail?.message} {...register('contract.billingEmail')} />
          <Textarea label="Contract terms" fullWidth wrapperClassName="sm:col-span-2" {...register('contract.terms')} />
          {/*
            Fallback for a contract-LEVEL error. Every issue `venueSchema.contract`'s superRefine
            emits now names its field (contracts v0.4.8), so the figure inputs above show their own
            errors — but under v0.4.6 the issues were pathless, landed on the contract object, and
            this form rendered nothing while rejecting every submit. Should any future cross-field
            issue arrive without a path, it lands here instead of nowhere.
          */}
          {(errors.contract?.root?.message ?? errors.contract?.message) && (
            <p className="mt-1.5 text-body-sm text-error-600 sm:col-span-2" role="alert">
              {errors.contract?.root?.message ?? errors.contract?.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PMS integration — Opera Cloud</CardTitle>
        </CardHeader>
        <CardContent>
          <Controller
            name="pms"
            control={control}
            render={({ field }) => {
              const enabled = field.value !== undefined;
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="pms-enabled"
                      checked={enabled}
                      onCheckedChange={(checked) =>
                        field.onChange(checked === true ? { provider: 'opera_cloud' as const, hotelId: '', noPostBehavior: 'block' as const, chargeCode: '' } : undefined)
                      }
                      aria-label="Enable PMS integration"
                    />
                    <label htmlFor="pms-enabled" className="cursor-pointer text-body-sm text-text-primary">
                      Enable Opera Cloud PMS
                    </label>
                  </div>
                  {enabled && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input label="Hotel ID" fullWidth value={field.value?.hotelId ?? ''} onChange={(e) => field.onChange({ ...field.value, hotelId: e.target.value })} />
                      <FormField htmlFor="pms-no-post" label="No-post fallback">
                        <Select
                          id="pms-no-post"
                          fullWidth
                          options={NO_POST_OPTIONS}
                          value={field.value?.noPostBehavior ?? 'block'}
                          onChange={(e) => field.onChange({ ...field.value, noPostBehavior: e.target.value as 'block' | 'fallback_card' })}
                        />
                      </FormField>
                      <Input label="Charge code" fullWidth value={field.value?.chargeCode ?? ''} onChange={(e) => field.onChange({ ...field.value, chargeCode: e.target.value })} />
                    </div>
                  )}
                </div>
              );
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>POS integration — Toast</CardTitle>
        </CardHeader>
        <CardContent>
          <Controller
            name="pos"
            control={control}
            render={({ field }) => {
              const enabled = field.value !== undefined;
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="pos-enabled"
                      checked={enabled}
                      onCheckedChange={(checked) => field.onChange(checked === true ? { provider: 'toast' as const, restaurantGuid: '' } : undefined)}
                      aria-label="Enable POS integration"
                    />
                    <label htmlFor="pos-enabled" className="cursor-pointer text-body-sm text-text-primary">
                      Enable Toast POS
                    </label>
                  </div>
                  {enabled && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input
                        label="Restaurant GUID"
                        fullWidth
                        value={field.value?.restaurantGuid ?? ''}
                        onChange={(e) => field.onChange({ ...field.value, restaurantGuid: e.target.value })}
                      />
                      <Input
                        label="Validation discount GUID"
                        fullWidth
                        value={field.value?.validationDiscountGuid ?? ''}
                        onChange={(e) => field.onChange({ ...field.value, validationDiscountGuid: e.target.value || undefined })}
                      />
                      <Input
                        label="Valet item GUID"
                        fullWidth
                        value={field.value?.valetItemGuid ?? ''}
                        onChange={(e) => field.onChange({ ...field.value, valetItemGuid: e.target.value || undefined })}
                      />
                    </div>
                  )}
                </div>
              );
            }}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={isSubmitting}>
          {isEdit ? 'Save venue' : 'Create venue'}
        </Button>
        {Object.keys(errors).length > 0 && (
          <Text size="sm" color="error">
            Fix the highlighted fields before saving.
          </Text>
        )}
      </div>
    </form>
  );
}
