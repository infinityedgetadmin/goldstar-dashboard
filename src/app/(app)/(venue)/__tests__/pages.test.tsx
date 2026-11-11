import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Each route is a thin wrapper around its feature component (which carries its own full test
// file under src/features/venue/__tests__); these tests only pin that each URL renders the RIGHT
// feature — a swapped import here would pass every feature test and still ship the wrong page.
vi.mock('@/features/venue/live-board', () => ({ LiveBoard: () => <div data-testid="feature">live-board</div> }));
vi.mock('@/features/venue/venue-requests', () => ({ VenueRequests: () => <div data-testid="feature">venue-requests</div> }));
vi.mock('@/features/venue/validations-panel', () => ({ ValidationsPanel: () => <div data-testid="feature">validations-panel</div> }));
vi.mock('@/features/venue/venue-reports', () => ({ VenueReports: () => <div data-testid="feature">venue-reports</div> }));
vi.mock('@/features/venue/venue-invoices', () => ({ VenueInvoices: () => <div data-testid="feature">venue-invoices</div> }));
vi.mock('@/features/venue/staffing-view', () => ({ StaffingView: () => <div data-testid="feature">staffing-view</div> }));
vi.mock('@/features/venue/hotel/hotel-view', () => ({ HotelView: () => <div data-testid="feature">hotel-view</div> }));

import LiveBoardPage from '../venue/page';
import RequestsPage from '../venue/requests/page';
import ValidationsPage from '../venue/validations/page';
import ReportsPage from '../venue/reports/page';
import InvoicesPage from '../venue/invoices/page';
import StaffingPage from '../venue/staffing/page';
import HotelPage from '../venue/hotel/page';

const pages = [
  [LiveBoardPage, 'live-board'],
  [RequestsPage, 'venue-requests'],
  [ValidationsPage, 'validations-panel'],
  [ReportsPage, 'venue-reports'],
  [InvoicesPage, 'venue-invoices'],
  [StaffingPage, 'staffing-view'],
  [HotelPage, 'hotel-view'],
] as const;

describe('venue portal routes', () => {
  it.each(pages)('renders its own feature component', (Page, expected) => {
    render(<Page />);
    expect(screen.getByTestId('feature')).toHaveTextContent(expected);
  });
});
