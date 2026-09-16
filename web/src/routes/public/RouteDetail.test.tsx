import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RouteDetail from './RouteDetail';
import { routesApi, type TourRoute } from '../../api/routes-api';

vi.mock('../../api/routes-api', () => ({ routesApi: { getRouteById: vi.fn() } }));
const route: TourRoute = {
  id: 'campus', name: 'Tour campus', description: 'Khám phá campus', estimatedMinutes: 30, status: 'Published',
  waypoints: [
    { id: 'library', order: 2, lat: 0, lng: 0, label: 'Thư viện', poi: { id: 'poi', name: 'Không gian đọc', description: 'Sách và tài liệu' } },
    { id: 'gate', order: 1, lat: 0, lng: 0, label: 'Cổng trường' },
  ],
};
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/tours/campus']}><Routes><Route path="/tours/:id" element={<RouteDetail />} /></Routes></MemoryRouter></QueryClientProvider>);
}
describe('RouteDetail', () => {
  beforeEach(() => vi.resetAllMocks());
  it('orders the itinerary and links to booking without counting transit waypoints as POIs', async () => {
    vi.mocked(routesApi.getRouteById).mockResolvedValue(route);
    renderPage();
    expect(screen.getByRole('status', { name: 'Đang tải chi tiết lộ trình' })).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Tour campus' });
    expect(screen.getByText('1 điểm tham quan')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Cổng trường');
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Thư viện');
    expect(screen.getByRole('link', { name: /Chọn ngày & giờ/ })).toHaveAttribute('href', '/tours/campus/book');
  });
  it('allows retry after a failed detail request', async () => {
    vi.mocked(routesApi.getRouteById).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(route);
    renderPage();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: 'Tour campus' })).toBeInTheDocument();
  });
});
