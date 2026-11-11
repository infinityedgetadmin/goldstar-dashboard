import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Operator } from '@goldstar/platform';

const update = vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {});
vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, p: string) => ({ path: p }),
  updateDoc: (ref: { path: string }, d: unknown) => update(ref.path, d),
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {}, storage: {} }) }));

const useSessionMock = vi.fn();
vi.mock('@/features/auth/use-session', () => ({ useSession: () => useSessionMock() }));

const useCollectionExistsMock = vi.fn();
vi.mock('../use-collection-exists', () => ({ useCollectionExists: () => useCollectionExistsMock() }));

import { OperatorSettingsForm } from '../operator-settings-form';

const OPERATOR: Operator = {
  id: 'goldstar',
  name: 'Goldstar Valet',
  slug: 'goldstar',
  status: 'active',
  timezone: 'America/Indiana/Indianapolis',
  currency: 'USD',
  isSandbox: false,
  plan: 'standard',
  branding: {
    displayName: 'Goldstar',
    primaryColor: '#ab6034',
    accentColor: '#ffc30c',
    supportPhone: '+13175550100',
    supportEmail: 'support@goldstarvalet.example.com',
    receiptFooter: 'Thank you!',
  },
  modules: {
    payments: { provider: 'stripe', chargeModel: 'destination', platformFeeBps: 250, tipPresets: [18, 20, 25], tipPolicy: 'deliverer' },
    messaging: { provider: 'twilio', messagingServiceSid: 'MG_x' },
    scheduling: { provider: 'internal' },
    vision: { provider: 'none' },
    accounting: { provider: 'csv' },
  },
  features: { driveHome: true, passengerRides: true, venuePortals: true, tapToPay: false, plateOcr: false, payouts: true },
  security: { requireMfaForAdmins: false },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'system',
};

beforeEach(() => {
  update.mockClear();
  useSessionMock.mockReturnValue({ isPlatformAdmin: false });
  useCollectionExistsMock.mockReturnValue({ exists: false, loading: false });
});

describe('OperatorSettingsForm', () => {
  it('renders general fields pre-filled from the operator', () => {
    render(<OperatorSettingsForm operatorId="goldstar" operator={OPERATOR} />);
    expect(screen.getByLabelText('Name')).toHaveValue('Goldstar Valet');
    expect(screen.getByLabelText('Timezone')).toHaveValue('America/Indiana/Indianapolis');
    expect(screen.getByLabelText('Currency')).toHaveValue('USD');
    expect(screen.getByLabelText('Support phone')).toHaveValue('+13175550100');
    expect(screen.getByLabelText('Support email')).toHaveValue('support@goldstarvalet.example.com');
    expect(screen.getByLabelText('Preset 1')).toHaveValue(18);
    expect(screen.getByLabelText('Preset 2')).toHaveValue(20);
    expect(screen.getByLabelText('Preset 3')).toHaveValue(25);
  });

  it('saves a name change with dot-path branding keys, a trimmed tip-presets array, features, and security', async () => {
    render(<OperatorSettingsForm operatorId="goldstar" operator={OPERATOR} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Goldstar Valet Co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [path, payload] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('operators/goldstar');
    expect(payload).toMatchObject({
      name: 'Goldstar Valet Co',
      'branding.supportPhone': '+13175550100',
      'branding.supportEmail': 'support@goldstarvalet.example.com',
      'branding.receiptFooter': 'Thank you!',
      'modules.payments.tipPresets': [18, 20, 25],
      'modules.payments.tipPolicy': 'deliverer',
      features: OPERATOR.features,
      'security.requireMfaForAdmins': false,
    });
    expect(payload).not.toHaveProperty('modules.payments.platformFeeBps');
  });

  it('drops a cleared preset 3 from the saved tipPresets array', async () => {
    render(<OperatorSettingsForm operatorId="goldstar" operator={OPERATOR} />);
    fireEvent.change(screen.getByLabelText('Preset 3'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [, payload] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).toMatchObject({ 'modules.payments.tipPresets': [18, 20] });
  });

  it('disables currency and excludes it from the save payload once the operator has a first ticket', async () => {
    useCollectionExistsMock.mockReturnValue({ exists: true, loading: false });
    render(<OperatorSettingsForm operatorId="goldstar" operator={OPERATOR} />);
    expect(screen.getByLabelText('Currency')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [, payload] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).not.toHaveProperty('currency');
  });

  it('leaves currency editable and includes it in the save payload before any ticket exists', async () => {
    render(<OperatorSettingsForm operatorId="goldstar" operator={OPERATOR} />);
    expect(screen.getByLabelText('Currency')).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [, payload] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).toMatchObject({ currency: 'USD' });
  });

  it('hides the platform fee input from a non-platform-admin owner', () => {
    render(<OperatorSettingsForm operatorId="goldstar" operator={OPERATOR} />);
    expect(screen.queryByLabelText('Platform fee (bps)')).not.toBeInTheDocument();
    expect(screen.getByText(/2\.50%/)).toBeInTheDocument();
  });

  it('shows and saves an edited platform fee for a platform admin', async () => {
    useSessionMock.mockReturnValue({ isPlatformAdmin: true });
    render(<OperatorSettingsForm operatorId="goldstar" operator={OPERATOR} />);
    const feeInput = screen.getByLabelText('Platform fee (bps)', { exact: false });
    fireEvent.change(feeInput, { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [, payload] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).toMatchObject({ 'modules.payments.platformFeeBps': 500 });
  });

  it('toggling a feature checkbox flips it in the saved features payload', async () => {
    render(<OperatorSettingsForm operatorId="goldstar" operator={OPERATOR} />);
    fireEvent.click(screen.getByLabelText('Tap to pay'));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [, payload] = update.mock.calls[0] as [string, { features: Record<string, boolean> }];
    expect(payload.features.tapToPay).toBe(true);
    expect(payload.features.driveHome).toBe(true);
  });

  it('toggling "Require MFA for admins" flips the saved security payload', async () => {
    render(<OperatorSettingsForm operatorId="goldstar" operator={OPERATOR} />);
    fireEvent.click(screen.getByLabelText('Require MFA for admins'));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [, payload] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).toMatchObject({ 'security.requireMfaForAdmins': true });
  });

  it('rejects an invalid support email and does not save', async () => {
    render(<OperatorSettingsForm operatorId="goldstar" operator={OPERATOR} />);
    fireEvent.change(screen.getByLabelText('Support email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(screen.getByLabelText('Support email')).toBeInvalid());
    expect(update).not.toHaveBeenCalled();
  });
});
