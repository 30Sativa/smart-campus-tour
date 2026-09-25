import { afterEach, describe, expect, it, vi } from 'vitest'
import { playSplitExit } from './split-exit'

describe('split exit after sign-in', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('just navigates when there is no auth screen to split', () => {
    const go = vi.fn()
    playSplitExit(null, go)
    expect(go).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.ah-split')).toBeNull()
  })

  it('navigates at once under a decorative two-half curtain that removes itself', () => {
    vi.useFakeTimers()
    const root = document.createElement('main')
    root.className = 'auth'
    root.innerHTML = '<h1 id="x">Chào mừng bạn trở lại</h1><input id="y" />'
    document.body.appendChild(root)
    const go = vi.fn()

    playSplitExit(root, go)

    // The destination mounts underneath straight away.
    expect(go).toHaveBeenCalledTimes(1)
    const overlay = document.querySelector('.ah-split') as HTMLElement
    expect(overlay).not.toBeNull()
    expect(overlay.getAttribute('aria-hidden')).toBe('true')
    expect(overlay.querySelectorAll('.ah-split__half')).toHaveLength(2)
    // Clones carry no ids, so nothing on the new page can collide with them.
    expect(overlay.querySelectorAll('[id]')).toHaveLength(0)

    vi.advanceTimersByTime(3000)
    expect(document.querySelector('.ah-split')).toBeNull()
  })
})
