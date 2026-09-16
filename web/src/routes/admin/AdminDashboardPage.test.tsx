import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import AdminDashboardPage from './AdminDashboardPage';

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AdminDashboardPage />
    </MemoryRouter>,
  );
}

describe('AdminDashboardPage', () => {
  it('renders a labelled single-AMR operational overview', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Chào mừng trở lại, BayFi!' })).toBeInTheDocument();
    expect(screen.getAllByText('Dữ liệu mô phỏng')).not.toHaveLength(0);
    expect(screen.getAllByText('AMR-01')).not.toHaveLength(0);
    expect(screen.getByText('1 AMR vật lý')).toBeInTheDocument();
    expect(screen.getByText('Cập nhật 8 giây trước')).toBeInTheDocument();
    expect(screen.queryByText('8 / 12')).not.toBeInTheDocument();
    expect(screen.queryByText(/uptime/i)).not.toBeInTheDocument();
  });

  it('shows SRS-backed state text and operational context', () => {
    renderDashboard();

    expect(screen.getByText('Nhiệm vụ')).toBeInTheDocument();
    expect(screen.getAllByText('Navigating')).not.toHaveLength(0);
    expect(screen.getAllByText('Live')).not.toHaveLength(0);
    expect(screen.getByText('Điều hướng bị gián đoạn tại POI-02')).toBeInTheDocument();
    expect(screen.getByText('Cloud Storage đang ở trạng thái suy giảm')).toBeInTheDocument();
    expect(screen.getByText('Review không tự động áp dụng cấu hình.')).toBeInTheDocument();
  });

  it('renders the schedule table and expands a Tour Session row', () => {
    renderDashboard();

    expect(screen.getByRole('columnheader', { name: 'Thời gian' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Visitor / Booking' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Session' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'AMR' })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Xem' })[0]);
    expect(screen.getByText('Route version:', { selector: 'strong' })).toBeInTheDocument();
  });

  it('links to the implemented Digital Twin route without exposing an unsupported E-Stop control', () => {
    renderDashboard();

    expect(screen.getByRole('link', { name: 'Mở Digital Twin' })).toHaveAttribute('href', '/admin/digital-twin');
    expect(screen.queryByRole('button', { name: /E-Stop|dừng khẩn cấp/i })).not.toBeInTheDocument();
  });
});

