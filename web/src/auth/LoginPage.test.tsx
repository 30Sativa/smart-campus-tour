import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import LoginPage from './LoginPage'

describe('LoginPage', () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <LoginPage />
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

    expect(screen.getByRole('link', { name: 'Tham gia bằng lời mời' })).toHaveAttribute('href', '/join')
  })
})
