import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { useAuthStore } from '../stores/auth-store'

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().logout()
})

describe('API response bodies', () => {
  it('accepts the empty response returned by logout and includes its cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient('/api/auth/logout', { method: 'POST', credentials: 'include' })).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/logout'), expect.objectContaining({ credentials: 'include', method: 'POST' }))
  })

  it('continues to parse JSON data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 'tour' })))
    await expect(apiClient('/api/routes/tour')).resolves.toEqual({ id: 'tour' })
  })

  it('does not silently accept malformed nonempty JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid', { status: 200 })))
    await expect(apiClient('/api/routes/tour')).rejects.toThrow()
  })

  it('shares one refresh between concurrent unauthorized requests and retries with the new token', async () => {
    useAuthStore.getState().setAuth('old-token', { userId: 'user-1', username: 'staff', role: 'Staff' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/auth/refresh')) {
        return jsonResponse({ accessToken: 'new-token', userId: 'user-1', username: 'staff', role: 'Staff' })
      }
      const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization
      if (authorization === 'Bearer new-token') return jsonResponse({ ok: true })
      return new Response(null, { status: 401 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await Promise.all([apiClient('/api/one'), apiClient('/api/two')])

    expect(results).toEqual([{ ok: true }, { ok: true }])
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/auth/refresh'))).toHaveLength(1)
    expect(fetchMock.mock.calls.filter(([, init]) => (init?.headers as Record<string, string> | undefined)?.Authorization === 'Bearer new-token')).toHaveLength(2)
    expect(useAuthStore.getState().accessToken).toBe('new-token')
  })

  it('clears the local session when the refresh cookie is rejected', async () => {
    useAuthStore.getState().setAuth('expired-token', { userId: 'user-1', username: 'staff', role: 'Staff' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/api/auth/refresh') ? new Response(null, { status: 401 }) : new Response(null, { status: 401 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient('/api/staff/tours')).rejects.toMatchObject({ status: 401 })
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
