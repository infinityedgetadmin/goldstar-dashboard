import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssignmentPicker, type AssignmentPickerStaff } from '../assignment-picker';

const ANA: AssignmentPickerStaff = { uid: 'att1', displayName: 'Ana', roles: ['attendant'] };
const BEN: AssignmentPickerStaff = { uid: 'att2', displayName: 'Ben', roles: ['lead', 'driver'] };

describe('AssignmentPicker', () => {
  it('checking an unassigned person adds them with their first role', () => {
    const onChange = vi.fn();
    render(<AssignmentPicker staff={[ANA]} assignments={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ana' }));
    expect(onChange).toHaveBeenCalledWith([{ uid: 'att1', role: 'attendant' }]);
  });

  it('unchecking an assigned person removes them', () => {
    const onChange = vi.fn();
    render(<AssignmentPicker staff={[ANA]} assignments={[{ uid: 'att1', role: 'attendant' }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ana' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('a checked person with multiple roles shows a role selector defaulting to their first role, changeable', () => {
    const onChange = vi.fn();
    render(<AssignmentPicker staff={[BEN]} assignments={[{ uid: 'att2', role: 'lead' }]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Ben role'), { target: { value: 'driver' } });
    expect(onChange).toHaveBeenCalledWith([{ uid: 'att2', role: 'driver' }]);
  });

  it('shows a conflict warning only for a checked person the caller flagged', () => {
    render(<AssignmentPicker staff={[ANA, BEN]} assignments={[{ uid: 'att1', role: 'attendant' }]} onChange={() => {}} conflicts={{ att1: 'Also on Brunch Shift, 9:00 AM–2:00 PM' }} />);
    expect(screen.getByText('Also on Brunch Shift, 9:00 AM–2:00 PM')).toBeInTheDocument();
  });

  it('disables every control when disabled is true', () => {
    render(<AssignmentPicker staff={[ANA]} assignments={[{ uid: 'att1', role: 'attendant' }]} onChange={() => {}} disabled />);
    expect(screen.getByRole('checkbox', { name: 'Ana' })).toBeDisabled();
  });

  it('shows an empty-state message when there is no eligible staff', () => {
    render(<AssignmentPicker staff={[]} assignments={[]} onChange={() => {}} />);
    expect(screen.getByText('No staff with a role at this venue yet.')).toBeInTheDocument();
  });
});
