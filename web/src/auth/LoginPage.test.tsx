import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'
import { useAuthStore } from '../stores/auth-store'

function Destination() {
  return <output aria-label="Destination">{useLocation().pathname}</output>
}

const authResponse = (role = 'Staff') => new Response(JSON.stringify({
  accessToken: 'access-token.test',
  userId: 'user-1',
  username: 'staff',
  role,
}), { status: 200, headers: { 'Content-Type': 'application/json' } })

describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().logout()
  })

  const renderPage = () =>
    render(
      <MemoryRouter>
        <LoginPage />
        <Destination />
      </MemoryRouter>,
    )

  const fillCredentials = () => {
    fireEvent.change(screen.getByLabelText('Tên đăng nhập'), { target: { value: 'staff' } })
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'password' } })
  }

  it('renders the sign-in form and toggles password visibility', () => {
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
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))

    const username = await screen.findByLabelText('Tên đăng nhập')
    await waitFor(() => expect(username).toHaveAttribute('aria-invalid', 'true'))
    const describedBy = username.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)).toHaveTextContent('Vui lòng nhập tên đăng nhập')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts credentials to the backend with the refresh cookie enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(authResponse())
    vi.stubGlobal('fetch', fetchMock)
    renderPage()
    fillCredentials()

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))

    await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveTextContent('/staff'))
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/login'), expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ username: 'staff', password: 'password' }),
    }))
    expect(useAuthStore.getState().accessToken).toBe('access-token.test')
    expect(useAuthStore.getState().user).toEqual({ userId: 'user-1', username: 'staff', role: 'Staff' })
  })

  it('disables controls and ignores repeated submissions while signing in', async () => {
    let finish!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    const { container } = renderPage()
    fillCredentials()
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Đang đăng nhập...' })).toBeDisabled()
    expect(screen.getByLabelText('Tên đăng nhập')).toBeDisabled()
    expect(screen.getByLabelText('Mật khẩu')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Hiện mật khẩu' })).toBeDisabled()
    fireEvent.submit(container.querySelector('form')!)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    finish(authResponse())
    await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveTextContent('/staff'))
  })

  it.each([
    [new Response('private body', { status: 401 }), 'Tên đăng nhập hoặc mật khẩu không chính xác.', true],
    [new Response('private body', { status: 403 }), 'Tài khoản không thể truy cập hệ thống. Vui lòng liên hệ quản trị viên để được hỗ trợ.', false],
    [new TypeError('Failed to fetch'), 'Không thể kết nối đến hệ thống. Vui lòng thử lại.', false],
    [new Response('private body', { status: 500 }), 'Không đăng nhập được. Vui lòng thử lại sau ít phút.', false],
  ])('announces a safe message after a failed login', async (failure, message, invalid) => {
    const fetchMock = vi.fn()
    if (failure instanceof Response) fetchMock.mockResolvedValueOnce(failure)
    else fetchMock.mockRejectedValueOnce(failure)
    fetchMock.mockResolvedValueOnce(authResponse())
    vi.stubGlobal('fetch', fetchMock)
    renderPage()
    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    expect(alert).not.toHaveTextContent('private body')
    await waitFor(() => expect(alert).toHaveFocus())
    for (const label of ['Tên đăng nhập', 'Mật khẩu']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-describedby', alert.id)
      if (invalid) expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
      else expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid')
    }

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))
    await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveTextContent('/staff'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    ['Admin', '/admin'],
    ['Staff', '/staff'],
    ['Representative', '/dai-dien'],
  ])('lands a %s account in its home area', async (role, path) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(authResponse(role)))
    renderPage()
    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))

    await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveTextContent(path))
    expect(useAuthStore.getState().user?.role).toBe(role)
  })

  it('rejects roles outside the three Auth V1 roles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(authResponse('Visitor')))
    renderPage()
    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Không đăng nhập được. Vui lòng thử lại sau ít phút.')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('does not offer public self-registration', () => {
    renderPage()
    expect(screen.queryByRole('link', { name: 'Đăng ký' })).toBeNull()
  })
})
