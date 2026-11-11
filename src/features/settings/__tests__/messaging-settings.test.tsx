import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Operator } from '@goldstar/platform';

// N4 (final-review.md): clearing the Twilio SID must write deleteField(), not ''. Same
// DELETE_FIELD_SENTINEL pattern as credentials-panel.test.tsx / venue-form.test.tsx / user-editor.test.tsx.
const DELETE_FIELD_SENTINEL = { __isDeleteFieldSentinel: true } as const;

const updateDocMock = vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {});
vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, p: string) => ({ path: p }),
  deleteField: () => DELETE_FIELD_SENTINEL,
  updateDoc: (ref: { path: string }, data: unknown) => updateDocMock(ref.path, data),
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

const { toastMock } = vi.hoisted(() => ({ toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

vi.mock('../secrets-card', () => ({ SecretsCard: () => <div data-testid="secrets-card" /> }));

import { MessagingSettings } from '../messaging-settings';

const OPERATOR = {
  modules: { messaging: { provider: 'twilio', messagingServiceSid: 'MG_existing' } },
} as unknown as Operator;

const OPERATOR_UNSET = {
  modules: { messaging: { provider: 'twilio' } },
} as unknown as Operator;

beforeEach(() => {
  updateDocMock.mockReset();
  updateDocMock.mockResolvedValue(undefined);
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe('MessagingSettings (N4: deleteField() on clear)', () => {
  it('saves a non-empty SID as the trimmed string', async () => {
    render(<MessagingSettings operatorId="op1" operator={OPERATOR} />);
    const input = screen.getByLabelText('Messaging service SID');
    fireEvent.change(input, { target: { value: '  MG_new_value  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [path, data] = updateDocMock.mock.calls[0]!;
    expect(path).toBe('operators/op1');
    expect(data).toMatchObject({ 'modules.messaging.messagingServiceSid': 'MG_new_value' });
    expect(toastMock.success).toHaveBeenCalledWith('Messaging settings saved.');
  });

  it('clearing a previously-set SID sends deleteField(), never an empty string', async () => {
    render(<MessagingSettings operatorId="op1" operator={OPERATOR} />);
    const input = screen.getByLabelText('Messaging service SID');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, data] = updateDocMock.mock.calls[0]! as [string, Record<string, unknown>];
    expect(data['modules.messaging.messagingServiceSid']).toBe(DELETE_FIELD_SENTINEL);
    expect(data['modules.messaging.messagingServiceSid']).not.toBe('');
    expect(toastMock.success).toHaveBeenCalledWith('Messaging service disconnected.');
  });

  it('a whitespace-only submission is also treated as a clear (deleteField), not saved as literal whitespace', async () => {
    render(<MessagingSettings operatorId="op1" operator={OPERATOR} />);
    const input = screen.getByLabelText('Messaging service SID');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, data] = updateDocMock.mock.calls[0]! as [string, Record<string, unknown>];
    expect(data['modules.messaging.messagingServiceSid']).toBe(DELETE_FIELD_SENTINEL);
  });

  it('an operator with no SID configured yet renders an empty field and can submit empty without error (idempotent deleteField)', async () => {
    render(<MessagingSettings operatorId="op1" operator={OPERATOR_UNSET} />);
    const input = screen.getByLabelText('Messaging service SID') as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, data] = updateDocMock.mock.calls[0]! as [string, Record<string, unknown>];
    expect(data['modules.messaging.messagingServiceSid']).toBe(DELETE_FIELD_SENTINEL);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('sanitizes a save failure — never shows the raw error', async () => {
    updateDocMock.mockRejectedValue(new Error('PERMISSION_DENIED: missing index projectId=example-valet-staging'));
    render(<MessagingSettings operatorId="op1" operator={OPERATOR} />);
    fireEvent.change(screen.getByLabelText('Messaging service SID'), { target: { value: 'MG_x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    const [rawErr] = toastMock.error.mock.calls[0] as [Error];
    expect(rawErr.message).toContain('PERMISSION_DENIED'); // toast() itself sanitizes for display — this asserts the raw error is what's PASSED to it, not printed directly to the DOM
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
