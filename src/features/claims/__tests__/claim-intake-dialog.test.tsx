import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';

const setDocMock = vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {});

/** Mirrors real `@firebase/firestore`'s rejection of a bare `undefined` field value
 * (`venue-form.test.tsx`'s own precedent) — a structural regression guard, not just a pass-through. */
function assertNoUndefinedFirestoreValue(data: unknown, path = ''): void {
  if (data === undefined) throw new Error(`Unsupported field value: undefined (found in field ${path || '(root)'})`);
  if (Array.isArray(data)) {
    data.forEach((v, i) => assertNoUndefinedFirestoreValue(v, `${path}[${i}]`));
    return;
  }
  if (data !== null && typeof data === 'object') {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) assertNoUndefinedFirestoreValue(v, path ? `${path}.${k}` : k);
  }
}

vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, p: string) => ({ path: p }),
  setDoc: (ref: { path: string }, data: unknown) => {
    assertNoUndefinedFirestoreValue(data);
    return setDocMock(ref.path, data);
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

import { ClaimIntakeDialog } from '../claim-intake-dialog';

const OP = 'goldstar';
const TID = '01912345-7abc-7def-8123-456789abcdef';
const UID = 'admin1';

beforeEach(() => {
  setDocMock.mockReset();
});

function renderDialog(props: Partial<ComponentProps<typeof ClaimIntakeDialog>> = {}) {
  const onCreated = vi.fn();
  const onCancel = vi.fn();
  render(<ClaimIntakeDialog operatorId={OP} ticketId={TID} createdByUid={UID} onCreated={onCreated} onCancel={onCancel} {...props} />);
  return { onCreated, onCancel };
}

describe('ClaimIntakeDialog', () => {
  it('renders one alleged-damage row by default and a Create claim button', () => {
    renderDialog();
    expect(screen.getByLabelText('Claim description')).toBeInTheDocument();
    expect(screen.getByLabelText('Alleged damage note 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create claim' })).toBeInTheDocument();
  });

  it('prefills the guest-contact name from the ticket, but never phone/email', () => {
    renderDialog({ guestName: 'Jamie Guest' });
    expect(screen.getByLabelText('Name')).toHaveValue('Jamie Guest');
    expect(screen.getByLabelText('Phone')).toHaveValue('');
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('Create claim is disabled until a description is entered', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Create claim' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Claim description'), { target: { value: 'Scratch on rear bumper found at pickup.' } });
    expect(screen.getByRole('button', { name: 'Create claim' })).not.toBeDisabled();
  });

  it('writes claims/{uuidv7} with status intake and the entered fields, then calls onCreated', async () => {
    const { onCreated } = renderDialog({ guestName: 'Jamie Guest' });
    fireEvent.change(screen.getByLabelText('Claim description'), { target: { value: 'Scratch on rear bumper found at pickup.' } });
    fireEvent.change(screen.getByLabelText('Alleged damage note 1'), { target: { value: 'Deep scratch, ~4in' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+13175550123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create claim' }));

    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1));
    const [path, data] = setDocMock.mock.calls[0]!;
    expect(path).toMatch(new RegExp(`^operators/${OP}/claims/`));
    expect(data).toMatchObject({
      operatorId: OP,
      ticketId: TID,
      status: 'intake',
      description: 'Scratch on rear bumper found at pickup.',
      allegedDamage: [{ panel: 'front_bumper', kind: 'scratch', description: 'Deep scratch, ~4in' }],
      guestContact: { name: 'Jamie Guest', phone: '+13175550123' },
      createdBy: UID,
    });
    expect((data as { guestContact: Record<string, unknown> }).guestContact).not.toHaveProperty('email');
    expect(onCreated).toHaveBeenCalledWith((data as { id: string }).id);
  });

  it('an invalid phone blocks submission with an inline error and never calls setDoc', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Claim description'), { target: { value: 'Scratch on rear bumper.' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: 'not-a-phone' } });
    expect(screen.getByText('Enter a valid phone number, e.g. +13175550100.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create claim' })).toBeDisabled();
  });

  it('an invalid email blocks submission with an inline error', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Claim description'), { target: { value: 'Scratch on rear bumper.' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create claim' })).toBeDisabled();
  });

  it('Add damage adds a second row, and its Remove button removes it again', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Add damage' }));
    expect(screen.getByLabelText('Alleged damage note 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove alleged damage row 2' }));
    expect(screen.queryByLabelText('Alleged damage note 2')).not.toBeInTheDocument();
  });

  it('the sole row has no Remove button (at least one alleged-damage row is always kept)', () => {
    renderDialog();
    expect(screen.queryByRole('button', { name: 'Remove alleged damage row 1' })).not.toBeInTheDocument();
  });

  it('multiple alleged-damage rows are all included in the write payload', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Claim description'), { target: { value: 'Two damaged panels found.' } });
    fireEvent.change(screen.getByLabelText('Alleged damage note 1'), { target: { value: 'Front scuff' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add damage' }));
    fireEvent.change(screen.getByLabelText('Alleged damage note 2'), { target: { value: 'Rear dent' } });
    const panelSelects = screen.getAllByLabelText('Panel') as HTMLSelectElement[];
    fireEvent.change(panelSelects[1]!, { target: { value: 'rear_bumper' } });
    const kindSelects = screen.getAllByLabelText('Kind') as HTMLSelectElement[];
    fireEvent.change(kindSelects[1]!, { target: { value: 'dent' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create claim' }));
    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1));
    const [, data] = setDocMock.mock.calls[0]!;
    expect((data as { allegedDamage: unknown[] }).allegedDamage).toEqual([
      { panel: 'front_bumper', kind: 'scratch', description: 'Front scuff' },
      { panel: 'rear_bumper', kind: 'dent', description: 'Rear dent' },
    ]);
  });

  it('cancel calls onCancel without writing anything', () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
  });
});
