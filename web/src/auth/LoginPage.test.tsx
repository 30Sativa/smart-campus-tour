import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'
import { ApiError } from '../api/client'
import { MockAuthError, mockLogin, type AuthResponse } from '../mocks/auth-mock'
import { useAuthStore } from '../stores/auth-store'

vi.mock('../mocks/auth-mock', async (importOriginal) => ({
  ...await importOriginal<typeof import('../mocks/auth-mock')>(),
  mockLogin: vi.fn(),
}))

function Destination() {
  return <output aria-label="Destination">{useLocation().pathname}</output>
}

describe('LoginPage', () => {
  afterEach(() => {
    vi.resetAllMocks()
    useAuthStore.getState().logout()
  })

  const renderPage = () =>
    render(
      <MemoryRouter>
        <LoginPage />
        <Destination />
      </MemoryRouter>,
    )

  it('renders the staff sign-in form and toggles password visibility', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Chào mừng bạn trở lại' })).toBeInTheDocument()

    const password = screen.getByLabelText('Mật khẩu')
    expect(password).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toBeInTheDocument()
  })

  it('labels every field, so no input relies on its placeholder', () => {
    renderPage()

    expect(screen.getByLabelText('Tên đăng nhập')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('ties a validation message to the field it belongs to', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))

    const username = await screen.findByLabelText('Tên đăng nhập')
    await waitFor(() => expect(username).toHaveAttribute('aria-invalid', 'true'))

    const describedBy = username.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)).toHaveTextContent('Vui lòng nhập tên đăng nhập')
  })

  it('keeps build state out of the sign-in composition', () => {
    const { container } = renderPage()

    // Mock mode is still disclosed, but never inside the form a visitor reads.
    // The page owns no build state at all now; the dev badge belongs to
    // AuthLayout and is covered by AuthLayout.test.tsx.
    const form = container.querySelector('form') as HTMLElement
    expect(within(form).queryByText(/mẫu/i)).toBeNull()
    expect(container.querySelector('[data-dev-only]')).toBeNull()
  })

  it('offers the sign-up route now that the register screen exists', () => {
    renderPage()

    expect(screen.getByRole('link', { name: 'Đăng ký' })).toHaveAttribute('href', '/register')
  })

  const fillCredentials = () => {
    fireEvent.change(screen.getByLabelText('Tên đăng nhập'), { target: { value: 'staff' } })
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'staff' } })
  }

  it('disables controls and ignores repeated submissions while signing in', async () => {
    let finish!: (value: AuthResponse) => void
    vi.mocked(mockLogin).mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const { container } = renderPage()
    fillCredentials()
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Đang đăng nhập...' })).toBeDisabled()
    expect(screen.getByLabelText('Tên đăng nhập')).toBeDisabled()
    expect(screen.getByLabelText('Mật khẩu')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Hiện mật khẩu' })).toBeDisabled()
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Đang đăng nhập...' })).toBeDisabled()
    finish({ accessToken: 'mock-token', userId: 'staff', username: 'staff', role: 'Staff' })
    await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveTextContent('/staff'))
  })

  it.each([
    [new MockAuthError('internal fixture details'), 'Tên đăng nhập hoặc mật khẩu không chính xác.', true],
    [new ApiError(401, 'private response'), 'Tên đăng nhập hoặc mật khẩu không chính xác.', true],
    [new TypeError('Failed to fetch'), 'Không thể kết nối đến hệ thống. Vui lòng thử lại.', false],
    [new ApiError(403, 'private account status'), 'Tài khoản không thể truy cập hệ thống. Vui lòng liên hệ quản trị viên để được hỗ trợ.', false],
    [new Error('private stack'), 'Không đăng nhập được. Vui lòng thử lại sau ít phút.', false],
  ])('announces a safe message for %s and allows retry', async (error, message, invalid) => {
    vi.mocked(mockLogin).mockRejectedValue(error)
    renderPage()
    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    await waitFor(() => expect(alert).toHaveFocus())
    for (const label of ['Tên đăng nhập', 'Mật khẩu']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-describedby', alert.id)
      if (invalid) expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
      else expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid')
    }
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeEnabled()
    vi.mocked(mockLogin).mockResolvedValue({ accessToken: 'mock-token', userId: 'staff', username: 'staff', role: 'Staff' })
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveTextContent('/staff'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([['Admin', '/admin'], ['Staff', '/staff'], ['Visitor', '/visit']])('preserves the %s destination', async (role, path) => {
    vi.mocked(mockLogin).mockResolvedValue({ accessToken: 'mock-token', userId: 'demo', username: 'demo', role })
    renderPage()
    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    await waitFor(() => expect(screen.getByLabelText('Destination').textContent).toBe(path))
    expect(useAuthStore.getState().user?.role).toBe(role)
  })
})
