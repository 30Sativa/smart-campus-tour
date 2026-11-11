import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pickVietnameseVoice, splitForSpeech, useNarrationVoice, type NarrationSource } from './use-narration-voice'

class FakeUtterance {
  lang = ''
  voice: unknown = null
  rate = 1
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  text: string
  constructor(text: string) { this.text = text }
}

const spoken: FakeUtterance[] = []
const speech = {
  speak: vi.fn((u: FakeUtterance) => { spoken.push(u) }),
  cancel: vi.fn(),
  getVoices: vi.fn(() => [{ lang: 'vi-VN', name: 'An', localService: true }]),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}

const at = (poiId: string, isPlaying = true, extra: Partial<NarrationSource> = {}): NarrationSource =>
  ({ poiId, text: 'Đây là thư viện. Mở cửa từ 7 giờ.', isPlaying, ...extra })

const flush = () => act(() => { vi.runAllTimers() })

beforeEach(() => {
  vi.useFakeTimers()
  spoken.length = 0
  vi.clearAllMocks()
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  Object.defineProperty(window, 'speechSynthesis', { value: speech, configurable: true })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('splitForSpeech', () => {
  it('splits into sentences and caps long ones', () => {
    expect(splitForSpeech('Câu một. Câu hai!')).toEqual(['Câu một.', 'Câu hai!'])
    const long = Array.from({ length: 60 }, () => 'chữ').join(' ')
    expect(splitForSpeech(long, 50).every((c) => c.length <= 50)).toBe(true)
  })
})

describe('pickVietnameseVoice', () => {
  it('prefers the installed Vietnamese voice', () => {
    const voices = [
      { lang: 'en-US', localService: true }, { lang: 'vi-VN', localService: false, name: 'online' }, { lang: 'vi_VN', localService: true, name: 'local' },
    ] as unknown as SpeechSynthesisVoice[]
    expect(pickVietnameseVoice(voices)?.name).toBe('local')
  })
})

describe('useNarrationVoice', () => {
  it('reads the stop once on arrival and again after travelling', () => {
    const { result, rerender } = renderHook(({ n }) => useNarrationVoice(n, false), { initialProps: { n: at('lib') as NarrationSource | undefined } })
    flush()
    expect(spoken.map((u) => u.text)).toEqual(['Đây là thư viện.', 'Mở cửa từ 7 giờ.'])
    expect(spoken[0].lang).toBe('vi-VN')
    expect(result.current.speaking).toBe(true)

    rerender({ n: at('lib') }) // next poll, same stop
    flush()
    expect(speech.speak).toHaveBeenCalledTimes(2)

    act(() => spoken[1].onend?.())
    expect(result.current.speaking).toBe(false)

    rerender({ n: undefined }) // travelling
    rerender({ n: at('lab') })
    flush()
    expect(speech.speak).toHaveBeenCalledTimes(4)
  })

  it('waits until the robot is presenting the stop', () => {
    const { rerender } = renderHook(({ n }) => useNarrationVoice(n, false), { initialProps: { n: at('lib', false) } })
    flush()
    expect(speech.speak).not.toHaveBeenCalled()
    rerender({ n: at('lib', true) })
    flush()
    expect(speech.speak).toHaveBeenCalled()
  })

  it('stays silent when muted and replays on demand', () => {
    const source = at('lib')
    const { result } = renderHook(() => useNarrationVoice(source, true))
    flush()
    expect(speech.speak).not.toHaveBeenCalled()
    act(() => result.current.replay())
    expect(speech.speak).toHaveBeenCalledTimes(2)
  })

  it('reports a refused voice and starts it from enable()', () => {
    const source = at('lib')
    const { result } = renderHook(() => useNarrationVoice(source, false))
    flush()
    act(() => spoken[0].onerror?.({ error: 'not-allowed' }))
    expect(result.current.blocked).toBe(true)
    act(() => result.current.enable())
    expect(result.current.blocked).toBe(false)
    expect(speech.speak).toHaveBeenCalledTimes(4)
  })

  it('plays the prepared audio file when the stop has one', async () => {
    const play = vi.fn(() => Promise.resolve())
    vi.stubGlobal('Audio', class { src = ''; currentTime = 0; onended = null; onerror = null; onpause = null; play = play; pause = vi.fn() })
    const source = at('lib', true, { audioUrl: '/audio/lib.mp3' })
    renderHook(() => useNarrationVoice(source, false))
    flush()
    expect(play).toHaveBeenCalled()
    expect(speech.speak).not.toHaveBeenCalled()
  })
})
