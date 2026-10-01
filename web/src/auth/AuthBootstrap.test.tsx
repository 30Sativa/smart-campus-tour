import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthBootstrap } from './AuthBootstrap'
import { useAuthStore } from '../stores/auth-store'

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().logout()
})

describe('AuthBootstrap', () => {
  it('restores the account from the refresh cookie once, including under StrictMode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accessToken: 'restored-token',
      userId: 'user-1',
      username: 'admin',
      role: 'Admin',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    render(<StrictMode><AuthBootstrap><p>Application</p></AuthBootstrap></StrictMode>)

    expect(screen.getByText('Application')).toBeInTheDocument()
    await waitFor(() => expect(useAuthStore.getState().isAuthReady).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
    })
    expect(useAuthStore.getState().user).toEqual({ userId: 'user-1', username: 'admin', role: 'Admin' })
  })

  it('starts signed out when no valid refresh cookie is available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))

    render(<AuthBootstrap><p>Application</p></AuthBootstrap>)

    await waitFor(() => expect(useAuthStore.getState().isAuthReady).toBe(true))
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})
