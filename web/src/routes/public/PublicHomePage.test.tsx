import { render, screen } from '@testing-library/react'
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

  it('offers the operations dashboard to a staff account', () => {
    useAuthStore.setState({
      accessToken: 'mock-token',
      isAuthenticated: true,
      user: { userId: 'user-1', username: 'admin', role: 'Admin' },
    })

    renderPage()

    expect(screen.getAllByRole('link', { name: /Ops Admin|^Admin$/ })[0]).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: /Vào trang điều hành/i })).toHaveAttribute('href', '/admin')
  })

  it('keeps the section anchors the navigation points at', () => {
    renderPage()

    for (const id of ['quy-trinh', 'tinh-nang', 'gioi-thieu', 'chi-so', 'robot', 'nen-tang', 'dat-tour', 'lien-he']) {
      expect(document.getElementById(id)).not.toBeNull()
    }
  })
})
