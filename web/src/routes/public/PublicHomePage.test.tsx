import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import PublicHomePage from './PublicHomePage'
import { useAuthStore } from '../../stores/auth-store'

describe('PublicHomePage', () => {
  const renderPage = () => render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <PublicHomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  it('renders brand title and links to tours and auth', () => {
    renderPage()

    // Check brand logo/text
    expect(screen.getAllByText(/CampusTour/i)[0]).toBeInTheDocument()

    // Check link to explore tours
    const toursLink = screen.getByRole('link', { name: /Khám Phá Tour/i })
    expect(toursLink).toHaveAttribute('href', '/tours')

    // Check link to login
    const loginLink = screen.getByRole('link', { name: /Đăng nhập/i })
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('does not show visitor navigation controls for an admin account', () => {
    useAuthStore.setState({
      accessToken: 'admin-token',
      isAuthenticated: true,
      user: { userId: 'admin-1', username: 'admin', role: 'Admin' },
    })

    renderPage()

    expect(screen.queryByRole('link', { name: /Vé Của Tôi/i })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('link').some((link) => link.getAttribute('href') === '/my-bookings')).toBe(false)
    expect(screen.getAllByRole('link', { name: 'Admin' })[0]).toHaveAttribute('href', '/admin')
  })
})
