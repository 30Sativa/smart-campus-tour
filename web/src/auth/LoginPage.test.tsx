import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import LoginPage from './LoginPage';

describe('LoginPage', () => {
  it('renders login, toggles password visibility, and opens registration mode', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Đăng nhập CampusTour' })).toBeInTheDocument();

    const password = screen.getByPlaceholderText('Nhập mật khẩu');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect(await screen.findByRole('heading', { name: 'Tạo tài khoản' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Đăng ký ngay' })).toBeInTheDocument();
  });
});
