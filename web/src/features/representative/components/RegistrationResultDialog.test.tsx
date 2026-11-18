import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router'
import { RegistrationResultDialog, type RegistrationResult } from './RegistrationResultDialog'

function LocationState() {
  const location = useLocation()
  return <output data-testid="location">{JSON.stringify({ path: location.pathname, search: location.search, state: location.state })}</output>
}
function setup(result?: RegistrationResult, pathname = '/dai-dien/dang-ky/registration') {
  render(<StrictMode><MemoryRouter initialEntries={[{ pathname, state: result ? { registrationResult: result, otherState: 'keep' } : undefined }]}>
    <RegistrationResultDialog /><LocationState />
  </MemoryRouter></StrictMode>)
}

describe('registration completion popup', () => {
  it('does not infer success from an ordinary detail visit or URL', () => {
    setup()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('does not show another registration’s result', () => {
    setup({ id: 'different-registration', kind: 'submitted' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('shows a confirmed submission, traps keyboard focus and consumes the result on Escape', async () => {
    setup({ id: 'registration', kind: 'submitted' })
    const dialog = screen.getByRole('dialog', { name: 'Đã gửi đăng ký' })
    const close = within(dialog).getByRole('button', { name: 'Xem hồ sơ' })
    const roster = within(dialog).getByRole('button', { name: 'Xem danh sách' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(roster).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const location = JSON.parse(screen.getByTestId('location').textContent!)
    expect(location.state).toEqual({ otherState: 'keep' })
    expect(location.path).toBe('/dai-dien/dang-ky/registration')
  })
  it.each([['updated', 'Đã lưu thay đổi'], ['resubmitted', 'Đã gửi lại đăng ký']] as const)('offers the roster after %s', async (kind, title) => {
    setup({ id: 'registration', kind })
    fireEvent.click(within(screen.getByRole('dialog', { name: title })).getByRole('button', { name: 'Xem danh sách' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const location = JSON.parse(screen.getByTestId('location').textContent!)
    expect(location.search).toBe('?tab=roster')
    expect(location.state).toEqual({ otherState: 'keep' })
  })
})
