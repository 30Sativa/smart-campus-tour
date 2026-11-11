import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./quest-stream-config', async importOriginal => ({
  ...await importOriginal<typeof import('./quest-stream-config')>(),
  QUEST_DEV_WHEP_URL: null,
}))

import { renewDelayMs, toQuestSource, useStudentStreamAccess, withToken } from './stream-access'

const tourId = '11111111-1111-1111-1111-111111111111'
const WHEP = 'https://stream.example.test:8889/quest/whep'

function answer(token: string, expiresAt: string, status = 200) {
  return new Response(JSON.stringify(status === 200
    ? { success: true, data: { whepUrl: WHEP, token, expiresAt } }
    : { success: false, message: 'no', errors: { code: 'STREAM_NOT_AVAILABLE' } }), { status })
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('stream access helpers', () => {
  it('adds the token to the WHEP URL as the relay expects', () => {
    expect(withToken(WHEP, 'v1.S.abc')).toBe(`${WHEP}?token=v1.S.abc`)
    expect(withToken(WHEP, null)).toBe(WHEP)
  })

  it('accepts only a complete answer', () => {
    expect(toQuestSource({ whepUrl: WHEP, token: 't', expiresAt: '2026-11-11T10:02:00Z' })).toEqual({ whepUrl: WHEP, token: 't' })
    expect(toQuestSource(null)).toBeNull()
    expect(toQuestSource({ whepUrl: '', token: 't', expiresAt: '' })).toBeNull()
    expect(toQuestSource({ tourId } as never)).toBeNull()
  })

  it('renews at half the remaining life, at least 30 s before expiry, never sooner than 10 s', () => {
    const now = Date.parse('2026-11-11T10:00:00Z')
    expect(renewDelayMs('2026-11-11T10:02:00Z', now)).toBe(60_000)
    expect(renewDelayMs('2026-11-11T10:05:00Z', now)).toBe(150_000)
    expect(renewDelayMs('2026-11-11T10:00:50Z', now)).toBe(20_000)
    expect(renewDelayMs('2026-11-11T10:00:05Z', now)).toBe(10_000)
    expect(renewDelayMs('not a date', now)).toBe(10_000)
  })
})

describe('useStudentStreamAccess', () => {
  it('asks for nothing until the Tour runs', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useStudentStreamAccess(tourId, false), { wrapper: wrapper() })
    expect(result.current).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches a token with the session cookie and renews it before it expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const start = Date.now()
    const fetch = vi.fn()
      .mockResolvedValueOnce(answer('first', new Date(start + 120_000).toISOString()))
      .mockResolvedValueOnce(answer('second', new Date(start + 180_000).toISOString()))
    vi.stubGlobal('fetch', fetch)

    const { result } = renderHook(() => useStudentStreamAccess(tourId, true), { wrapper: wrapper() })
    await waitFor(() => expect(result.current).toEqual({ whepUrl: WHEP, token: 'first' }))
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(new RegExp(`/api/student/tours/${tourId}/stream-access$`))
    expect(init.credentials).toBe('include')

    // Half of the two minutes: not yet at 59 s, renewed by 61 s, well before the token ends.
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000) })
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    await waitFor(() => expect(result.current).toEqual({ whepUrl: WHEP, token: 'second' }))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('drops the old token when a renewal is refused (End Early, revoked session)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const start = Date.now()
    const fetch = vi.fn()
      .mockResolvedValueOnce(answer('first', new Date(start + 120_000).toISOString()))
      .mockResolvedValue(answer('', '', 409))
    vi.stubGlobal('fetch', fetch)

    const { result } = renderHook(() => useStudentStreamAccess(tourId, true), { wrapper: wrapper() })
    await waitFor(() => expect(result.current?.token).toBe('first'))
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000) })
    await waitFor(() => expect(result.current).toBeNull())
  })
})
