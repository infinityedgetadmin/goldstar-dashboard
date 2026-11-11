import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { INTEGRATION_MANIFEST, type Operator } from '@goldstar/platform';
import { IntegrationCard } from '../integration-card';

const { callableMock, healthCheckMock, syncNowMock, toastMock } = vi.hoisted(() => ({
  callableMock: vi.fn(),
  healthCheckMock: vi.fn(),
  syncNowMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/firebase/callables', () => ({
  callable: (name: string) => (name === 'integrationsHealthCheck' ? healthCheckMock : name === 'schedulingSyncNow' ? syncNowMock : callableMock),
}));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

const STRIPE = INTEGRATION_MANIFEST.find((m) => m.id === 'stripe')!;
const INTERNAL = INTEGRATION_MANIFEST.find((m) => m.id === 'internal')!;
const ICAL = INTEGRATION_MANIFEST.find((m) => m.id === 'ical')!;
const OPERA_CLOUD = INTEGRATION_MANIFEST.find((m) => m.id === 'opera_cloud')!;
const TOAST = INTEGRATION_MANIFEST.find((m) => m.id === 'toast')!;

/** One per-venue status row, as `integrations-grid.tsx` builds them. */
function row(venueId: string, venueName: string, configured: boolean, doc?: { health?: { ok: boolean; message?: string } }) {
  return { venueId, venueName, configured, ...(doc ? { doc } : {}) };
}

const OPERATOR = {
  modules: {
    payments: { provider: 'stripe', chargeModel: 'destination', platformFeeBps: 0, tipPresets: [18, 20, 25], tipPolicy: 'deliverer' },
    messaging: { provider: 'twilio' },
    scheduling: { provider: 'internal' },
    vision: { provider: 'none' },
    accounting: { provider: 'csv' },
  },
} as unknown as Operator;

beforeEach(() => {
  healthCheckMock.mockReset();
  syncNowMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe('IntegrationCard', () => {
  it('renders the manifest label', () => {
    render(<IntegrationCard entry={STRIPE} operator={OPERATOR} onConfigure={vi.fn()} />);
    expect(screen.getByText('Stripe')).toBeInTheDocument();
  });

  it('shows an Active badge when this entry is the operator\'s current provider for its module', () => {
    render(<IntegrationCard entry={INTERNAL} operator={OPERATOR} onConfigure={vi.fn()} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('does not show an Active badge for a non-active provider in the same module', () => {
    render(<IntegrationCard entry={ICAL} operator={OPERATOR} onConfigure={vi.fn()} />);
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('shows a Venue-scoped badge for a venue-scoped entry', () => {
    render(<IntegrationCard entry={OPERA_CLOUD} operator={OPERATOR} onConfigure={vi.fn()} />);
    expect(screen.getByText('Venue-scoped')).toBeInTheDocument();
  });

  it('Configure calls onConfigure', () => {
    const onConfigure = vi.fn();
    render(<IntegrationCard entry={STRIPE} operator={OPERATOR} onConfigure={onConfigure} />);
    fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
    expect(onConfigure).toHaveBeenCalledTimes(1);
  });

  it('offers Test connection for an operator-scoped entry, calling integrationsHealthCheck with just the provider', async () => {
    healthCheckMock.mockResolvedValue({ ok: true });
    render(<IntegrationCard entry={STRIPE} operator={OPERATOR} onConfigure={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => expect(healthCheckMock).toHaveBeenCalledWith({ provider: 'stripe' }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Stripe: connection healthy.'));
  });

  it('a failed health check surfaces via toast.error, never a raw string in the UI', async () => {
    healthCheckMock.mockResolvedValue({ ok: false, message: 'health check not implemented for this provider yet' });
    render(<IntegrationCard entry={STRIPE} operator={OPERATOR} onConfigure={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    const [err] = toastMock.error.mock.calls[0] as [Error];
    expect(err.message).toBe('health check not implemented for this provider yet');
  });

  it('does NOT offer Test connection for a venue-scoped entry — needs a venue picked first, only available in the Configure dialog', () => {
    render(<IntegrationCard entry={OPERA_CLOUD} operator={OPERATOR} onConfigure={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Test connection' })).not.toBeInTheDocument();
  });

  it('offers Sync now only when this scheduling entry is the operator\'s ACTIVE scheduling provider', () => {
    render(<IntegrationCard entry={INTERNAL} operator={OPERATOR} onConfigure={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeInTheDocument();
  });

  it('does not offer Sync now for an inactive scheduling entry — clicking it would silently sync the wrong provider', () => {
    render(<IntegrationCard entry={ICAL} operator={OPERATOR} onConfigure={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });

  it('does not offer Sync now for a non-scheduling entry even when active', () => {
    render(<IntegrationCard entry={STRIPE} operator={OPERATOR} onConfigure={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });

  it('Sync now calls schedulingSyncNow and reports the result', async () => {
    syncNowMock.mockResolvedValue({ upserted: 3, errors: [] });
    render(<IntegrationCard entry={INTERNAL} operator={OPERATOR} onConfigure={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(syncNowMock).toHaveBeenCalledWith({}));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Synced — 3 shift(s) updated.'));
  });

  it('Sync now reports errors in the success toast when the sync partially failed', async () => {
    syncNowMock.mockResolvedValue({ upserted: 1, errors: ['boom'] });
    render(<IntegrationCard entry={INTERNAL} operator={OPERATOR} onConfigure={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Synced — 1 shift(s) updated, 1 error(s).'));
  });

  it('shows "Not configured yet" for an operator-scoped entry with no doc', () => {
    render(<IntegrationCard entry={STRIPE} operator={OPERATOR} onConfigure={vi.fn()} />);
    expect(screen.getByText('Not configured yet')).toBeInTheDocument();
  });

  it('counts how many venues are configured for a venue-scoped entry', () => {
    const rows = [row('v1', 'The Grand', true), row('v2', 'The Grill', false), row('v3', 'Rooftop', true)];
    render(<IntegrationCard entry={OPERA_CLOUD} operator={OPERATOR} venueRows={rows} onConfigure={vi.fn()} />);
    expect(screen.getByText('2 of 3 venue(s) configured')).toBeInTheDocument();
  });

  it('lists every venue by name, configured or not', () => {
    const rows = [row('v1', 'The Grand', true), row('v2', 'The Grill', false)];
    render(<IntegrationCard entry={OPERA_CLOUD} operator={OPERATOR} venueRows={rows} onConfigure={vi.fn()} />);
    expect(screen.getByText('The Grand')).toBeInTheDocument();
    expect(screen.getByText('The Grill')).toBeInTheDocument();
  });

  it('RULING AC: an unconfigured venue reads as "Not configured", never as an error', () => {
    render(<IntegrationCard entry={OPERA_CLOUD} operator={OPERATOR} venueRows={[row('v2', 'The Grill', false)]} onConfigure={vi.fn()} />);
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });

  it('RULING AC: a stale red health stamp cannot override "Not configured"', () => {
    // The old "Test connection" in the config dialog stamped `health.ok:false` +
    // `lastError: 'health check not implemented for this provider yet'` on any venue-scoped doc it
    // was pressed for. Those documents exist. A venue with no `venue.pms` must still read as
    // unconfigured — otherwise the page reports a failure for something never set up.
    const stale = { health: { ok: false, message: 'health check not implemented for this provider yet' } };
    render(<IntegrationCard entry={OPERA_CLOUD} operator={OPERATOR} venueRows={[row('v2', 'The Grill', false, stale)]} onConfigure={vi.fn()} />);
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });

  it('shows all three states at once when the venues genuinely differ', () => {
    const rows = [
      row('v1', 'The Grand', true, { health: { ok: true } }),
      row('v2', 'Rooftop', true, { health: { ok: false, message: 'auth failed' } }),
      row('v3', 'The Grill', false),
    ];
    render(<IntegrationCard entry={TOAST} operator={OPERATOR} venueRows={rows} onConfigure={vi.fn()} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('a configured venue that has never been tested reads as "Not tested", not as healthy', () => {
    render(<IntegrationCard entry={TOAST} operator={OPERATOR} venueRows={[row('v1', 'The Grand', true)]} onConfigure={vi.fn()} />);
    expect(screen.getByText('Not tested')).toBeInTheDocument();
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument();
  });

  it('RULING AV: the PMS card explains that connection testing is unavailable', () => {
    render(<IntegrationCard entry={OPERA_CLOUD} operator={OPERATOR} venueRows={[row('v1', 'The Grand', true)]} onConfigure={vi.fn()} />);
    expect(screen.getByText(/Connection testing isn't available for this provider yet/)).toBeInTheDocument();
  });

  it('RULING AV: the POS card does NOT carry that copy — Toast has a real probe', () => {
    render(<IntegrationCard entry={TOAST} operator={OPERATOR} venueRows={[row('v1', 'The Grand', true)]} onConfigure={vi.fn()} />);
    expect(screen.queryByText(/Connection testing isn't available/)).not.toBeInTheDocument();
  });

  it('neither venue-scoped card offers Test connection on the card itself', () => {
    for (const entry of [OPERA_CLOUD, TOAST]) {
      const { unmount } = render(<IntegrationCard entry={entry} operator={OPERATOR} venueRows={[row('v1', 'The Grand', true)]} onConfigure={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'Test connection' })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('says so plainly when the operator has no venues at all', () => {
    render(<IntegrationCard entry={OPERA_CLOUD} operator={OPERATOR} venueRows={[]} onConfigure={vi.fn()} />);
    expect(screen.getByText('No venues yet.')).toBeInTheDocument();
  });
});
