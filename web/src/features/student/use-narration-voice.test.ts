import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captionAt, NARRATION_RATE, pickVietnameseVoice, silentLineMs, splitForSpeech, useNarrationVoice, type NarrationSource } from './use-narration-voice'

class FakeUtterance {
  lang = ''
  voice: unknown = null
  rate = 1
  onstart: (() => void) | null = null
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

describe('captionAt', () => {
  const chunks = ['Một hai ba.', 'Bốn năm sáu bảy tám chín mười.']
  it('gives each sentence its share of the file by length', () => {
    expect(captionAt(chunks, 0, 10)).toBe(chunks[0])
    expect(captionAt(chunks, 2, 10)).toBe(chunks[0])
    expect(captionAt(chunks, 5, 10)).toBe(chunks[1])
    expect(captionAt(chunks, 12, 10)).toBe(chunks[1])
  })
  it('shows nothing before the duration is known', () => {
    expect(captionAt(chunks, 1, NaN)).toBeNull()
    expect(captionAt(chunks, 1, 0)).toBeNull()
    expect(captionAt([], 1, 10)).toBeNull()
  })
})

describe('useNarrationVoice', () => {
  it('subtitles the sentence being read and clears it when the voice ends', () => {
    const { result } = renderHook(() => useNarrationVoice(at('lib'), false))
    flush()
    expect(result.current.caption).toBeNull()
    act(() => spoken[0].onstart?.())
    expect(result.current.caption).toBe('Đây là thư viện.')
    act(() => spoken[1].onstart?.())
    expect(result.current.caption).toBe('Mở cửa từ 7 giờ.')
    act(() => spoken[1].onend?.())
    expect(result.current.caption).toBeNull()
  })

  it('keeps the subtitles going without sound when the page is muted on arrival', () => {
    const { result } = renderHook(() => useNarrationVoice(at('lib'), true))
    act(() => { vi.advanceTimersByTime(0) })
    expect(speech.speak).not.toHaveBeenCalled()
    expect(result.current.speaking).toBe(false)
    expect(result.current.caption).toBe('Đây là thư viện.')
    act(() => { vi.advanceTimersByTime(silentLineMs('Đây là thư viện.')) })
    expect(result.current.caption).toBe('Mở cửa từ 7 giờ.')
    act(() => { vi.advanceTimersByTime(silentLineMs('Mở cửa từ 7 giờ.')) })
    expect(result.current.caption).toBeNull()
  })

  it('muting cuts the voice and carries on the subtitles from the sentence being read', () => {
    const { result, rerender } = renderHook(({ muted }) => useNarrationVoice(at('lib'), muted), { initialProps: { muted: false } })
    act(() => { vi.advanceTimersByTime(0) })
    act(() => spoken[1].onstart?.())
    speech.cancel.mockClear()
    rerender({ muted: true })
    expect(speech.cancel).toHaveBeenCalled()
    expect(result.current.speaking).toBe(false)
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.caption).toBe('Mở cửa từ 7 giờ.')
    act(() => spoken[1].onend?.()) // the cancelled voice's own end does not clear the silent subtitle
    expect(result.current.caption).toBe('Mở cửa từ 7 giờ.')
    rerender({ muted: false }) // unmuting does not restart the voice mid-way; the subtitles finish
    act(() => { vi.advanceTimersByTime(silentLineMs('Mở cửa từ 7 giờ.')) })
    expect(result.current.caption).toBeNull()
    expect(speech.speak).toHaveBeenCalledTimes(2)
  })

  it('times a muted subtitle line from its length, never too short to read', () => {
    expect(silentLineMs('Ngắn.')).toBe(1800)
    expect(silentLineMs('x'.repeat(120))).toBe(10000)
  })

  it('reads the stop once on arrival and again after travelling', () => {
    const { result, rerender } = renderHook(({ n }) => useNarrationVoice(n, false), { initialProps: { n: at('lib') as NarrationSource | undefined } })
    flush()
    expect(spoken.map((u) => u.text)).toEqual(['Đây là thư viện.', 'Mở cửa từ 7 giờ.'])
    expect(spoken[0].lang).toBe('vi-VN')
    expect(spoken.every((u) => u.rate === NARRATION_RATE && u.rate < 1)).toBe(true)
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
