import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AuthLayout } from './AuthLayout'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'

describe('AuthLayout', () => {
  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

  it('wraps both auth routes, so the switch changes content rather than the page', () => {
    const login = renderAt('/login')
    expect(login.container.querySelector('.auth-body')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Chào mừng bạn trở lại' })).toBeInTheDocument()
    login.unmount()

    const register = renderAt('/register')
    expect(register.container.querySelector('.auth-body')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Tạo tài khoản' })).toBeInTheDocument()
  })

  it('carries the brand once, inside the auth column rather than the form', () => {
    const { container } = renderAt('/login')

    expect(container.querySelectorAll('.auth-brand')).toHaveLength(1)
    expect(container.querySelector('.auth-col .auth-brand')).not.toBeNull()
    expect(container.querySelector('form .auth-brand')).toBeNull()
  })

  it('keeps the development badge outside the auth column entirely', () => {
    const { container } = renderAt('/login')

    const badge = container.querySelector('[data-dev-only]')
    expect(badge).not.toBeNull()
    expect(container.querySelector('.auth-col [data-dev-only]')).toBeNull()
    expect(container.querySelector('form [data-dev-only]')).toBeNull()
  })

  it('changes the copy over the photograph with the route', () => {
    const login = renderAt('/login')
    expect(login.container.querySelector('.auth-visual__title')?.textContent).toMatch(/Khám phá khuôn viên/)
    expect(login.container.querySelector('.auth-visual__img')).toHaveAttribute('src', '/images/login-bg.jpg')
    expect(screen.getByText(/© \d{4} Smart Campus Tour/)).toBeInTheDocument()
    login.unmount()

    const register = renderAt('/register')
    expect(register.container.querySelector('.auth-visual__title')?.textContent).toMatch(/khám phá/i)
    expect(register.container.querySelector('.auth-visual__img')).toHaveAttribute('src', '/images/hero-campus.jpg')
  })
})
