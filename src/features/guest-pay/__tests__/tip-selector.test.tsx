import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { computeTip, type TipChoice } from '@goldstar/platform';
import { TipSelector, defaultTip } from '../tip-selector';

/**
 * Stateful harness — wires `value`/`onChange` the way the real callers
 * (`pay-sheet.tsx`, `static-checkout-view.tsx`) do, with `useState<TipChoice>`.
 *
 * This exists because the Ruling AK defect was UNOBSERVABLE through the tests
 * below it: they pass `value` as a static prop, so the preset chip's `selected`
 * can never change in response to a click, and "preset and Custom both look
 * selected" cannot be reproduced. The bug survived a review for exactly that
 * reason. The seam decides what is checkable — a component driven by a frozen
 * prop is not the component the guest uses.
 */
function StatefulTipSelector({
  subtotal,
  presets,
  initial,
  onChange,
}: {
  subtotal: number;
  presets: number[];
  initial: TipChoice;
  onChange?: (c: TipChoice) => void;
}) {
  const [value, setValue] = useState<TipChoice>(initial);
  return (
    <TipSelector
      subtotal={subtotal}
      presets={presets}
      value={value}
      onChange={(c) => {
        setValue(c);
        onChange?.(c);
      }}
    />
  );
}

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

// Mirrors goldstar-mobile's src/components/ui/__tests__/tip-selector.test.tsx
// (same subtotal/presets fixtures, same assertions) translated to
// @testing-library/react queries — this component is a straight port of
// that one's API and behavior.
describe('TipSelector', () => {
  it('preset clicks emit choices and show computed amounts; custom clamps at the subtotal', () => {
    const onChange = vi.fn();
    render(
      <TipSelector subtotal={1605} presets={[18, 20, 25]} value={{ kind: 'none' } as TipChoice} onChange={onChange} currency="USD" />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tip 20%' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'preset', percent: 20 });
    expect(screen.getByText('$3.21')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Custom tip' }));
    // Custom tip is denominated in dollars, not cents — "5.50" parses to 550 cents.
    fireEvent.change(screen.getByLabelText('Custom tip amount'), { target: { value: '5.50' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'custom', amount: 550 });

    // An entry above the subtotal still clamps.
    fireEvent.change(screen.getByLabelText('Custom tip amount'), { target: { value: '999.99' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'custom', amount: 1605 });
  });

  it('"No tip" emits { kind: "none" }', () => {
    const onChange = vi.fn();
    render(
      <TipSelector subtotal={1000} presets={[15, 20]} value={{ kind: 'preset', percent: 20 } as TipChoice} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'No tip' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'none' });
  });

  it('renders a distinct computed amount per preset, and marks the selected one aria-pressed', () => {
    const onChange = vi.fn();
    render(
      <TipSelector
        subtotal={1605}
        presets={[18, 20, 25]}
        value={{ kind: 'preset', percent: 20 } as TipChoice}
        onChange={onChange}
        currency="USD"
      />
    );
    expect(screen.getByText('$2.89')).toBeInTheDocument(); // 18%
    expect(screen.getByText('$3.21')).toBeInTheDocument(); // 20%
    expect(screen.getByText('$4.01')).toBeInTheDocument(); // 25%
    expect(screen.getByRole('button', { name: 'Tip 20%' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tip 18%' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('TipSelector: opening Custom seeds the amount (Ruling AK)', () => {
  const SUBTOTAL = 1605;
  const PRESETS = [18, 20, 25];

  it('MONEY: preset then Custom leaves exactly one chip selected — not both', () => {
    render(<StatefulTipSelector subtotal={SUBTOTAL} presets={PRESETS} initial={{ kind: 'preset', percent: 20 }} />);
    expect(pressed('Tip 20%')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Custom tip' }));

    // Before the fix BOTH read "true": the preset chip from `value`, the Custom
    // chip from local state. That is the misrepresentation — a highlighted
    // "Custom tip" over an empty box while the preset is what gets charged.
    expect(pressed('Custom tip')).toBe('true');
    expect(pressed('Tip 20%')).toBe('false');
    expect(pressed('Tip 18%')).toBe('false');
    expect(pressed('Tip 25%')).toBe('false');
    expect(pressed('No tip')).toBe('false');
  });

  it('MONEY: paying immediately after opening Custom charges the seeded amount, not a silent preset', () => {
    const onChange = vi.fn();
    render(
      <StatefulTipSelector subtotal={SUBTOTAL} presets={PRESETS} initial={{ kind: 'preset', percent: 20 }} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Custom tip' }));

    const expected = computeTip({ subtotal: SUBTOTAL, choice: { kind: 'preset', percent: 20 }, presets: PRESETS });
    expect(onChange).toHaveBeenCalledWith({ kind: 'custom', amount: expected });
    // ...and the committed choice is what the field shows, so the guest sees
    // the number they will be charged rather than an empty box.
    expect(screen.getByLabelText('Custom tip amount')).toHaveValue((expected / 100).toFixed(2));
  });

  it('SEEDS, does not ZERO: a guest who opens Custom and pays without typing keeps their tip', () => {
    const onChange = vi.fn();
    render(
      <StatefulTipSelector subtotal={SUBTOTAL} presets={PRESETS} initial={{ kind: 'preset', percent: 25 }} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Custom tip' }));

    const amount = (onChange.mock.calls.at(-1)?.[0] as { amount: number }).amount;
    // Committing `amount: 0` on open would also fix the double-selection, and
    // would quietly cut staff income. It must carry the tip forward instead.
    expect(amount).toBeGreaterThan(0);
    expect(amount).toBe(computeTip({ subtotal: SUBTOTAL, choice: { kind: 'preset', percent: 25 }, presets: PRESETS }));
  });

  it('GUARD: re-tapping Custom does NOT overwrite what the guest typed', () => {
    const onChange = vi.fn();
    render(
      <StatefulTipSelector subtotal={SUBTOTAL} presets={PRESETS} initial={{ kind: 'preset', percent: 20 }} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Custom tip' }));
    fireEvent.change(screen.getByLabelText('Custom tip amount'), { target: { value: '3.50' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'custom', amount: 350 });

    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Custom tip' }));

    // Without the `value.kind !== 'custom'` guard this recomputes from the old
    // preset and silently replaces the 3.50 the guest just entered.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opening Custom from "No tip" seeds 0 rather than inventing a tip', () => {
    const onChange = vi.fn();
    render(<StatefulTipSelector subtotal={SUBTOTAL} presets={PRESETS} initial={{ kind: 'none' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom tip' }));

    expect(onChange).toHaveBeenCalledWith({ kind: 'custom', amount: 0 });
    expect(pressed('No tip')).toBe('false');
    expect(pressed('Custom tip')).toBe('true');
  });

  it('switching back to a preset from Custom deselects Custom', () => {
    render(<StatefulTipSelector subtotal={SUBTOTAL} presets={PRESETS} initial={{ kind: 'preset', percent: 20 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom tip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tip 18%' }));

    expect(pressed('Tip 18%')).toBe('true');
    expect(pressed('Custom tip')).toBe('false');
    expect(screen.queryByLabelText('Custom tip amount')).not.toBeInTheDocument();
  });

  it("the FIRST click reaches the bad state: defaultTip pre-selects a preset, so no prior click is needed", () => {
    // This is why the web tree was the exposed one — mobile defaults to no tip.
    const initial = defaultTip(PRESETS);
    expect(initial).toEqual({ kind: 'preset', percent: 20 });

    const onChange = vi.fn();
    render(<StatefulTipSelector subtotal={SUBTOTAL} presets={PRESETS} initial={initial} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom tip' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(pressed('Tip 20%')).toBe('false');
  });
});
