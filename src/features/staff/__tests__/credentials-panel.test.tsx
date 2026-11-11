import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Credentials } from '@goldstar/platform';

const updateDocMock = vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {});
const uploadBytesMock = vi.fn<(ref: { path: string }, file: File, meta: { contentType: string }) => Promise<void>>(async () => {});
const { toastMock } = vi.hoisted(() => ({ toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

/** Same "reject a bare `undefined` own key" guard as `venue-form.test.tsx` / `user-editor.test.tsx`. */
const DELETE_FIELD_SENTINEL = { __isDeleteFieldSentinel: true } as const;
function assertNoUndefinedFirestoreValue(data: unknown, path = ''): void {
  if (data === DELETE_FIELD_SENTINEL) return;
  if (data !== null && typeof data === 'object' && '__arrayUnion' in (data as Record<string, unknown>)) return;
  if (data === undefined) throw new Error(`Unsupported field value: undefined (found in field ${path || '(root)'})`);
  if (Array.isArray(data)) {
    data.forEach((v, i) => assertNoUndefinedFirestoreValue(v, `${path}[${i}]`));
    return;
  }
  if (data !== null && typeof data === 'object') {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      assertNoUndefinedFirestoreValue(v, path ? `${path}.${k}` : k);
    }
  }
}

vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, p: string) => ({ path: p }),
  deleteField: () => DELETE_FIELD_SENTINEL,
  arrayUnion: (v: unknown) => ({ __arrayUnion: v }),
  updateDoc: (ref: { path: string }, data: unknown) => {
    assertNoUndefinedFirestoreValue(data);
    return updateDocMock(ref.path, data);
  },
}));
vi.mock('firebase/storage', () => ({
  ref: (_storage: unknown, path: string) => ({ path }),
  uploadBytes: (ref: { path: string }, file: File, meta: { contentType: string }) => uploadBytesMock(ref, file, meta),
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {}, storage: {} }) }));

import { CredentialsPanel } from '../credentials-panel';

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

const FULL_CREDENTIALS: Credentials = {
  licenseNumber: 'L123',
  licenseState: 'IN',
  licenseClass: 'D',
  licenseExpiresAt: '2027-01-01T00:00:00.000Z',
  insuranceCarrier: 'Acme',
  insuranceExpiresAt: '2027-01-01T00:00:00.000Z',
  backgroundCheck: { status: 'approved', at: '2026-01-01T00:00:00.000Z' },
  endorsements: ['wheelchair'],
  documents: [{ kind: 'license', storagePath: 'operators/goldstar/users/u1/credentials/license-1.pdf', uploadedAt: '2026-01-01T00:00:00.000Z' }],
};

beforeEach(() => {
  updateDocMock.mockClear();
  uploadBytesMock.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  toastMock.info.mockClear();
});

describe('CredentialsPanel', () => {
  it('submits an edited license number as a dotted credentials.licenseNumber key', async () => {
    render(<CredentialsPanel operatorId="goldstar" uid="u1" credentials={FULL_CREDENTIALS} />);
    fireEvent.change(screen.getByLabelText('License number'), { target: { value: 'L999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save credentials' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [path, payload] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('operators/goldstar/users/u1');
    expect(payload['credentials.licenseNumber']).toBe('L999');
  });

  it('clearing a previously-set field sends deleteField(), not an omitted/undefined key', async () => {
    render(<CredentialsPanel operatorId="goldstar" uid="u1" credentials={FULL_CREDENTIALS} />);
    fireEvent.change(screen.getByLabelText('Carrier'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save credentials' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload['credentials.insuranceCarrier']).toBe(DELETE_FIELD_SENTINEL);
  });

  it('nothing touched at all → no updateDoc call (fix round 1: an untouched form has nothing to save, not an empty-ish write)', async () => {
    render(<CredentialsPanel operatorId="goldstar" uid="u1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save credentials' }));

    await waitFor(() => expect(toastMock.info).toHaveBeenCalledWith('Nothing to save.'));
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('a field that was never set stays omitted when a DIFFERENT field is edited (no deleteField spam)', async () => {
    render(<CredentialsPanel operatorId="goldstar" uid="u1" />);
    fireEvent.change(screen.getByLabelText('License number'), { target: { value: 'L1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save credentials' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload['credentials.licenseNumber']).toBe('L1');
    expect(Object.hasOwn(payload, 'credentials.insuranceCarrier')).toBe(false);
  });

  // Fix round 1 (task-6-review.md Major 2): the core regression this whole fix exists for — editing
  // ONE field must send ONLY that field's dotted path, so a concurrent admin's edit to any OTHER
  // field (backgroundCheck/endorsements included) can never be silently reverted by this save.
  it('editing only licenseExpiresAt sends a payload containing ONLY that dotted path', async () => {
    render(<CredentialsPanel operatorId="goldstar" uid="u1" credentials={FULL_CREDENTIALS} />);
    // Two inputs share the "Expires" label (License card, Insurance card) — the License one is first.
    const expiresInputs = screen.getAllByLabelText('Expires');
    fireEvent.change(expiresInputs[0]!, { target: { value: '2028-06-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save credentials' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(payload)).toEqual(['credentials.licenseExpiresAt']);
    expect(payload['credentials.licenseExpiresAt']).toBe('2028-06-01T00:00:00.000Z');
  });

  it('endorsements: comma-separated input splits into a trimmed array', async () => {
    render(<CredentialsPanel operatorId="goldstar" uid="u1" credentials={FULL_CREDENTIALS} />);
    fireEvent.change(screen.getByLabelText('Endorsements (comma-separated)'), { target: { value: 'wheelchair, child_seat ,  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save credentials' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload['credentials.endorsements']).toEqual(['wheelchair', 'child_seat']);
  });

  it('background check: status and checked-on date submit as one credentials.backgroundCheck object', async () => {
    render(<CredentialsPanel operatorId="goldstar" uid="u1" credentials={FULL_CREDENTIALS} />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'rejected' } });
    fireEvent.change(screen.getByLabelText('Checked on'), { target: { value: '2026-03-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save credentials' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateDocMock.mock.calls[0] as [string, { 'credentials.backgroundCheck': { status: string; at: string } }];
    expect(payload['credentials.backgroundCheck']).toMatchObject({ status: 'rejected', at: '2026-03-15T00:00:00.000Z' });
  });

  it('uploading a document stores it to Storage and appends to credentials.documents via arrayUnion', async () => {
    render(<CredentialsPanel operatorId="goldstar" uid="u1" credentials={FULL_CREDENTIALS} />);
    const file = new File(['%PDF-1.4'], 'insurance-card.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText('Upload insurance', { selector: 'input' }) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(uploadBytesMock).toHaveBeenCalledTimes(1));
    const [ref, , meta] = uploadBytesMock.mock.calls[0] as [{ path: string }, File, { contentType: string }];
    expect(ref.path).toMatch(/^operators\/goldstar\/users\/u1\/credentials\/insurance-\d+\.pdf$/);
    expect(meta.contentType).toBe('application/pdf');

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [path, payload] = updateDocMock.mock.calls[0] as [string, { 'credentials.documents': { __arrayUnion: { kind: string; storagePath: string } } }];
    expect(path).toBe('operators/goldstar/users/u1');
    expect(payload['credentials.documents'].__arrayUnion).toMatchObject({ kind: 'insurance' });
  });

  it('expiry chips: red under 7 days, amber under 30, none set when there is no credential yet', () => {
    const soon = daysFromNow(5);
    const mid = daysFromNow(20);
    render(<CredentialsPanel operatorId="goldstar" uid="u1" credentials={{ ...FULL_CREDENTIALS, licenseExpiresAt: soon, insuranceExpiresAt: mid }} />);
    expect(screen.getByText(/Expires in 5d|Expires in 4d/)).toBeInTheDocument();
    expect(screen.getByText(/Expires in 20d|Expires in 19d/)).toBeInTheDocument();
  });

  it('no expiry chip is shown when the field was never set', () => {
    render(<CredentialsPanel operatorId="goldstar" uid="u1" />);
    expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Expired/)).not.toBeInTheDocument();
  });
});
