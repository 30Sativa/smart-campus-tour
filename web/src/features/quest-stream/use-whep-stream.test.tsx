import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const whep = vi.hoisted(() => ({
  urls: [] as string[],
  sessions: [] as { onDisconnect?: () => void }[],
}))
vi.mock('./whep', async importOriginal => ({
  ...await importOriginal<typeof import('./whep')>(),
  startWhep: vi.fn(async (url: string, _video: HTMLVideoElement, options: { onDisconnect?: () => void }) => {
    whep.urls.push(url)
    whep.sessions.push(options)
    return { framesDecoded: async () => 0, isConnected: () => true, close: () => undefined }
  }),
}))

import { useWhepStream } from './use-whep-stream'

const WHEP = 'https://stream.example.test:8889/quest/whep'

afterEach(() => {
  whep.urls.length = 0
  whep.sessions.length = 0
  vi.useRealTimers()
})

describe('useWhepStream with a relay token (ADR-0055)', () => {
  it('connects only once it has a source, with the token in the URL', async () => {
    const video = { current: document.createElement('video') }
    const { rerender } = renderHook(({ url, token }) => useWhepStream(video, url, true, token),
      { initialProps: { url: null as string | null, token: null as string | null } })
    await Promise.resolve()
    expect(whep.urls).toEqual([])

    rerender({ url: WHEP, token: 'first' })
    await vi.waitFor(() => expect(whep.urls).toEqual([`${WHEP}?token=first`]))
  })

  it('does not reconnect a playing stream for a renewed token, and uses it on the next reconnect', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const video = { current: document.createElement('video') }
    const { rerender } = renderHook(({ token }) => useWhepStream(video, WHEP, true, token), { initialProps: { token: 'first' } })
    await vi.waitFor(() => expect(whep.urls).toHaveLength(1))

    rerender({ token: 'second' })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(whep.urls).toEqual([`${WHEP}?token=first`])

    // The connection drops: the reconnect carries the newest token.
    whep.sessions[0].onDisconnect?.()
    await vi.advanceTimersByTimeAsync(2_500)
    await vi.waitFor(() => expect(whep.urls).toEqual([`${WHEP}?token=first`, `${WHEP}?token=second`]))
  })
})
