import { afterEach, expect, it, vi } from 'vitest'
import { representativeRead, REPRESENTATIVE_READ_TIMEOUT_MS } from './representative-read'
import { readRepError } from '../rep-format'
import { useAuthStore } from '../../../stores/auth-store'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); useAuthStore.getState().logout() })

it('ends a stalled GET with an actionable timeout and aborts the request', async () => {
  vi.useFakeTimers()
  let requestSignal: AbortSignal | undefined
  vi.stubGlobal('fetch', vi.fn((_url, options) => {
    requestSignal = options.signal
    return new Promise(() => {})
  }))
  const result = representativeRead('/api/representative/tours').catch(error => error)
  await vi.advanceTimersByTimeAsync(REPRESENTATIVE_READ_TIMEOUT_MS)
  const error = await result
  expect(error).toMatchObject({ name: 'TimeoutError' })
  expect(requestSignal?.aborted).toBe(true)
  expect(readRepError(error).message).toContain('15 giây')
  expect(vi.getTimerCount()).toBe(0)
})

it('also bounds a stalled refresh without clearing the signed-in account', async () => {
  vi.useFakeTimers()
  useAuthStore.getState().setAuth('expired', { userId: 'owner', username: 'rep', role: 'Representative' })
  vi.stubGlobal('fetch', vi.fn(async (url) => String(url).endsWith('/auth/refresh')
    ? new Promise(() => {}) : new Response('', { status: 401 })))
  const result = representativeRead('/api/representative/registrations').catch(error => error)
  await vi.advanceTimersByTimeAsync(REPRESENTATIVE_READ_TIMEOUT_MS)
  expect(await result).toMatchObject({ name: 'TimeoutError' })
  expect(useAuthStore.getState().user?.userId).toBe('owner')
})

it('cleans up a successful GET deadline and preserves response data', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: ['owned-record'] }))))
  await expect(representativeRead('/api/representative/registrations')).resolves.toEqual({ data: ['owned-record'] })
  expect(vi.getTimerCount()).toBe(0)
})

it('passes owner cancellation to the in-flight fetch', async () => {
  const controller = new AbortController()
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
  })))
  const result = representativeRead('/api/representative/registrations', controller.signal)
  controller.abort()
  await expect(result).rejects.toMatchObject({ name: 'AbortError' })
})
