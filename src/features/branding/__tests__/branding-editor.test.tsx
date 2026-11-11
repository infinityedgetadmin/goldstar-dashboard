import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
// Typed with its real (path, data) call signature via vi.fn's generic — task-4-brief.md's given
// `vi.fn(async () => {})` infers a zero-argument mock from its implementation, which doesn't
// type-check against how it's actually invoked below (`update(ref.path, d)`). The assertions
// themselves are unchanged.
const update = vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {});
vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, p: string) => ({ path: p }),
  updateDoc: (ref: { path: string }, d: unknown) => update(ref.path, d),
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {}, storage: {} }) }));
vi.mock('@/features/auth/use-session', () => ({
  useSession: () => ({
    claims: { operatorId: 'goldstar', roles: ['owner'] },
    operator: { id: 'goldstar', branding: { displayName: 'Goldstar', primaryColor: '#ab6034', accentColor: '#ffc30c' } },
  }),
}));
import { BrandingEditor } from '../branding-editor';
describe('BrandingEditor', () => {
  it('saves branding and warns on low-contrast primary', async () => {
    render(<BrandingEditor />);
    fireEvent.change(screen.getByLabelText('Primary color'), { target: { value: '#ffe4b5' } });
    expect(await screen.findByText(/low contrast/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Primary color'), { target: { value: '#1d4ed8' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Goldstar Valet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save branding' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        'operators/goldstar',
        expect.objectContaining({ 'branding.displayName': 'Goldstar Valet', 'branding.primaryColor': '#1d4ed8' }),
      ),
    );
  });
});
