import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MyBookingsPage from './MyBookingsPage';
import { bookingsApi } from '../../api/bookings-api';
import { useAuthStore } from '../../stores/auth-store';

vi.mock('../../api/bookings-api', () => ({
  bookingsApi: {
    getMyBookings: vi.fn(),
    cancelBooking: vi.fn(),
    submitFeedback: vi.fn(),
  },
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MyBookingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MyBookingsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({
      accessToken: 'dummy-token',
      user: { userId: 'u1', username: 'tester', role: 'visitor' },
      isAuthenticated: true,
    });
  });

  it('renders an upcoming booking with status and a route action', async () => {
    vi.mocked(bookingsApi.getMyBookings).mockResolvedValue([
      {
        id: 'booking-12345678-abcd',
        userId: 'u1',
        slotId: 'slot-1',
        routeName: 'Tour Toàn Cảnh Smart Campus',
        startTime: '2030-09-15T08:30:00',
        endTime: '2030-09-15T09:15:00',
        status: 'Confirmed',
        createdAt: '2030-09-14T00:00:00',
      },
    ]);
    renderPage();

    expect(await screen.findByText('Tour Toàn Cảnh Smart Campus')).toBeInTheDocument();
    expect(screen.getByText('Sắp khởi hành')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Khám phá thêm' })).toHaveAttribute('href', '/tours');
  });
});
