import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOUCH_ONLY_QUERY, driveStartHint, driveTips, useTouchOnly } from './touch'

function mockTouch(touch: boolean) {
  const matchMedia = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ ...matchMedia(query), matches: touch && query === TOUCH_ONLY_QUERY }))
}

describe('test drive hints', () => {
  afterEach(() => vi.restoreAllMocks())

  it('tells a touch screen to tap the buttons and a keyboard to press the keys', () => {
    expect(driveStartHint(true)).toBe('Chạm các nút bên dưới để lái')
    expect(driveStartHint(false)).toBe('Nhấn W hoặc ↑ để lái robot')
  })

  it('gives a touch screen no tip that needs a keyboard-only key', () => {
    expect(driveTips(true).some((tip) => /Nhấn|phím|\bN\b/.test(tip))).toBe(false)
    expect(driveTips(false)[0]).toBe('W A S D hoặc phím mũi tên để lái, Space để phanh.')
  })

  it('reads the touch-only media query', () => {
    mockTouch(true)
    expect(renderHook(() => useTouchOnly()).result.current).toBe(true)
    vi.restoreAllMocks()
    mockTouch(false)
    expect(renderHook(() => useTouchOnly()).result.current).toBe(false)
  })
})
