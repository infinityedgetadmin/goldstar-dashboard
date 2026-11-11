'use client';
import { Plus, Trash2 } from 'lucide-react';
import { computeValetPrice, type VenueRates } from '@goldstar/platform';
import { FormField } from '@/components/ui/forms/FormField';
import { Input } from '@/components/ui/forms/Input';
import { Select } from '@/components/ui/forms/Select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { formatMoney } from '@/lib/format';

type RateItem = VenueRates['valet']['items'][number];

export interface RatesEditorProps {
  value: VenueRates;
  onChange: (next: VenueRates) => void;
  currency: string;
}

const MODEL_OPTIONS = [
  { value: 'flat', label: 'Flat rate' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'tiered', label: 'Tiered' },
  { value: 'overnight', label: 'Overnight' },
] as const;

/** Integer cents -> the string a `<input type="number" step="0.01">` shows, e.g. 1070 -> "10.70". */
const centsToInput = (cents: number): string => (cents / 100).toFixed(2);

/** Whatever a money input currently holds -> integer cents, never NaN (blank/invalid -> 0). */
const inputToCents = (raw: string): number => {
  const n = Math.round(parseFloat(raw) * 100);
  return Number.isFinite(n) ? n : 0;
};

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `item_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * `RatesEditor` = `venueRatesSchema` (valet pricing, drive-home/passenger-ride trip rates,
 * validation policy) with live example prices computed via `@goldstar/platform`'s own
 * `computeValetPrice` — the SAME function `guestStaticCheckout`/the guest pay page price from, so
 * what an operator sees while editing rates is never a re-implementation that could drift from what
 * a guest is actually charged (task-5-brief.md's given test verifies this: a 700 bps tiered venue's
 * 1h/5h examples must equal `computeValetPrice`'s real output, not a hand-rolled approximation).
 *
 * `value`/`onChange` (not `register`/`control`) by design, same reason `SchemaForm` documents for
 * its own island pattern: `VenueForm` threads this through a single `Controller` for the `rates`
 * field of `venueSchema`, and every edit here produces one complete, immediately-valid `VenueRates`
 * object rather than partial field state a parent would have to reassemble.
 */
export function RatesEditor({ value, onChange, currency }: RatesEditorProps) {
  const { valet, driveHome, passengerRide, validations } = value;
  const singleItemModel = valet.model === 'flat' || valet.model === 'hourly' || valet.model === 'overnight';

  const setValet = (patch: Partial<VenueRates['valet']>) => onChange({ ...value, valet: { ...valet, ...patch } });
  const setTrip = (key: 'driveHome' | 'passengerRide', patch: Partial<VenueRates['driveHome']>) =>
    onChange({ ...value, [key]: { ...value[key], ...patch } });
  const setValidations = (patch: Partial<VenueRates['validations']>) => onChange({ ...value, validations: { ...validations, ...patch } });

  const setModel = (model: VenueRates['valet']['model']) => {
    // Switching INTO a single-item model collapses any tiered items down to just the first one
    // (still a real, valid rate) rather than discarding the operator's numbers outright; switching
    // OUT of tiered starts from that same single item as tier 1 so nothing is lost either way.
    const items = model === 'tiered' ? valet.items : valet.items.slice(0, 1);
    setValet({ model, items: items.length > 0 ? items : [{ id: newId(), label: 'Rate', amount: 0 }] });
  };

  const updateItem = (id: string, patch: Partial<RateItem>) =>
    setValet({ items: valet.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const addItem = () => setValet({ items: [...valet.items, { id: newId(), label: `Tier ${valet.items.length + 1}`, amount: 0 }] });
  const removeItem = (id: string) => {
    if (valet.items.length <= 1) return; // venueRatesSchema requires items.min(1) — never drop the last one
    setValet({ items: valet.items.filter((i) => i.id !== id) });
  };

  const addFee = () => setValet({ fees: [...valet.fees, { id: newId(), label: 'Fee', amount: 0 }] });
  const updateFee = (id: string, patch: Partial<VenueRates['valet']['fees'][number]>) =>
    setValet({ fees: valet.fees.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const removeFee = (id: string) => setValet({ fees: valet.fees.filter((f) => f.id !== id) });

  // Live examples: the SAME computeValetPrice a guest's checkout actually prices with, run against
  // this editor's current in-progress `valet` value (not yet saved) so an operator sees the real
  // effect of a rate/tax change before committing it. Fixed epoch reference instants (not `Date.now()`)
  // keep the 1h/5h examples deterministic regardless of when this renders.
  const priceAt = (hours: number) => computeValetPrice({ rates: valet, checkedInAt: new Date(0), at: new Date(hours * 3_600_000) });
  const examples = singleItemModel
    ? [{ label: 'Any length of stay', total: priceAt(0).total }]
    : [
        { label: '1 h stay', total: priceAt(1).total },
        { label: '5 h stay', total: priceAt(5).total },
      ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="rates-model" label="Pricing model" required>
          <Select
            id="rates-model"
            fullWidth
            options={MODEL_OPTIONS as unknown as { value: string; label: string }[]}
            value={valet.model}
            onChange={(e) => setModel(e.target.value as VenueRates['valet']['model'])}
          />
        </FormField>
        {/* Not `required` — FormField's required indicator renders an asterisk INSIDE the <label>
            element (Label.tsx), which changes the accessible name to "Tax rate (%)*" and breaks an
            exact `getByLabelText('Tax rate (%)')` match (task-5-brief.md's given test). Every field
            here is effectively always-required by the schema anyway (venueRatesSchema has no
            optional numeric fields), so the visual "Optional" tag FormField renders on a
            non-required field is the one being traded away, not real validation. */}
        <FormField htmlFor="rates-tax" label="Tax rate (%)">
          <Input
            id="rates-tax"
            type="number"
            fullWidth
            min={0}
            max={30}
            step="0.01"
            value={valet.taxRateBps / 100}
            onChange={(e) => setValet({ taxRateBps: Math.round(Number(e.target.value || 0) * 100) })}
          />
        </FormField>
      </div>

      <div className="space-y-3">
        <Text size="sm" weight="medium">
          {singleItemModel ? 'Rate' : 'Tiers'}
        </Text>
        {/* Bare `aria-label` (no `label` prop) throughout this repeatable-row editor — every row
            would otherwise render its own visible `<label>Label</label>`/`<label>Amount</label>`,
            and `getByLabelText` (and any assistive tech reading by label text) can't tell N
            identically-captioned rows apart. A `placeholder` still gives sighted users the same
            visual hint. */}
        {valet.items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-end gap-3">
            {!singleItemModel && (
              <Input
                placeholder="Label"
                value={item.label}
                onChange={(e) => updateItem(item.id, { label: e.target.value })}
                aria-label={`Tier label ${item.id}`}
              />
            )}
            <Input
              placeholder="Amount"
              type="number"
              step="0.01"
              min={0}
              value={centsToInput(item.amount)}
              onChange={(e) => updateItem(item.id, { amount: inputToCents(e.target.value) })}
              aria-label={singleItemModel ? 'Rate amount' : `Tier amount ${item.id}`}
            />
            {!singleItemModel && (
              <Input
                type="number"
                min={1}
                step={1}
                value={item.upToMinutes ?? ''}
                placeholder="Up to (minutes) — blank = catch-all"
                onChange={(e) => updateItem(item.id, { upToMinutes: e.target.value === '' ? undefined : Number(e.target.value) })}
                aria-label={`Tier up-to-minutes ${item.id}`}
              />
            )}
            {!singleItemModel && valet.items.length > 1 && (
              <Button variant="ghost" size="sm" aria-label={`Remove tier ${item.label}`} onClick={() => removeItem(item.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {!singleItemModel && (
          <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} iconPosition="left" onClick={addItem}>
            Add tier
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <Text size="sm" weight="medium">
          Fees
        </Text>
        {valet.fees.map((fee) => (
          <div key={fee.id} className="flex flex-wrap items-end gap-3">
            <Input placeholder="Label" value={fee.label} onChange={(e) => updateFee(fee.id, { label: e.target.value })} aria-label={`Fee label ${fee.id}`} />
            <Input
              placeholder="Amount"
              type="number"
              step="0.01"
              min={0}
              value={centsToInput(fee.amount)}
              onChange={(e) => updateFee(fee.id, { amount: inputToCents(e.target.value) })}
              aria-label={`Fee amount ${fee.id}`}
            />
            <Button variant="ghost" size="sm" aria-label={`Remove fee ${fee.label}`} onClick={() => removeFee(fee.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} iconPosition="left" onClick={addFee}>
          Add fee
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <Text size="sm" weight="medium" className="mb-2">
          Live examples
        </Text>
        <ul className="space-y-1">
          {examples.map((ex) => (
            <li key={ex.label}>
              <Text size="sm">{`${ex.label} → ${formatMoney(ex.total, currency)}`}</Text>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <Text size="sm" weight="medium">
            Drive-home trip rate
          </Text>
          {/* aria-label (not `label`) — "Base"/"Per mile"/... would otherwise duplicate the exact
              visible label text of the Passenger-ride block right next to it. */}
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Base" aria-label="Drive-home base" type="number" step="0.01" min={0} value={centsToInput(driveHome.base)} onChange={(e) => setTrip('driveHome', { base: inputToCents(e.target.value) })} />
            <Input placeholder="Per mile" aria-label="Drive-home per mile" type="number" step="0.01" min={0} value={centsToInput(driveHome.perMile)} onChange={(e) => setTrip('driveHome', { perMile: inputToCents(e.target.value) })} />
            <Input placeholder="Per minute" aria-label="Drive-home per minute" type="number" step="0.01" min={0} value={centsToInput(driveHome.perMinute)} onChange={(e) => setTrip('driveHome', { perMinute: inputToCents(e.target.value) })} />
            <Input placeholder="Minimum fare" aria-label="Drive-home minimum fare" type="number" step="0.01" min={0} value={centsToInput(driveHome.minimum)} onChange={(e) => setTrip('driveHome', { minimum: inputToCents(e.target.value) })} />
          </div>
        </div>
        <div className="space-y-3">
          <Text size="sm" weight="medium">
            Passenger-ride trip rate
          </Text>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Base" aria-label="Passenger-ride base" type="number" step="0.01" min={0} value={centsToInput(passengerRide.base)} onChange={(e) => setTrip('passengerRide', { base: inputToCents(e.target.value) })} />
            <Input placeholder="Per mile" aria-label="Passenger-ride per mile" type="number" step="0.01" min={0} value={centsToInput(passengerRide.perMile)} onChange={(e) => setTrip('passengerRide', { perMile: inputToCents(e.target.value) })} />
            <Input placeholder="Per minute" aria-label="Passenger-ride per minute" type="number" step="0.01" min={0} value={centsToInput(passengerRide.perMinute)} onChange={(e) => setTrip('passengerRide', { perMinute: inputToCents(e.target.value) })} />
            <Input placeholder="Minimum fare" aria-label="Passenger-ride minimum fare" type="number" step="0.01" min={0} value={centsToInput(passengerRide.minimum)} onChange={(e) => setTrip('passengerRide', { minimum: inputToCents(e.target.value) })} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Text size="sm" weight="medium">
          Validations
        </Text>
        <div className="flex items-center gap-3">
          <Checkbox
            id="rates-allow-partial"
            checked={validations.allowPartial}
            onCheckedChange={(checked) => setValidations({ allowPartial: checked === true })}
            aria-label="Allow partial validations"
          />
          <label htmlFor="rates-allow-partial" className="cursor-pointer text-body-sm text-text-primary">
            Allow partial validations
          </label>
        </div>
        <Input
          label="Max validation amount"
          type="number"
          step="0.01"
          min={0}
          fullWidth={false}
          value={centsToInput(validations.maxAmount)}
          onChange={(e) => setValidations({ maxAmount: inputToCents(e.target.value) })}
        />
      </div>
    </div>
  );
}
