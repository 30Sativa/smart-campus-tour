import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, restoreAuthSession } from './client'
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

  it('accepts Headers instances without dropping caller headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await apiClient('/api/one', { headers: new Headers({ 'X-Request-Id': 'request-1' }) })
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('X-Request-Id')).toBe('request-1')
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
      const authorization = new Headers(init?.headers).get('Authorization')
      if (authorization === 'Bearer new-token') return jsonResponse({ ok: true })
      return new Response(null, { status: 401 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await Promise.all([apiClient('/api/one'), apiClient('/api/two')])

    expect(results).toEqual([{ ok: true }, { ok: true }])
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/auth/refresh'))).toHaveLength(1)
    expect(fetchMock.mock.calls.filter(([, init]) => new Headers(init?.headers).get('Authorization') === 'Bearer new-token')).toHaveLength(2)
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

  it('does not restore a session from a refresh that completed after logout', async () => {
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
    const restore = restoreAuthSession()
    useAuthStore.getState().logout()
    const rejected = expect(restore).rejects.toMatchObject({ name: 'AbortError' })
    finish(jsonResponse({ accessToken: 'old-token', userId: 'old-user', username: 'old', role: 'Admin' }))
    await rejected
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it.each([200, 401])('keeps a newer login when an older refresh returns %s', async status => {
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
    const restore = restoreAuthSession()
    useAuthStore.getState().setAuth('new-login', { userId: 'new-user', username: 'new', role: 'Representative' })
    const rejected = expect(restore).rejects.toThrow()
    finish(jsonResponse({ accessToken: 'old-token', userId: 'old-user', username: 'old', role: 'Admin' }, status))
    await rejected
    expect(useAuthStore.getState().accessToken).toBe('new-login')
  })

  it('never retries a delayed 401 using another account', async () => {
    useAuthStore.getState().setAuth('old-token', { userId: 'old-user', username: 'old', role: 'Admin' })
    let finish!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    const request = apiClient('/api/one')
    useAuthStore.getState().setAuth('new-login', { userId: 'new-user', username: 'new', role: 'Admin' })
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    finish(new Response(null, { status: 401 }))
    await rejected
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().accessToken).toBe('new-login')
  })

  it('keeps auth when the retried request is aborted', async () => {
    useAuthStore.getState().setAuth('old-token', { userId: 'user-1', username: 'staff', role: 'Staff' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-token', userId: 'user-1', username: 'staff', role: 'Staff' }))
      .mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiClient('/api/one')).rejects.toMatchObject({ name: 'AbortError' })
    expect(useAuthStore.getState().accessToken).toBe('new-token')
  })

  it('keeps auth on an uncertain refresh network failure', async () => {
    useAuthStore.getState().setAuth('old-token', { userId: 'user-1', username: 'staff', role: 'Staff' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockRejectedValueOnce(new TypeError('offline')))
    await expect(apiClient('/api/one')).rejects.toMatchObject({ status: 401 })
    expect(useAuthStore.getState().accessToken).toBe('old-token')
  })

  it('does not retry an old request when the refresh cookie belongs to a different account', async () => {
    useAuthStore.getState().setAuth('old-token', { userId: 'old-user', username: 'old', role: 'Admin' })
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'other-token', userId: 'other-user', username: 'other', role: 'Representative' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiClient('/api/one')).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState().user?.userId).toBe('other-user')
  })
})
