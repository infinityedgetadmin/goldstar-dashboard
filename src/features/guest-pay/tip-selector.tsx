'use client';

import { useState } from 'react';
import { computeTip, type TipChoice } from '@goldstar/platform';
import { formatMoney } from '@/lib/public/format';
import { Text } from '@/components/ui/typography';

export interface TipSelectorProps {
  /** Tax-inclusive total, in cents. */
  subtotal: number;
  presets: number[];
  value: TipChoice;
  onChange: (choice: TipChoice) => void;
  currency?: string;
}

/**
 * Ruling G-3: the default tip must land on a percent that's actually a
 * member of the operator's `tipPresets` — `computeTip` silently returns 0
 * for a preset percent that isn't in the list (verified against the
 * installed `@goldstar/platform` implementation), so a hardcoded `?? 20`
 * fallback (the brief's own given pseudocode) produces an unlabeled,
 * unexplained $0 default — no chip shows selected — for any single-preset
 * operator whose one preset isn't 20. `tipPresets` is schema-enforced
 * `min(1).max(4)` in normal operation, but the guest projection's shape is
 * a loose `z.ZodArray<z.ZodNumber>` with no runtime length guard on this
 * client, so an empty array is defended against too — falls back to "no
 * tip" rather than indexing into nothing.
 *
 * Extracted here (Plan 3 T5) from pay-sheet.tsx, its original home, so
 * static-checkout-view.tsx can share the exact same default-tip rule
 * instead of duplicating it — both need it before the guest has any
 * server-priced `payment` object to key off, since a static-checkout guest
 * has no pre-existing ticket at all until the checkout callable runs.
 */
export function defaultTip(tipPresets: number[]): TipChoice {
  if (tipPresets.length === 0) return { kind: 'none' };
  return { kind: 'preset', percent: tipPresets[1] ?? tipPresets[0] };
}

/**
 * Web port of goldstar-mobile's `src/components/ui/tip-selector.tsx` — same
 * API (subtotal/presets/value/onChange/currency), same chip set and order
 * (No tip, each preset with its own computed amount, Custom tip), and the
 * same accessible names ("No tip", "Tip {n}%", "Custom tip", "Custom tip
 * amount" on the numeric input). `aria-pressed` toggle buttons stand in for
 * React Native's `accessibilityState={{ selected }}` — the task brief
 * allows either that or a `radiogroup`, and plain toggle buttons need no
 * extra roving-tabindex/arrow-key handling to already be correctly
 * keyboard accessible, unlike a true `radiogroup`.
 */
export function TipSelector({ subtotal, presets, value, onChange, currency = 'USD' }: TipSelectorProps) {
  const [customActive, setCustomActive] = useState(value.kind === 'custom');

  const choosePreset = (percent: number) => {
    setCustomActive(false);
    onChange({ kind: 'preset', percent });
  };

  const chooseNone = () => {
    setCustomActive(false);
    onChange({ kind: 'none' });
  };

  /**
   * Ruling AK: opening "Custom tip" SEEDS the custom amount with whatever is
   * currently selected, rather than only flipping the local toggle.
   *
   * Two sources of truth for one mutually-exclusive choice is what made this a
   * money bug and not a cosmetic one: the preset chips derive `selected` from
   * the `value` prop, the Custom chip from local `customActive`. Without the
   * seeding commit, clicking a preset and then Custom leaves BOTH chips
   * rendering selected and `aria-pressed="true"`, the custom field opens empty,
   * and paying without typing charges the preset. The guest is looking at a
   * highlighted "Custom tip" over an empty box while being charged something
   * else — shown one thing, charged another. `defaultTip` above pre-selects a
   * preset, so a guest reaches that state on their FIRST click.
   *
   * Seeded with the current tip, not zero. Committing `amount: 0` on open would
   * also fix the display, but by silently zeroing a tip the guest never chose to
   * remove — a real reduction in staff income introduced by a bug fix.
   *
   * The `value.kind !== 'custom'` guard is load-bearing: re-tapping "Custom tip"
   * while already custom would otherwise overwrite the amount the guest just
   * typed with a recomputed one.
   */
  const openCustom = () => {
    if (value.kind !== 'custom') {
      const seeded = computeTip({ subtotal, choice: value, presets });
      onChange({ kind: 'custom', amount: Math.min(Math.max(0, seeded), subtotal) });
    }
    setCustomActive(true);
  };

  const handleCustomChangeText = (text: string) => {
    // Guests think in dollars, not cents — accept a dollars-and-cents
    // string like "16.05" (strip anything but digits and a decimal
    // point), convert to integer cents, then clamp at the subtotal.
    // Mirrors goldstar-mobile's tip-selector.tsx handleCustomChangeText.
    const dollars = Number(text.replace(/[^0-9.]/g, ''));
    const cents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
    onChange({ kind: 'custom', amount: Math.min(Math.max(0, cents), subtotal) });
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Chip label="No tip" selected={value.kind === 'none'} onClick={chooseNone} />
        {presets.map((percent) => {
          const selected = value.kind === 'preset' && value.percent === percent;
          return (
            <Chip key={percent} label={`Tip ${percent}%`} selected={selected} onClick={() => choosePreset(percent)}>
              <Text weight="semibold" color={selected ? 'inverse' : 'primary'}>
                {percent}%
              </Text>
              <Text size="sm" color={selected ? 'inverse' : 'secondary'}>
                {formatMoney(computeTip({ subtotal, choice: { kind: 'preset', percent }, presets }), currency)}
              </Text>
            </Chip>
          );
        })}
        <Chip label="Custom tip" selected={customActive} onClick={openCustom} />
      </div>
      {customActive ? (
        <div className="flex min-h-11 items-center gap-2 rounded-lg border-2 border-border bg-white px-4 py-3">
          <Text color="secondary">Custom tip ($)</Text>
          <input
            aria-label="Custom tip amount"
            inputMode="decimal"
            defaultValue={value.kind === 'custom' ? (value.amount / 100).toFixed(2) : ''}
            onChange={(event) => handleCustomChangeText(event.target.value)}
            className="min-h-11 flex-1 bg-transparent text-right font-sans text-body-md text-text-primary outline-none"
          />
        </div>
      ) : null}
    </div>
  );
}

function Chip({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-11 items-center justify-center gap-0.5 rounded-full border-2 px-4 py-2 ${
        selected ? 'border-primary-500 bg-primary-500' : 'border-border bg-white'
      }`}
    >
      {children ?? (
        <Text weight="semibold" color={selected ? 'inverse' : 'primary'}>
          {label}
        </Text>
      )}
    </button>
  );
}
