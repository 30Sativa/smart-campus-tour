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
    expect(screen.getByRole('link', { name: /Đăng nhập điều hành/i })).toHaveAttribute('href', '/login')
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
})
