import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Operator } from '@goldstar/platform';

const connectAccountStatusMock = vi.fn();
vi.mock('@/lib/firebase/callables', () => ({ callable: () => connectAccountStatusMock }));

import { ConnectStatusCard } from '../connect-status-card';

function operator(over: Partial<Operator['modules']['payments']> = {}): Operator {
  return {
    id: 'goldstar',
    modules: { payments: { provider: 'stripe', chargeModel: 'destination', platformFeeBps: 0, tipPresets: [18, 20, 25], tipPolicy: 'deliverer', ...over } },
  } as unknown as Operator;
}

beforeEach(() => {
  connectAccountStatusMock.mockReset();
});

describe('ConnectStatusCard', () => {
  it('not connected: shows a "Not connected" pill, a link to Settings, and never calls the callable', () => {
    render(<ConnectStatusCard operator={operator()} />);
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(connectAccountStatusMock).not.toHaveBeenCalled();
  });

  it('connected: shows a loading state, then charges/payouts pills once the callable resolves', async () => {
    let resolve!: (v: { chargesEnabled: boolean; payoutsEnabled: boolean; requirementsDue: string[] }) => void;
    connectAccountStatusMock.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ConnectStatusCard operator={operator({ connectedAccountId: 'acct_1' })} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();

    resolve({ chargesEnabled: true, payoutsEnabled: true, requirementsDue: [] });
    await waitFor(() => expect(screen.getByText('Charges enabled')).toBeInTheDocument());
    expect(screen.getByText('Payouts enabled')).toBeInTheDocument();
    expect(screen.getByText('Account acct_1')).toBeInTheDocument();
  });

  it('connected but requirements outstanding: renders requirementsDue as a legible bulleted list, and shows a disabled tone', async () => {
    connectAccountStatusMock.mockResolvedValue({ chargesEnabled: false, payoutsEnabled: false, requirementsDue: ['individual.verification.document', 'external_account'] });
    render(<ConnectStatusCard operator={operator({ connectedAccountId: 'acct_1' })} />);
    await waitFor(() => expect(screen.getByText('Charges disabled')).toBeInTheDocument());
    expect(screen.getByText('Payouts disabled')).toBeInTheDocument();
    expect(screen.getByText('individual · verification · document')).toBeInTheDocument();
    expect(screen.getByText('external account')).toBeInTheDocument();
  });

  it('a genuine callable failure once connected shows a neutral error message, not a raw error', async () => {
    connectAccountStatusMock.mockRejectedValue(new Error('internal'));
    render(<ConnectStatusCard operator={operator({ connectedAccountId: 'acct_1' })} />);
    await waitFor(() => expect(screen.getByText('Unable to load Connect status right now.')).toBeInTheDocument());
  });
});
