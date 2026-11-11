import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { INTEGRATION_MANIFEST, type Operator, type Venue } from '@goldstar/platform';

const { useCollectionMock } = vi.hoisted(() => ({ useCollectionMock: vi.fn() }));
vi.mock('@/lib/firebase/hooks', () => ({ useCollection: (path: string | undefined) => useCollectionMock(path) }));

interface CardMockProps {
  entry: { id: string };
  doc?: { status?: string };
  venueRows?: { venueId: string; venueName: string; configured: boolean; doc?: { status?: string } }[];
  onConfigure: () => void;
}
vi.mock('../integration-card', () => ({
  // `data-venue-rows` serialises the rows the grid COMPUTED — venue id, whether the grid decided it
  // is configured, and whether it paired a doc with it — so these tests assert the grid's own
  // derivation rather than how the card chooses to draw it.
  IntegrationCard: (props: CardMockProps) => (
    <div
      data-testid={`card-${props.entry.id}`}
      data-status={props.doc?.status ?? ''}
      data-venue-rows={(props.venueRows ?? []).map((r) => `${r.venueId}:${r.configured ? 'y' : 'n'}:${r.doc ? 'doc' : 'nodoc'}`).join(',')}
      data-venue-rows-present={props.venueRows ? 'yes' : 'no'}
    >
      <button type="button" onClick={props.onConfigure}>
        configure-{props.entry.id}
      </button>
    </div>
  ),
}));
vi.mock('../integration-config-dialog', () => ({
  IntegrationConfigDialog: (props: { entry: { id: string }; open: boolean; onOpenChange: (open: boolean) => void }) =>
    props.open ? (
      <div data-testid="dialog">
        dialog-for-{props.entry.id}
        <button type="button" onClick={() => props.onOpenChange(false)}>
          close
        </button>
      </div>
    ) : null,
}));

import { IntegrationsGrid } from '../integrations-grid';

const OPERATOR = { modules: {} } as unknown as Operator;
const VENUES: Venue[] = [];

const venue = (id: string, name: string, over: Partial<Venue> = {}): Venue =>
  ({ id, name, operatorId: 'goldstar', type: 'restaurant', ...over }) as unknown as Venue;
const PMS = { provider: 'opera_cloud', hotelId: 'h1', noPostBehavior: 'block', chargeCode: 'VLT' } as unknown as Venue['pms'];
const POS = { provider: 'toast', restaurantGuid: 'r1' } as unknown as Venue['pos'];

beforeEach(() => {
  useCollectionMock.mockReset();
});

describe('IntegrationsGrid', () => {
  it('shows a loading state while the integrations collection is loading', () => {
    useCollectionMock.mockReturnValue({ data: [], loading: true });
    render(<IntegrationsGrid operatorId="goldstar" operator={OPERATOR} venues={VENUES} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders every INTEGRATION_MANIFEST entry, one card each', () => {
    useCollectionMock.mockReturnValue({ data: [], loading: false });
    render(<IntegrationsGrid operatorId="goldstar" operator={OPERATOR} venues={VENUES} />);
    for (const entry of INTEGRATION_MANIFEST) {
      expect(screen.getByTestId(`card-${entry.id}`)).toBeInTheDocument();
    }
  });

  it('groups entries under a module heading', () => {
    useCollectionMock.mockReturnValue({ data: [], loading: false });
    render(<IntegrationsGrid operatorId="goldstar" operator={OPERATOR} venues={VENUES} />);
    expect(screen.getByText('Payments')).toBeInTheDocument();
    expect(screen.getByText('Scheduling')).toBeInTheDocument();
    expect(screen.getByText('Property management (PMS)')).toBeInTheDocument();
  });

  it('looks up an operator-scoped card\'s doc by exact id from the integrations collection', () => {
    useCollectionMock.mockReturnValue({ data: [{ id: 'twilio', status: 'active' }], loading: false });
    render(<IntegrationsGrid operatorId="goldstar" operator={OPERATOR} venues={VENUES} />);
    expect(screen.getByTestId('card-twilio')).toHaveAttribute('data-status', 'active');
  });

  it('pairs each venue with its own {provider}_{venueId} doc, per provider', () => {
    useCollectionMock.mockReturnValue({
      data: [
        { id: 'opera_cloud_v1', status: 'configured' },
        { id: 'toast_v2', status: 'configured' },
      ],
      loading: false,
    });
    const venues = [venue('v1', 'The Grand', { pms: PMS }), venue('v2', 'The Grill', { pos: POS })];
    render(<IntegrationsGrid operatorId="goldstar" operator={OPERATOR} venues={venues} />);
    // v1 has the PMS doc and PMS config; v2 has neither for this provider.
    expect(screen.getByTestId('card-opera_cloud')).toHaveAttribute('data-venue-rows', 'v1:y:doc,v2:n:nodoc');
    // …and exactly the other way round for Toast — the two providers never borrow each other's docs.
    expect(screen.getByTestId('card-toast')).toHaveAttribute('data-venue-rows', 'v1:n:nodoc,v2:y:doc');
  });

  it('a doc id is never mis-attributed to a venue whose id absorbs part of the provider name', () => {
    // The provider ids contain underscores, so any scheme that PARSES a doc id apart has to guess
    // where the boundary is: `opera_cloud_v1` splits as plausibly into (`opera_cloud`, `v1`) as into
    // (`opera`, `cloud_v1`). Composing `{entry.id}_{venue.id}` never guesses — the doc lands on v1,
    // and the venue actually called `cloud_v1` correctly has none.
    useCollectionMock.mockReturnValue({ data: [{ id: 'opera_cloud_v1', status: 'configured' }], loading: false });
    const venues = [venue('v1', 'The Grand', { pms: PMS }), venue('cloud_v1', 'Odd name', { pms: PMS })];
    render(<IntegrationsGrid operatorId="goldstar" operator={OPERATOR} venues={venues} />);
    expect(screen.getByTestId('card-opera_cloud')).toHaveAttribute('data-venue-rows', 'v1:y:doc,cloud_v1:y:nodoc');
  });

  it('RULING AC: configured comes from the VENUE doc, not from having an integration doc', () => {
    // A venue with `venue.pms` filled in but no secret saved yet has NO integration doc at all. The
    // old count called that unconfigured; every real consumer reads the venue doc, so it is
    // configured — and a venue with a doc but no `venue.pms` is not.
    useCollectionMock.mockReturnValue({ data: [{ id: 'opera_cloud_v2', status: 'configured' }], loading: false });
    const venues = [venue('v1', 'Configured, no doc', { pms: PMS }), venue('v2', 'Doc, no config')];
    render(<IntegrationsGrid operatorId="goldstar" operator={OPERATOR} venues={venues} />);
    expect(screen.getByTestId('card-opera_cloud')).toHaveAttribute('data-venue-rows', 'v1:y:nodoc,v2:n:doc');
  });

  it('passes no venue rows at all to an operator-scoped card', () => {
    useCollectionMock.mockReturnValue({ data: [], loading: false });
    render(<IntegrationsGrid operatorId="goldstar" operator={OPERATOR} venues={[venue('v1', 'The Grand', { pms: PMS })]} />);
    expect(screen.getByTestId('card-stripe')).toHaveAttribute('data-venue-rows-present', 'no');
    expect(screen.getByTestId('card-opera_cloud')).toHaveAttribute('data-venue-rows-present', 'yes');
  });

  it('clicking Configure on a card opens the dialog for that entry, and closing it removes the dialog', () => {
    useCollectionMock.mockReturnValue({ data: [], loading: false });
    render(<IntegrationsGrid operatorId="goldstar" operator={OPERATOR} venues={VENUES} />);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('configure-twilio'));
    expect(screen.getByTestId('dialog')).toHaveTextContent('dialog-for-twilio');

    fireEvent.click(screen.getByText('close'));
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('subscribes to exactly one collection path for the whole grid, not one per manifest entry', () => {
    useCollectionMock.mockReturnValue({ data: [], loading: false });
    render(<IntegrationsGrid operatorId="goldstar" operator={OPERATOR} venues={VENUES} />);
    expect(useCollectionMock).toHaveBeenCalledTimes(1);
    expect(useCollectionMock).toHaveBeenCalledWith('operators/goldstar/integrations');
  });
});
