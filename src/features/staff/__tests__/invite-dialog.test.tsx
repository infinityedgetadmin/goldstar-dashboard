import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const invite = vi.fn(async () => ({ inviteId: 'i1' })); vi.mock('@/lib/firebase/callables', () => ({ callable: () => invite }));
import { InviteDialog } from '../invite-dialog';
it('submits roles and venues', async () => {
  render(<InviteDialog open onOpenChange={() => {}} venues={[{ id: 'v1', name: 'St. Elmo' }]} />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@x.example.com' } }); fireEvent.click(screen.getByRole('checkbox', { name: 'Attendant' })); fireEvent.click(screen.getByRole('checkbox', { name: 'Driver' })); fireEvent.click(screen.getByRole('checkbox', { name: 'St. Elmo' })); fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
  await waitFor(() => expect(invite).toHaveBeenCalledWith({ email: 'new@x.example.com', roles: ['attendant', 'driver'], venueIds: ['v1'], displayName: undefined }));
});
