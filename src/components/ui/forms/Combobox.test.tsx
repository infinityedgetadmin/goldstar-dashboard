import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils';
import { Combobox } from './Combobox';

// Baseline interaction tests for the hand-rolled WAI-ARIA combobox pattern
// (open/filter/keyboard nav/select/Escape-closes-dropdown-only), mirroring
// the shape of `guest-requests/address-autocomplete.test.tsx` — see
// task-1-report.md, Fix round 1 (M5).

const OPTIONS = ['Apple', 'Banana', 'Cherry'] as const;

function Controlled({
  onChange,
  initial = '',
  alwaysShow,
}: {
  onChange?: (v: string) => void;
  initial?: string;
  alwaysShow?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Combobox
      id="fruit"
      name="fruit"
      options={OPTIONS}
      value={value}
      alwaysShow={alwaysShow}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe('Combobox', () => {
  it('renders the initial value in the input', () => {
    render(<Controlled initial="Banana" />);
    expect(screen.getByRole('combobox')).toHaveValue('Banana');
  });

  it('exposes combobox/listbox a11y roles and opens on focus', () => {
    render(<Controlled />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.focus(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('filters options as the user types', () => {
    render(<Controlled />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'an' } });

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Banana');
  });

  it('shows the empty message when nothing matches', () => {
    render(<Controlled />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } });
    expect(screen.getByText('No match. Try another word.')).toBeInTheDocument();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('keeps an alwaysShow option visible even when the query filters it out', () => {
    render(<Controlled alwaysShow="Cherry" />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'an' } });

    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(expect.arrayContaining(['Banana', 'Cherry']));
  });

  it('supports ArrowDown/ArrowUp to move the active descendant (via aria-activedescendant) and Enter to commit it', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    const options = screen.getAllByRole('option');

    // Combobox tracks the keyboard-highlighted option via aria-activedescendant
    // on the input (the WAI-ARIA combobox pattern) — aria-selected on each
    // <li> instead reflects the currently *committed* value, unaffected by
    // arrow-key movement alone.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Apple');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveValue('Apple');
  });

  it('clicking an option commits it and closes the listbox', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.focus(screen.getByRole('combobox'));

    fireEvent.click(screen.getByText('Cherry'));
    expect(onChange).toHaveBeenCalledWith('Cherry');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox')).toHaveValue('Cherry');
  });

  it('Escape closes only the dropdown, reverting unsubmitted text without committing', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} initial="Apple" />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Apple something else' } });

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    // Settled back to the last committed value — never called onChange with the typed junk.
    expect(input).toHaveValue('Apple');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('settles and closes when a pointerdown lands outside the component', async () => {
    render(
      <div>
        <Controlled initial="Apple" />
        <button type="button">outside</button>
      </div>
    );
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText('outside'));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('carries the committed value in a hidden input for form submission', () => {
    const { container } = render(<Controlled initial="Banana" />);
    const hidden = container.querySelector('input[type="hidden"][name="fruit"]');
    expect(hidden).toHaveValue('Banana');
  });
});
