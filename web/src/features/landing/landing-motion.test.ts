import { afterEach, describe, expect, it, vi } from 'vitest'
import { revealOnScroll } from './landing-motion'

describe('revealOnScroll', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reveals each section element when it enters the viewport', () => {
    let onIntersect: IntersectionObserverCallback = () => {}
    const observe = vi.fn()
    const unobserve = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { onIntersect = callback }
      observe = observe
      unobserve = unobserve
      disconnect = disconnect
    })

    const root = document.createElement('main')
    root.innerHTML = '<section><h2 data-reveal>Hành trình</h2><p data-reveal>Nội dung</p></section>'
    const [heading, paragraph] = root.querySelectorAll<HTMLElement>('[data-reveal]')
    const stop = revealOnScroll(root)

    expect(observe).toHaveBeenCalledTimes(2)
    onIntersect([{
      target: heading,
      isIntersecting: true,
      boundingClientRect: heading.getBoundingClientRect(),
      intersectionRect: heading.getBoundingClientRect(),
      rootBounds: null,
      intersectionRatio: 1,
      time: 0,
    }], {} as IntersectionObserver)
    expect(heading).toHaveClass('is-visible')
    expect(paragraph).not.toHaveClass('is-visible')
    expect(unobserve).toHaveBeenCalledWith(heading)

    stop()
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
