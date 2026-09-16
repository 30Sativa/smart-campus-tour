import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import AdminSidebar from './AdminSidebar';

describe('AdminSidebar', () => {
  it('shows only implemented admin destinations', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminSidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: 'Trực tiếp' })).toHaveAttribute('href', '/admin/live-operations');
    expect(screen.getByRole('link', { name: 'Lịch và phiên tour' })).toHaveAttribute('href', '/admin/schedule');
    expect(screen.getByRole('link', { name: 'Cảnh báo' })).toHaveAttribute('href', '/admin#alerts');
    expect(screen.getByRole('link', { name: 'Live Twin' })).toHaveAttribute('href', '/admin/digital-twin');
    expect(screen.queryByText('Cài đặt')).not.toBeInTheDocument();
    expect(screen.queryByText('Fleet')).not.toBeInTheDocument();
  });
});

