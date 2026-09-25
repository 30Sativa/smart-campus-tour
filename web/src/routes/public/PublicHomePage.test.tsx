import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import PublicHomePage from './PublicHomePage'
import { useAuthStore } from '../../stores/auth-store'

describe('PublicHomePage', () => {
  afterEach(() => useAuthStore.setState({ accessToken: null, user: null, isAuthenticated: false }))

  const renderPage = () => render(
    <MemoryRouter>
      <PublicHomePage />
    </MemoryRouter>,
  )

  it('sends a signed-out visitor to sign in, not to a removed visitor route', () => {
    renderPage()

    expect(screen.getAllByText(/CampusTour/i)[0]).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Đăng nhập$/i })).toHaveAttribute('href', '/login')

    // The hero and the closing band share one primary action, so both land on
    // the same door. Sign in is that door until a public booking route exists.
    const primaryCtas = screen.getAllByRole('link', { name: /Trải nghiệm Campus Tour/i })
    expect(primaryCtas.length).toBeGreaterThan(0)
    primaryCtas.forEach((cta) => expect(cta).toHaveAttribute('href', '/login'))

    expect(screen.queryAllByRole('link').some((link) => ['/tours', '/my-bookings', '/register'].includes(link.getAttribute('href') ?? ''))).toBe(false)
  })

  it('sends an operator to operations, not to administration', () => {
    useAuthStore.setState({
      accessToken: 'mock-token',
      isAuthenticated: true,
      user: { userId: 'user-2', username: 'operator', role: 'TourOperator' },
    })

    renderPage()

    expect(screen.getAllByRole('link', { name: /^Điều hành$/ })[0]).toHaveAttribute('href', '/staff')
    expect(screen.getByRole('link', { name: /Vào trang điều hành/i })).toHaveAttribute('href', '/staff')
    expect(screen.queryByRole('link', { name: /^Quản trị$/ })).toBeNull()
  })

  it('sends an admin to administration', () => {
    useAuthStore.setState({
      accessToken: 'mock-token',
      isAuthenticated: true,
      user: { userId: 'user-1', username: 'admin', role: 'Admin' },
    })

    renderPage()

    expect(screen.getAllByRole('link', { name: /^Quản trị$/ })[0]).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: /Vào trang quản trị/i })).toHaveAttribute('href', '/admin')
  })

  it('keeps the section anchors the navigation points at', () => {
    renderPage()

    // Section ids follow the 2026-09 home redesign (Himon layout).
    for (const id of ['trai-nghiem', 'giai-phap', 'quy-trinh', 'robot', 'cong-nghe', 'goc-ky-thuat', 'hoi-dap', 'dat-tour', 'lien-he']) {
      expect(document.getElementById(id)).not.toBeNull()
    }

    // Every in-page link lands on a section that exists.
    document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
      const href = link.getAttribute('href') ?? ''
      if (href.length > 1) expect(document.getElementById(href.slice(1))).not.toBeNull()
    })
  })

  it('keeps one experience open at a time and lets a visitor switch it', () => {
    renderPage()

    const first = screen.getByRole('button', { name: /Tham quan qua livestream/i })
    const second = screen.getByRole('button', { name: /Robot tự hành qua các POI/i })
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(second).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(second)
    expect(second).toHaveAttribute('aria-expanded', 'true')
    expect(first).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens one FAQ answer at a time', () => {
    renderPage()

    const q1 = screen.getByRole('button', { name: /cần tạo tài khoản/i })
    const q2 = screen.getByRole('button', { name: /điều khiển được robot/i })
    expect(q1).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(q2)
    expect(q2).toHaveAttribute('aria-expanded', 'true')
    expect(q1).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(q2)
    expect(q2).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the demo figures even when motion never runs', () => {
    renderPage()

    expect(screen.getAllByText('≥ 3').length).toBeGreaterThan(0)
    expect(document.querySelector('[data-count="30"]')?.textContent).toBe('30')
  })
})
