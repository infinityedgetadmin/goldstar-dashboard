import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
const create = vi.fn(async () => ({ operatorId: 'valetb', inviteId: 'i1' }));
vi.mock('@/lib/firebase/callables', () => ({ callable: (n: string) => (n === 'platformCreateOperator' ? create : vi.fn()) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { OnboardingWizard } from '../onboarding-wizard';
describe('OnboardingWizard', () => {
  it('walks identity → plan → modules → creates operator with defaults and owner invite', async () => {
    render(<OnboardingWizard />);
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Valet Co B' } }); fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'valetb' } }); fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'America/Chicago' } }); fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // plan default standard
    fireEvent.click(screen.getByRole('checkbox', { name: 'Drive-home' })); fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('Owner email'), { target: { value: 'owner@valetb.example.com' } }); fireEvent.change(screen.getByLabelText('Owner name'), { target: { value: 'Pat' } }); fireEvent.click(screen.getByRole('button', { name: 'Create operator' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Valet Co B', slug: 'valetb', timezone: 'America/Chicago', currency: 'USD', plan: 'standard', ownerEmail: 'owner@valetb.example.com', features: expect.objectContaining({ driveHome: false }), branding: expect.objectContaining({ primaryColor: '#ab6034' }) })));
    expect(await screen.findByText(/invitation sent to owner@valetb.example.com/i)).toBeInTheDocument();
  });
});
