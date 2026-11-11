import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { setSecretMock, toastMock } = vi.hoisted(() => ({
  setSecretMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/firebase/callables', () => ({
  callable: () => setSecretMock,
}));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

import { SecretsCard } from '../secrets-card';

beforeEach(() => {
  setSecretMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe('SecretsCard', () => {
  it('renders nothing for a provider with no secretFields', () => {
    const { container } = render(<SecretsCard provider="ical" secretFields={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one password input per secretFields entry with a readable label', () => {
    render(<SecretsCard provider="twilio" secretFields={['accountSid', 'authToken']} />);
    const accountSid = screen.getByLabelText('Account sid') as HTMLInputElement;
    const authToken = screen.getByLabelText('Auth token') as HTMLInputElement;
    expect(accountSid.type).toBe('password');
    expect(authToken.type).toBe('password');
  });

  it('only saves fields the operator actually filled in', async () => {
    setSecretMock.mockResolvedValue({ secretRef: 'ref' });
    render(<SecretsCard provider="twilio" secretFields={['accountSid', 'authToken']} />);
    fireEvent.change(screen.getByLabelText('Account sid'), { target: { value: 'AC123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save secrets' }));
    await waitFor(() => expect(setSecretMock).toHaveBeenCalledTimes(1));
    expect(setSecretMock).toHaveBeenCalledWith({ provider: 'twilio', name: 'accountSid', value: 'AC123' });
  });

  // Task 8/9 (task-89-report.md): venue-scoped providers (opera_cloud, toast) pass a `venueId` prop
  // through to `integrationsSetSecret` so the Functions handler composes the correct
  // `{provider}_{venueId}` secret/doc id — see that callable's own updated tests in
  // `goldstar-platform` for the server-side half of this.
  it('threads venueId through to the callable when provided (venue-scoped provider)', async () => {
    setSecretMock.mockResolvedValue({ secretRef: 'ref' });
    render(<SecretsCard provider="opera_cloud" secretFields={['clientSecret']} venueId="v1" />);
    fireEvent.change(screen.getByLabelText('Client secret'), { target: { value: 'shh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save secrets' }));
    await waitFor(() => expect(setSecretMock).toHaveBeenCalledTimes(1));
    expect(setSecretMock).toHaveBeenCalledWith({ provider: 'opera_cloud', name: 'clientSecret', value: 'shh', venueId: 'v1' });
  });

  it('omits venueId entirely (not even undefined) for an operator-scoped provider', async () => {
    setSecretMock.mockResolvedValue({ secretRef: 'ref' });
    render(<SecretsCard provider="twilio" secretFields={['accountSid']} />);
    fireEvent.change(screen.getByLabelText('Account sid'), { target: { value: 'AC123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save secrets' }));
    await waitFor(() => expect(setSecretMock).toHaveBeenCalledTimes(1));
    const [input] = setSecretMock.mock.calls[0] as [Record<string, unknown>];
    expect(Object.hasOwn(input, 'venueId')).toBe(false);
  });

  it('both fields succeed: one success toast, both inputs cleared', async () => {
    setSecretMock.mockResolvedValue({ secretRef: 'ref' });
    render(<SecretsCard provider="twilio" secretFields={['accountSid', 'authToken']} />);
    const accountSid = screen.getByLabelText('Account sid') as HTMLInputElement;
    const authToken = screen.getByLabelText('Auth token') as HTMLInputElement;
    fireEvent.change(accountSid, { target: { value: 'AC123' } });
    fireEvent.change(authToken, { target: { value: 'tok_1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save secrets' }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Secrets saved.'));
    expect(toastMock.error).not.toHaveBeenCalled();
    await waitFor(() => expect(accountSid.value).toBe(''));
    expect(authToken.value).toBe('');
  });

  it('one field rejects: its failure is surfaced by field name, the other field is not rolled into a false all-good toast, and the failed value is kept', async () => {
    setSecretMock.mockImplementation(
      async (input: { name: string; value: string }) => {
        if (input.name === 'authToken') throw new Error('permission denied internal detail: sm-write acct-9182');
        return { secretRef: `ref-${input.name}` };
      },
    );
    render(<SecretsCard provider="twilio" secretFields={['accountSid', 'authToken']} />);
    const accountSid = screen.getByLabelText('Account sid') as HTMLInputElement;
    const authToken = screen.getByLabelText('Auth token') as HTMLInputElement;
    fireEvent.change(accountSid, { target: { value: 'AC123' } });
    fireEvent.change(authToken, { target: { value: 'tok_1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save secrets' }));

    // The failed field's failure is surfaced by its label, never by the raw error text.
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(expect.anything(), 'Auth token'));
    const [, context] = toastMock.error.mock.calls[0] as [unknown, string];
    expect(context).not.toMatch(/sm-write|acct-9182|permission denied/);

    // The success toast reflects PARTIAL success — never the unqualified "Secrets saved." used
    // when everything succeeds, so a real failure can never read as a false all-good toast.
    expect(toastMock.success).toHaveBeenCalledWith('Saved 1 of 2 secret(s).');
    expect(toastMock.success).not.toHaveBeenCalledWith('Secrets saved.');

    // The succeeded field is cleared; the failed field keeps what the operator typed.
    await waitFor(() => expect(accountSid.value).toBe(''));
    expect(authToken.value).toBe('tok_1');
  });

  it('all fields fail: no success toast at all, values are kept for retry', async () => {
    setSecretMock.mockRejectedValue(new Error('secret manager unavailable'));
    render(<SecretsCard provider="twilio" secretFields={['accountSid', 'authToken']} />);
    const accountSid = screen.getByLabelText('Account sid') as HTMLInputElement;
    const authToken = screen.getByLabelText('Auth token') as HTMLInputElement;
    fireEvent.change(accountSid, { target: { value: 'AC123' } });
    fireEvent.change(authToken, { target: { value: 'tok_1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save secrets' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(2));
    expect(toastMock.error).toHaveBeenCalledWith(expect.anything(), 'Account sid');
    expect(toastMock.error).toHaveBeenCalledWith(expect.anything(), 'Auth token');
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(accountSid.value).toBe('AC123');
    expect(authToken.value).toBe('tok_1');
  });
});
