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

  it('renders the sign-in route inside the shared auth composition', () => {
    const login = renderAt('/login')
    expect(login.container.querySelector('.auth-body')).not.toBeNull()
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
    expect(badge?.querySelectorAll('summary')).toHaveLength(1)
    expect(badge).toHaveTextContent('Dữ liệu nghiệp vụ mẫu')
    expect(badge).toHaveTextContent('các màn nghiệp vụ chưa nối backend vẫn dùng dữ liệu mẫu')
  })

  it('draws the aurora backdrop and the campus caption as decoration only', () => {
    const { container } = renderAt('/login')
    const aurora = container.querySelector('.auth-aurora')
    expect(aurora).toHaveAttribute('aria-hidden', 'true')
    expect(aurora?.querySelectorAll('.auth-aurora__photo')).toHaveLength(1)
    expect(aurora?.querySelectorAll('.auth-aurora__blob')).toHaveLength(3)
    expect(aurora?.querySelector('a, button, input, [tabindex]')).toBeNull()

    const caption = container.querySelector('.auth-caption')
    expect(caption).toHaveAttribute('aria-hidden', 'true')
    expect(caption?.querySelector('.auth-caption__title')?.textContent).toMatch(/Khám phá khuôn viên/)
    expect(caption?.querySelectorAll('.auth-caption__lead')).toHaveLength(1)
    expect(screen.getByText(/© \d{4} Smart Campus Tour/)).toBeInTheDocument()
  })

  it('places the form on the glass card', () => {
    const { container } = renderAt('/login')
    expect(container.querySelector('.auth-stage .auth-card .auth-col .auth-body form')).not.toBeNull()
  })
})
