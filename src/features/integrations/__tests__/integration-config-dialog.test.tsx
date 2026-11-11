import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { INTEGRATION_MANIFEST, type Venue } from '@goldstar/platform';

const { setDocMock, updateDocMock, useDocMock, healthCheckMock, toastMock } = vi.hoisted(() => ({
  setDocMock: vi.fn<(path: string, data: unknown, opts?: unknown) => Promise<void>>(async () => {}),
  updateDocMock: vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {}),
  useDocMock: vi.fn((_path: string | undefined) => ({ data: undefined as unknown, loading: false })),
  healthCheckMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, p: string) => ({ path: p }),
  setDoc: (ref: { path: string }, data: unknown, opts: unknown) => setDocMock(ref.path, data, opts),
  updateDoc: (ref: { path: string }, data: unknown) => updateDocMock(ref.path, data),
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));
vi.mock('@/lib/firebase/hooks', () => ({ useDoc: (path: string | undefined) => useDocMock(path) }));
vi.mock('@/lib/firebase/callables', () => ({ callable: (name: string) => (name === 'integrationsHealthCheck' ? healthCheckMock : vi.fn()) }));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

vi.mock('@/components/forms/schema-form', () => ({
  // `data-defaults` exposes what the dialog SEEDS the form with — the read half of the
  // operator-scoped config round trip Ruling BH would otherwise have deleted the write for.
  SchemaForm: (props: { idPrefix?: string; defaultValues?: Record<string, unknown>; onChange?: (v: Record<string, unknown>, valid: boolean) => void }) => (
    <div data-testid={`schema-form-${props.idPrefix}`} data-defaults={JSON.stringify(props.defaultValues ?? {})}>
      <button type="button" onClick={() => props.onChange?.({ hotelId: 'H1', chargeCode: 'C1', noPostBehavior: 'block' }, true)}>
        commit-config
      </button>
    </div>
  ),
}));
vi.mock('@/features/settings/secrets-card', () => ({
  SecretsCard: (props: { provider: string; venueId?: string }) => (
    <div data-testid="secrets-card" data-provider={props.provider} data-venueid={props.venueId ?? ''} />
  ),
}));

import { IntegrationConfigDialog } from '../integration-config-dialog';

const STRIPE = INTEGRATION_MANIFEST.find((m) => m.id === 'stripe')!;
const MAPBOX = INTEGRATION_MANIFEST.find((m) => m.id === 'mapbox')!;
const PLATE_RECOGNIZER = INTEGRATION_MANIFEST.find((m) => m.id === 'plate_recognizer')!;
const OPERA_CLOUD = INTEGRATION_MANIFEST.find((m) => m.id === 'opera_cloud')!;
const TOAST = INTEGRATION_MANIFEST.find((m) => m.id === 'toast')!;

const VENUES: Venue[] = [{ id: 'v1', name: 'St. Elmo' } as Venue, { id: 'v2', name: 'Conrad' } as Venue];

beforeEach(() => {
  setDocMock.mockReset().mockResolvedValue(undefined);
  updateDocMock.mockReset().mockResolvedValue(undefined);
  useDocMock.mockReset().mockReturnValue({ data: undefined, loading: false });
  healthCheckMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe('IntegrationConfigDialog', () => {
  it('a settings-managed provider (stripe) shows a link to Settings instead of a config form', () => {
    render(<IntegrationConfigDialog entry={STRIPE} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    expect(screen.getByText(/managed from/)).toBeInTheDocument();
    expect(screen.queryByTestId(`schema-form-integration-${STRIPE.id}`)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save configuration' })).not.toBeInTheDocument();
  });

  it('a settings-managed provider still offers Test connection', async () => {
    healthCheckMock.mockResolvedValue({ ok: true });
    render(<IntegrationConfigDialog entry={STRIPE} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => expect(healthCheckMock).toHaveBeenCalledWith({ provider: 'stripe' }));
  });

  it('a non-settings-managed operator-scoped provider (mapbox) renders the generic SchemaForm and a Save button', () => {
    render(<IntegrationConfigDialog entry={MAPBOX} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    expect(screen.getByTestId(`schema-form-integration-${MAPBOX.id}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save configuration' })).toBeInTheDocument();
  });

  it('saving an operator-scoped config writes to operators/{op}/integrations/{id} with merge:true', async () => {
    render(<IntegrationConfigDialog entry={PLATE_RECOGNIZER} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByText('commit-config'));
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1));
    const [path, data, opts] = setDocMock.mock.calls[0]!;
    expect(path).toBe('operators/goldstar/integrations/plate_recognizer');
    expect(data).toEqual({ config: { hotelId: 'H1', chargeCode: 'C1', noPostBehavior: 'block' } });
    expect(opts).toEqual({ merge: true });
  });

  it('renders SecretsCard for a provider with secretFields, without a venueId for an operator-scoped provider', () => {
    render(<IntegrationConfigDialog entry={PLATE_RECOGNIZER} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    const card = screen.getByTestId('secrets-card');
    expect(card).toHaveAttribute('data-provider', 'plate_recognizer');
    expect(card).toHaveAttribute('data-venueid', '');
  });

  it('a venue-scoped provider (opera_cloud) shows a venue selector and nothing else until a venue is chosen', () => {
    render(<IntegrationConfigDialog entry={OPERA_CLOUD} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText('Venue')).toBeInTheDocument();
    expect(screen.queryByTestId(`schema-form-integration-${OPERA_CLOUD.id}-v1`)).not.toBeInTheDocument();
    expect(screen.queryByTestId('secrets-card')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save configuration' })).not.toBeInTheDocument();
  });

  it('picking a venue reveals the PMS fields form, SecretsCard scoped to that venue, and a Save button', () => {
    render(<IntegrationConfigDialog entry={OPERA_CLOUD} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'v1' } });
    expect(screen.getByTestId(`schema-form-integration-${OPERA_CLOUD.id}-v1`)).toBeInTheDocument();
    const card = screen.getByTestId('secrets-card');
    expect(card).toHaveAttribute('data-provider', 'opera_cloud');
    expect(card).toHaveAttribute('data-venueid', 'v1');
    expect(screen.getByRole('button', { name: 'Save configuration' })).toBeInTheDocument();
  });

  it('RULING BH: a venue-scoped save writes ONLY venues/{id}.pms — no unread integrations mirror', async () => {
    render(<IntegrationConfigDialog entry={OPERA_CLOUD} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'v1' } });
    fireEvent.click(screen.getByText('commit-config'));
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [venuePath, venueData] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(venuePath).toBe('operators/goldstar/venues/v1');
    expect(venueData.pms).toEqual({ provider: 'opera_cloud', hotelId: 'H1', chargeCode: 'C1', noPostBehavior: 'block' });

    // The mirror to `integrations/opera_cloud_v1.config` is gone: nothing read it. Asserted as
    // "no setDoc at all" rather than "not that path", so re-adding it under ANY id fails here.
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('RULING BH: an OPERATOR-scoped save still writes integrations/{id}.config, which is read', async () => {
    // The same ruling named this write too. It has four readers — this dialog's own SchemaForm
    // defaults, healthCheck's scheduling ctx, scheduling/sync.ts and scheduling/pushClock.ts — and
    // an operator-scoped provider has no venue doc to hold its config instead. Pinned so a later
    // pass at "the BH cleanup" cannot take this one with it.
    render(<IntegrationConfigDialog entry={MAPBOX} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByText('commit-config'));
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));

    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1));
    const [integPath, , integOpts] = setDocMock.mock.calls[0]!;
    expect(integPath).toBe('operators/goldstar/integrations/mapbox');
    expect(integOpts).toEqual({ merge: true });
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('RULING BH: the operator-scoped form is seeded FROM that doc — the round trip that needs the write', async () => {
    useDocMock.mockImplementation((path?: string) =>
      path?.endsWith('/integrations/mapbox') ? { data: { config: { region: 'eu' } }, loading: false } : { data: undefined, loading: false },
    );
    render(<IntegrationConfigDialog entry={MAPBOX} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    expect(screen.getByTestId('schema-form-integration-mapbox')).toHaveAttribute('data-defaults', JSON.stringify({ region: 'eu' }));
  });

  it('Test connection for a venue-scoped provider is disabled until a venue is picked', () => {
    render(<IntegrationConfigDialog entry={TOAST} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled();
  });

  it('Test connection for a venue-scoped provider passes both provider and venueId once a venue is picked', async () => {
    healthCheckMock.mockResolvedValue({ ok: true });
    render(<IntegrationConfigDialog entry={TOAST} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'v1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => expect(healthCheckMock).toHaveBeenCalledWith({ provider: 'toast', venueId: 'v1' }));
  });

  it('RULING AV: the PMS dialog offers NO Test connection button at all — not even a disabled one', () => {
    render(<IntegrationConfigDialog entry={OPERA_CLOUD} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Test connection' })).not.toBeInTheDocument();
    expect(screen.getByText(/Connection testing isn't available/)).toBeInTheDocument();
  });

  it('RULING AV: picking a venue does not make the PMS test button appear', () => {
    render(<IntegrationConfigDialog entry={OPERA_CLOUD} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'v1' } });
    expect(screen.queryByRole('button', { name: 'Test connection' })).not.toBeInTheDocument();
  });

  it('RULING AV: the PMS dialog can never invoke integrationsHealthCheck', () => {
    // The button is the only caller. With it gone there is no path that stamps `health.ok:false`
    // + `lastError` on a PMS doc from this surface — which is what Ruling AC is protecting.
    render(<IntegrationConfigDialog entry={OPERA_CLOUD} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'v1' } });
    for (const button of screen.getAllByRole('button')) fireEvent.click(button);
    expect(healthCheckMock).not.toHaveBeenCalled();
  });

  it('RULING AC: the dialog badge reads "Not configured" for a venue with no PMS config', () => {
    useDocMock.mockImplementation((path?: string) =>
      path?.includes('/venues/') ? { data: { id: 'v1', name: 'St. Elmo' }, loading: false } : { data: undefined, loading: false },
    );
    render(<IntegrationConfigDialog entry={OPERA_CLOUD} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'v1' } });
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('N1: does NOT flash "Not configured" while the venue doc is still loading', () => {
    // `currentVenueConfig` reads `undefined` for "no PMS" AND for "not arrived yet". Without the
    // loading guard a CONFIGURED venue reads as unconfigured for as long as the fetch takes.
    useDocMock.mockImplementation((path?: string) =>
      path?.includes('/venues/') ? { data: undefined, loading: true } : { data: undefined, loading: false },
    );
    render(<IntegrationConfigDialog entry={OPERA_CLOUD} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'v1' } });
    expect(screen.queryByText('Not configured')).not.toBeInTheDocument();
    expect(screen.getByText('Not tested')).toBeInTheDocument();
  });

  it('N1: says "Not configured" once the load COMPLETES and the venue genuinely has none', () => {
    // The other side of the guard: withholding the state while loading must not swallow it after.
    useDocMock.mockImplementation((path?: string) =>
      path?.includes('/venues/') ? { data: { id: 'v1', name: 'St. Elmo' }, loading: false } : { data: undefined, loading: false },
    );
    render(<IntegrationConfigDialog entry={OPERA_CLOUD} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'v1' } });
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('RULING AC: the dialog badge stops saying "Not configured" once the venue carries config', () => {
    useDocMock.mockImplementation((path?: string) =>
      path?.includes('/venues/')
        ? { data: { id: 'v1', name: 'St. Elmo', pms: { provider: 'opera_cloud', hotelId: 'h1', chargeCode: 'V', noPostBehavior: 'block' } }, loading: false }
        : { data: undefined, loading: false },
    );
    render(<IntegrationConfigDialog entry={OPERA_CLOUD} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'v1' } });
    expect(screen.queryByText('Not configured')).not.toBeInTheDocument();
    expect(screen.getByText('Not tested')).toBeInTheDocument();
  });

  it('a failed save is sanitized via toast.error, never rendered as a raw string', async () => {
    setDocMock.mockRejectedValue(new Error('PERMISSION_DENIED: internal detail'));
    render(<IntegrationConfigDialog entry={MAPBOX} operatorId="goldstar" venues={VENUES} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByText('commit-config'));
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/PERMISSION_DENIED/)).not.toBeInTheDocument();
  });
});
