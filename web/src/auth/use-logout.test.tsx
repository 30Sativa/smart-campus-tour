import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/auth-store'
import { useLogout } from './use-logout'

function LogoutHarness() {
  const logout = useLogout()
  const location = useLocation()
  return (
    <>
      <output aria-label="Location">{location.pathname}</output>
      <button type="button" onClick={() => void logout()}>Sign out</button>
    </>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().logout()
})

describe('useLogout', () => {
  it('revokes the cookie session before clearing local auth and navigating', async () => {
    useAuthStore.getState().setAuth('token', { userId: 'user-1', username: 'staff', role: 'Staff' })
    let finish!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/staff']}><LogoutHarness /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/logout'), expect.objectContaining({ method: 'POST', credentials: 'include' }))
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(screen.getByLabelText('Location')).toHaveTextContent('/staff')

    finish(new Response(null, { status: 204 }))
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false))
    expect(screen.getByLabelText('Location')).toHaveTextContent('/')
  })

  it('still clears local auth and navigates if the logout request fails', async () => {
    useAuthStore.getState().setAuth('token', { userId: 'user-1', username: 'staff', role: 'Staff' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    render(<MemoryRouter initialEntries={['/staff']}><LogoutHarness /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false))
    expect(screen.getByLabelText('Location')).toHaveTextContent('/')
  })
})
