import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import RegisterPage from './RegisterPage'

describe('RegisterPage', () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

  it('asks only for the fields the auth contract actually carries', () => {
    renderPage()

    expect(screen.getByLabelText('Tên đăng nhập')).toBeInTheDocument()
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Xác nhận mật khẩu')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
  })

  it('reports a mismatched confirmation on the confirm field itself', async () => {
    renderPage()

    fireEvent.input(screen.getByLabelText('Mật khẩu'), { target: { value: 'matkhau123' } })
    fireEvent.input(screen.getByLabelText('Xác nhận mật khẩu'), { target: { value: 'matkhau124' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))

    const confirm = screen.getByLabelText('Xác nhận mật khẩu')
    await waitFor(() => expect(confirm).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('Mật khẩu nhập lại chưa khớp')).toBeInTheDocument()
  })

  it('keeps build state out of the sign-up composition', () => {
    const { container } = renderPage()

    // The page owns no build state at all now; the dev badge belongs to
    // AuthLayout and is covered by AuthLayout.test.tsx.
    const form = container.querySelector('form') as HTMLElement
    expect(within(form).queryByText(/mẫu/i)).toBeNull()
    expect(container.querySelector('[data-dev-only]')).toBeNull()
  })
})
