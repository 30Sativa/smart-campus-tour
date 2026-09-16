import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import LoginPage from './LoginPage';

describe('LoginPage', () => {
  const renderPage = () => render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );

  it('renders the staff sign-in form and toggles password visibility', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Đăng nhập CampusTour' })).toBeInTheDocument();

    const password = screen.getByPlaceholderText('Nhập mật khẩu');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toBeInTheDocument();
  });

  it('says that sign-in is running on mock data instead of presenting it as real auth', () => {
    renderPage();

    expect(screen.getByText(/đăng nhập mẫu/i)).toBeInTheDocument();
  });

  it('no longer offers self-registration, which has no backend and no visitor app', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: 'Tạo tài khoản' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đăng ký ngay' })).not.toBeInTheDocument();
  });
});
