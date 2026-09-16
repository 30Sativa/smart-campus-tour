import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ToursPage from './ToursPage';
import { routesApi, type TourRoute } from '../../api/routes-api';
import { useAuthStore } from '../../stores/auth-store';

vi.mock('../../api/routes-api', () => ({
  routesApi: {
    getRoutes: vi.fn(),
  },
}));

const sampleRoutes: TourRoute[] = [
  {
    id: 'route-1',
    name: 'Tour Toàn Cảnh Smart Campus',
    description: 'Khám phá khuôn viên cùng robot AMR.',
    estimatedMinutes: 45,
    status: 'Published',
    waypoints: [
      {
        id: 'wp-1',
        order: 1,
        lat: 10.8415,
        lng: 106.8098,
        label: 'Cổng chính',
      },
    ],
  },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToursPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ToursPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ isAuthenticated: false, user: null, accessToken: null });
  });

  it('shows loading state and links published routes to their detail screens', async () => {
    vi.mocked(routesApi.getRoutes).mockResolvedValue(sampleRoutes);
    renderPage();

    expect(screen.getByRole('status', { name: 'Đang tải danh sách lộ trình' })).toBeInTheDocument();
    const routeLink = await screen.findByRole('link', { name: /Tour Toàn Cảnh Smart Campus/i });
    expect(routeLink).toHaveAttribute('href', '/tours/route-1');
    expect(screen.getByText('45 phút')).toBeInTheDocument();
    expect(screen.getByText('0 điểm tham quan')).toBeInTheDocument();
  });

  it('shows an empty state when no published route is available', async () => {
    vi.mocked(routesApi.getRoutes).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Chưa có tour mở đăng ký. Vui lòng quay lại sau.')).toBeInTheDocument();
  });

  it('shows a retry action when route loading fails', async () => {
    vi.mocked(routesApi.getRoutes)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(sampleRoutes);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh sách lộ trình');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('link', { name: /Tour Toàn Cảnh Smart Campus/i })).toBeInTheDocument();
  });
});


describe('Visitor catalog filters', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ isAuthenticated: false, user: null, accessToken: null });
  });

  it('combines accent-insensitive POI search and duration filters, then clears them', async () => {
    vi.mocked(routesApi.getRoutes).mockResolvedValue([
      ...sampleRoutes,
      { ...sampleRoutes[0], id: 'short-tour', name: 'Tour thư viện', estimatedMinutes: 25,
        waypoints: [{ ...sampleRoutes[0].waypoints[0], poi: { id: 'library', name: 'Thư viện số', description: 'Không gian đọc sách' } }] },
    ]);
    renderPage();
    await screen.findByRole('link', { name: /Tour thư viện/ });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'thu vien so' } });
    expect(screen.getByRole('link', { name: /Tour thư viện/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tour Toàn Cảnh/ })).not.toBeInTheDocument();
    expect(screen.getByText('1 điểm tham quan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trên 30 phút' }));
    expect(screen.getByText('Không tìm thấy hành trình phù hợp.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    expect(screen.getByRole('link', { name: /Tour Toàn Cảnh/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tour thư viện/ })).toBeInTheDocument();
  });

  it('includes the 30-minute boundary in short tours', async () => {
    vi.mocked(routesApi.getRoutes).mockResolvedValue([{ ...sampleRoutes[0], estimatedMinutes: 30 }]);
    renderPage();
    await screen.findByRole('link', { name: /Tour Toàn Cảnh/ });
    fireEvent.click(screen.getByRole('button', { name: 'Tối đa 30 phút' }));
    expect(screen.getByRole('link', { name: /Tour Toàn Cảnh/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trên 30 phút' }));
    expect(screen.queryByRole('link', { name: /Tour Toàn Cảnh/ })).not.toBeInTheDocument();
  });

  it('shows login for guests and keeps primary navigation available', async () => {
    vi.mocked(routesApi.getRoutes).mockResolvedValue([]);
    renderPage();
    await screen.findByText('Chưa có tour mở đăng ký. Vui lòng quay lại sau.');
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Điều hướng Visitor' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Điều hướng Visitor trên điện thoại' })).toBeInTheDocument();
  });
});
