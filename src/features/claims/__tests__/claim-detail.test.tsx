import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Claim, Ticket } from '@goldstar/platform';

const updateDocMock = vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {});
vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, p: string) => ({ path: p }),
  updateDoc: (ref: { path: string }, data: unknown) => updateDocMock(ref.path, data),
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

let mockSession: { claims?: { operatorId: string; roles: string[]; venueIds: string[] }; uid?: string } = {};
vi.mock('@/features/auth/use-session', () => ({ useSession: () => mockSession }));

const OP = 'goldstar';
const TID = '01912345-7abc-7def-8123-456789abcdef';
const CID = '01912345-7abc-7def-8123-456789ab0002';
const V1 = 'v1';
const NOW = '2026-08-23T21:00:00.000Z';

function claimDoc(over: Partial<Claim> = {}): Claim {
  return {
    id: CID,
    operatorId: OP,
    ticketId: TID,
    status: 'intake',
    reportedAt: NOW,
    description: 'Scratch on rear bumper found at pickup.',
    allegedDamage: [{ panel: 'rear_bumper', kind: 'scratch', description: 'Deep scratch' }],
    guestContact: { name: 'Jamie Guest', phone: '+13175550123' },
    createdBy: 'att1',
    createdAt: NOW,
    ...over,
  } as Claim;
}

function ticketDoc(): Ticket {
  return {
    id: TID,
    operatorId: OP,
    venueId: V1,
    jobType: 'valet',
    status: 'delivered',
    source: 'staff',
    guest: { phoneLast4: '0123', consentSms: true, name: 'Jamie Guest' },
    vehicle: { plate: 'ABC123', make: 'Honda', model: 'Civic', color: 'Blue' },
    flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
    attendants: {},
    times: { checkedInAt: NOW },
    damageReportIds: [],
    incidentIds: [],
    guestToken: 'x'.repeat(22),
  } as unknown as Ticket;
}

let currentClaim: Claim | undefined;
const useDocMock = vi.fn((path: string | undefined) => {
  if (!path) return { data: undefined, loading: false };
  if (path.includes('/claims/')) return { data: currentClaim, loading: false };
  if (path.includes('/tickets/')) return { data: ticketDoc(), loading: false };
  if (path.includes('/venues/')) return { data: { timezone: 'America/Indiana/Indianapolis', name: 'St. Elmo' }, loading: false };
  return { data: undefined, loading: false };
});
vi.mock('@/lib/firebase/hooks', () => ({ useDoc: (path: string | undefined) => useDocMock(path) }));

const callableFn = vi.fn();
vi.mock('@/lib/firebase/callables', () => ({ callable: () => callableFn }));

vi.mock('@/features/tickets/use-storage-photo-url', () => ({
  useStoragePhotoUrl: (path: string | undefined) => (path ? { url: `https://storage.example/${path}`, loading: false } : { url: undefined, loading: false }),
}));

import { ClaimDetail } from '../claim-detail';

beforeEach(() => {
  updateDocMock.mockReset();
  callableFn.mockReset();
  callableFn.mockResolvedValue({ entries: [] }); // default: auditQuery timeline fetch
  currentClaim = claimDoc();
});

describe('ClaimDetail', () => {
  it('renders claim status, description, and alleged damage for a manager (lead)', async () => {
    mockSession = { claims: { operatorId: OP, roles: ['lead'], venueIds: [V1] }, uid: 'lead1' };
    render(<ClaimDetail claimId={CID} />);
    expect(screen.getAllByText('Intake').length).toBeGreaterThan(0);
    expect(screen.getByText('Scratch on rear bumper found at pickup.')).toBeInTheDocument();
    expect(await screen.findByText(/rear bumper — scratch: Deep scratch/)).toBeInTheDocument();
  });

  it('a lead sees no status actions, no adjudication form, and no evidence panel (admin+ only)', async () => {
    mockSession = { claims: { operatorId: OP, roles: ['lead'], venueIds: [V1] }, uid: 'lead1' };
    render(<ClaimDetail claimId={CID} />);
    await waitFor(() => expect(callableFn).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Move to review' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Adjudication notes')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate bundle' })).not.toBeInTheDocument();
  });

  it('an admin viewing an intake claim can move it to under_review, writing {status, updatedBy}', async () => {
    mockSession = { claims: { operatorId: OP, roles: ['owner'], venueIds: [] }, uid: 'admin1' };
    render(<ClaimDetail claimId={CID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move to review' }));
    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [path, data] = updateDocMock.mock.calls[0]!;
    expect(path).toBe(`operators/${OP}/claims/${CID}`);
    // `updatedBy` is a handler-only field (onClaimWritten reads it to suppress self-notification) —
    // never part of claimSchema.
    expect(data).toEqual({ status: 'under_review', updatedBy: 'admin1' });
  });

  it('an admin viewing an under_review claim sees Accept/Deny and Accept writes {status: "accepted", updatedBy}', async () => {
    currentClaim = claimDoc({ status: 'under_review' });
    mockSession = { claims: { operatorId: OP, roles: ['admin'], venueIds: [] }, uid: 'admin1' };
    render(<ClaimDetail claimId={CID} />);
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    expect(updateDocMock.mock.calls[0]![1]).toEqual({ status: 'accepted', updatedBy: 'admin1' });
  });

  it('a settled claim (terminal) shows no status action buttons', async () => {
    currentClaim = claimDoc({ status: 'settled', adjudication: { notes: 'Paid out', decidedBy: 'admin1', decidedAt: NOW, amount: 5000 } });
    mockSession = { claims: { operatorId: OP, roles: ['owner'], venueIds: [] }, uid: 'admin1' };
    render(<ClaimDetail claimId={CID} />);
    await waitFor(() => expect(callableFn).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Move to review' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark settled' })).not.toBeInTheDocument();
  });

  it('an admin can save adjudication notes and an amount, auto-attributing decidedBy to their own uid', async () => {
    mockSession = { claims: { operatorId: OP, roles: ['owner'], venueIds: [] }, uid: 'admin1' };
    render(<ClaimDetail claimId={CID} />);
    fireEvent.change(screen.getByLabelText('Adjudication notes'), { target: { value: 'Reviewed photos, damage confirmed.' } });
    fireEvent.change(screen.getByLabelText('Settlement amount in dollars'), { target: { value: '75.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save adjudication' }));
    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [path, data] = updateDocMock.mock.calls[0]!;
    expect(path).toBe(`operators/${OP}/claims/${CID}`);
    expect(data).toMatchObject({ adjudication: { notes: 'Reviewed photos, damage confirmed.', decidedBy: 'admin1', amount: 7550 } });
  });

  it('"Generate bundle" calls the claimsGenerateBundle callable with the claim id', async () => {
    mockSession = { claims: { operatorId: OP, roles: ['owner'], venueIds: [] }, uid: 'admin1' };
    callableFn.mockResolvedValueOnce({ entries: [] }); // timeline auditQuery
    callableFn.mockResolvedValueOnce({ pdfPath: 'x', zipPath: 'y' }); // claimsGenerateBundle
    render(<ClaimDetail claimId={CID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate bundle' }));
    await waitFor(() => expect(callableFn).toHaveBeenCalledWith({ claimId: CID }));
  });

  it('renders PDF and ZIP download links once the claim has an evidenceBundle', async () => {
    currentClaim = claimDoc({
      evidenceBundle: { pdfPath: `operators/${OP}/claims/${CID}/evidence.pdf`, zipPath: `operators/${OP}/claims/${CID}/evidence.zip`, generatedAt: NOW, sha256: 'a'.repeat(64) },
    });
    mockSession = { claims: { operatorId: OP, roles: ['owner'], venueIds: [] }, uid: 'admin1' };
    render(<ClaimDetail claimId={CID} />);
    const pdfLink = await screen.findByRole('link', { name: 'Download PDF' });
    expect(pdfLink).toHaveAttribute('href', `https://storage.example/operators/${OP}/claims/${CID}/evidence.pdf`);
    const zipLink = screen.getByRole('link', { name: 'Download originals (.zip)' });
    expect(zipLink).toHaveAttribute('href', `https://storage.example/operators/${OP}/claims/${CID}/evidence.zip`);
    expect(screen.getByText(/SHA-256: a{64}/)).toBeInTheDocument();
  });

  it('claim not found renders an empty state with a link back to the claims list', () => {
    currentClaim = undefined;
    mockSession = { claims: { operatorId: OP, roles: ['owner'], venueIds: [] }, uid: 'admin1' };
    render(<ClaimDetail claimId={CID} />);
    expect(screen.getByText('Claim not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to claims' })).toHaveAttribute('href', '/claims');
  });
});
