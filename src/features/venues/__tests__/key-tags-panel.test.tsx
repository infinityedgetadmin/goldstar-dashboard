import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { KeyTag } from '@goldstar/platform';

const useCollectionMock = vi.fn();
vi.mock('@/lib/firebase/hooks', () => ({ useCollection: (...args: unknown[]) => useCollectionMock(...args) }));

const callableFn = vi.fn();
vi.mock('@/lib/firebase/callables', () => ({ callable: () => callableFn }));

vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,fake') }));

const toBlobMock = vi.fn(async () => new Blob(['pdf-bytes']));
vi.mock('../key-tags-pdf', () => ({
  labelsForBatch: (tags: { id: string; value: string }[], opts: { venueName: string }) => [tags.map((t) => ({ ...t, venueName: opts.venueName }))],
  KeyTagSheet: () => null,
  pdf: () => ({ toBlob: toBlobMock }),
}));

import { KeyTagsPanel } from '../key-tags-panel';

function tag(over: Partial<KeyTag> = {}): KeyTag {
  return { id: over.id ?? 'k1', operatorId: 'goldstar', value: 'GS-V1-0001', venueId: 'v1', status: 'available', ...over };
}

beforeEach(() => {
  useCollectionMock.mockReset();
  callableFn.mockReset();
  toBlobMock.mockClear();
  // jsdom does not implement createObjectURL/revokeObjectURL by default.
  URL.createObjectURL = vi.fn(() => 'blob:fake-url');
  URL.revokeObjectURL = vi.fn();
});

describe('KeyTagsPanel', () => {
  it('N2: shows a printable batch derived from the live keyTags collection alone — no "Generate" click needed (survives a page reload)', async () => {
    useCollectionMock.mockReturnValue({
      data: [
        tag({ id: 'k1', value: 'GS-V1-0001', printedBatchId: 'batch-1' }),
        tag({ id: 'k2', value: 'GS-V1-0002', printedBatchId: 'batch-1' }),
      ],
      loading: false,
    });

    render(<KeyTagsPanel operatorId="goldstar" venueId="v1" venueName="St. Elmo" />);

    expect(screen.getByText(/Batch batch-1: GS-V1-0001 – GS-V1-0002 \(2 tags\)/)).toBeInTheDocument();
    expect(callableFn).not.toHaveBeenCalled(); // never called "Generate" — this batch came purely from the live collection

    fireEvent.click(screen.getByRole('button', { name: 'Print sheet (PDF)' }));
    await waitFor(() => expect(toBlobMock).toHaveBeenCalledTimes(1));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('groups tags into separate batches by printedBatchId and each prints independently', async () => {
    useCollectionMock.mockReturnValue({
      data: [
        tag({ id: 'k1', value: 'GS-V1-0001', printedBatchId: 'batch-1' }),
        tag({ id: 'k2', value: 'GS-V1-0051', printedBatchId: 'batch-2' }),
      ],
      loading: false,
    });

    render(<KeyTagsPanel operatorId="goldstar" venueId="v1" venueName="St. Elmo" />);

    expect(screen.getByText(/Batch batch-1: GS-V1-0001 – GS-V1-0001 \(1 tags\)/)).toBeInTheDocument();
    expect(screen.getByText(/Batch batch-2: GS-V1-0051 – GS-V1-0051 \(1 tags\)/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Print sheet (PDF)' })).toHaveLength(2);
  });

  it('shows no batches section when the venue has no key tags yet', () => {
    useCollectionMock.mockReturnValue({ data: [], loading: false });
    render(<KeyTagsPanel operatorId="goldstar" venueId="v1" venueName="St. Elmo" />);
    expect(screen.queryByText('Batches')).not.toBeInTheDocument();
  });

  it('generating a new batch calls the callable with the entered count/prefix', async () => {
    useCollectionMock.mockReturnValue({ data: [], loading: false });
    callableFn.mockResolvedValue({ batchId: 'batch-3', values: ['GS-V1-0001'] });
    render(<KeyTagsPanel operatorId="goldstar" venueId="v1" venueName="St. Elmo" />);

    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Prefix'), { target: { value: 'gs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => expect(callableFn).toHaveBeenCalledWith({ venueId: 'v1', count: 25, prefix: 'GS' }));
  });
});
