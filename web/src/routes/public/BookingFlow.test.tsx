import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookingFlow from './BookingFlow';
import { bookingsApi } from '../../api/bookings-api';
import { routesApi, type TimeSlot, type TourRoute } from '../../api/routes-api';
import { useAuthStore } from '../../stores/auth-store';

vi.mock('../../api/bookings-api', () => ({
  bookingsApi: {
    createBooking: vi.fn(),
  },
}));

vi.mock('../../api/routes-api', () => ({
  routesApi: {
    getRouteById: vi.fn(),
    getRouteSlots: vi.fn(),
  },
}));

const route: TourRoute = {
  id: 'r1',
  name: 'Tour AI',
  description: 'Khám phá AI',
  estimatedMinutes: 45,
  status: 'Published',
  waypoints: [],
};

const slots: TimeSlot[] = [
  {
    id: 's1',
    routeId: 'r1',
    routeName: 'Tour AI',
    startTime: '2030-09-15T08:30:00',
    endTime: '2030-09-15T09:15:00',
    capacity: 12,
    available: 8,
    status: 'Open',
  },
  {
    id: 's2',
    routeId: 'r1',
    routeName: 'Tour AI',
    startTime: '2030-09-15T10:00:00',
    endTime: '2030-09-15T10:45:00',
    capacity: 12,
    available: 0,
    status: 'Open',
  },
];

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/tours/r1/book']}>
        <Routes>
          <Route path="/tours/:id/book" element={<BookingFlow />} />
          <Route path="/login" element={<p>Login destination</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function advanceToConfirmation() {
  fireEvent.click(await screen.findByRole('button', { name: 'Tiếp tục' }));
  const availableSlot = await screen.findByRole('button', { name: /08:30.*09:15/ });
  const soldOutSlot = screen.getByRole('button', { name: /10:00.*10:45/ });
  expect(soldOutSlot).toBeDisabled();
  fireEvent.click(availableSlot);
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
  await screen.findByRole('heading', { name: 'Xác nhận thông tin' });
}

describe('BookingFlow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(routesApi.getRouteById).mockResolvedValue(route);
    vi.mocked(routesApi.getRouteSlots).mockResolvedValue(slots);
    useAuthStore.setState({ isAuthenticated: false, user: null, accessToken: null });
  });

  it('keeps sold-out slots disabled and sends unauthenticated visitors to login', async () => {
    renderPage();
    await advanceToConfirmation();

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập để đặt tour' }));
    expect(await screen.findByText('Login destination')).toBeInTheDocument();
  });

  it('submits a selected slot with trimmed notes and shows confirmation', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 'u1', username: 'visitor', role: 'visitor' },
      accessToken: 'token',
    });
    vi.mocked(bookingsApi.createBooking).mockResolvedValue({
      id: 'b1',
      userId: 'u1',
      slotId: 's1',
      routeName: 'Tour AI',
      startTime: slots[0].startTime,
      endTime: slots[0].endTime,
      status: 'Confirmed',
      createdAt: '2030-09-14T10:00:00',
    });
    renderPage();
    await advanceToConfirmation();

    fireEvent.change(screen.getByPlaceholderText('Yêu cầu đặc biệt...'), {
      target: { value: '  Thuyết minh tiếng Việt  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đặt tour' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Đặt tour thành công!');
    expect(bookingsApi.createBooking).toHaveBeenCalledExactlyOnceWith({
      slotId: 's1',
      notes: 'Thuyết minh tiếng Việt',
    });
  });

  it('shows a retryable error when time slots are unavailable', async () => {
    vi.mocked(routesApi.getRouteSlots).mockRejectedValue(new Error('Offline'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải khung giờ');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});
