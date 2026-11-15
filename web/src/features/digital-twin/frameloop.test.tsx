import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { twinFrameloop, useTwinVisibility } from './frameloop'

const shown = { onScreen: true, pageVisible: true }

describe('when the Digital Twin draws', () => {
  it('draws on demand with real robots only, and continuously while the simulation runs', () => {
    expect(twinFrameloop({ simulation: false, tourRunning: false, ...shown })).toBe('demand')
    expect(twinFrameloop({ simulation: true, tourRunning: false, ...shown })).toBe('always')
  })

  it('stays on demand while a Tour runs, even if the simulation was asked for', () => {
    expect(twinFrameloop({ simulation: true, tourRunning: true, ...shown })).toBe('demand')
    expect(twinFrameloop({ simulation: false, tourRunning: true, ...shown })).toBe('demand')
  })

  it('stops drawing off screen or in a hidden tab, simulation or not', () => {
    for (const simulation of [false, true]) {
      expect(twinFrameloop({ simulation, tourRunning: false, onScreen: false, pageVisible: true })).toBe('never')
      expect(twinFrameloop({ simulation, tourRunning: false, onScreen: true, pageVisible: false })).toBe('never')
    }
  })
})

describe('useTwinVisibility', () => {
  let report: (visible: boolean) => void = () => {}
  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })

  function Probe() {
    const ref = useRef<HTMLDivElement>(null)
    const { onScreen, pageVisible } = useTwinVisibility(ref)
    return <div ref={ref} data-testid="probe">{`${onScreen}/${pageVisible}`}</div>
  }

  it('follows the IntersectionObserver and the page visibility', () => {
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { report = visible => callback([{ isIntersecting: visible }]) }
      observe() {}
      disconnect = disconnect
    })
    const { unmount } = render(<Probe />)
    expect(screen.getByTestId('probe')).toHaveTextContent('true/true')
    act(() => report(false))
    expect(screen.getByTestId('probe')).toHaveTextContent('false/true')
    act(() => report(true))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(screen.getByTestId('probe')).toHaveTextContent('true/false')
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })
})
