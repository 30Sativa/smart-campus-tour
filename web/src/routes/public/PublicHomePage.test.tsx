import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PublicHomePage from './PublicHomePage'
import { useAuthStore } from '../../stores/auth-store'
import { useThemeStore } from '../../stores/theme-store'

describe('PublicHomePage', () => {
  afterEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, isAuthenticated: false })
    useThemeStore.setState({ theme: 'light' })
    document.documentElement.classList.remove('dark')
    delete document.documentElement.dataset.themeWave
    Reflect.deleteProperty(document, 'startViewTransition')
  })

  const renderPage = () => render(
    <MemoryRouter>
      <PublicHomePage />
    </MemoryRouter>,
  )

  it('sends a signed-out visitor to sign in, not to a removed visitor route', () => {
    renderPage()

    expect(screen.getAllByText(/CampusTour/i)[0]).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Đăng nhập$/i })).toHaveAttribute('href', '/login')

    expect(screen.getByRole('link', { name: /Xem hành trình/i })).toHaveAttribute('href', '#quy-trinh')
    // The closing action still enters through sign-in until a public route exists.
    const primaryCtas = screen.getAllByRole('link', { name: /Đăng nhập đại diện/i })
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

    for (const id of ['quy-trinh', 'trai-nghiem', 'gioi-thieu', 'cong-nghe', 'dat-tour', 'lien-he']) {
      expect(document.getElementById(id)).not.toBeNull()
    }
  })

  it('explains the remote tour without suggesting students follow the robot in person', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /Cả lớp cùng khám phá/i })).toBeInTheDocument()
    expect(screen.getAllByText(/bản đồ 2D và trợ lý AI riêng/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Mô hình hành trình minh họa/i)).toBeInTheDocument()
  })

  it('reveals the new theme from the theme button when view transitions are available', async () => {
    let finish: (() => void) | undefined
    const startViewTransition = vi.fn((update: () => void) => {
      update()
      return { finished: new Promise<void>((resolve) => { finish = resolve }) }
    })
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    })
    document.documentElement.classList.add('light')
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang giao diện tối' }))

    expect(startViewTransition).toHaveBeenCalledOnce()
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement).toHaveAttribute('data-theme-wave')
    expect(document.documentElement.style.getPropertyValue('--theme-wave-radius')).not.toBe('')

    finish?.()
    await waitFor(() => expect(document.documentElement).not.toHaveAttribute('data-theme-wave'))
  })
})
