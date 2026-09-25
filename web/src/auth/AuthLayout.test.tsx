import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AuthLayout } from './AuthLayout'
import LoginPage from './LoginPage'

describe('AuthLayout', () => {
  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

  it('wraps the sign-in route', () => {
    const { container } = renderAt('/login')
    expect(container.querySelector('.auth-body')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Chào mừng bạn trở lại' })).toBeInTheDocument()
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

  it('shows the campus copy and photograph beside the form', () => {
    const { container } = renderAt('/login')
    expect(container.querySelector('.auth-visual__title')?.textContent).toMatch(/Khám phá khuôn viên/)
    expect(container.querySelector('.auth-visual__img')).toHaveAttribute('src', '/images/login-bg.jpg')
    expect(screen.getByText(/© \d{4} Smart Campus Tour/)).toBeInTheDocument()
  })
})
