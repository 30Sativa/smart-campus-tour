import { useEffect, useState, type RefObject } from 'react'

export type TwinFrameloop = 'always' | 'demand' | 'never'

/**
 * When the 3D view draws (web/docs/digital-twin-performance.md):
 * - `never` while it is off screen or the tab is hidden: nobody sees the frames;
 * - `always` while the simulation runs: its robots move every frame on their own;
 * - `demand` otherwise: only on a change (telemetry, camera, labels, route), which
 *   the scene requests with `invalidate()`. A running Tour forces the simulation
 *   off, so it always lands here.
 */
export function twinFrameloop({ simulation, tourRunning, onScreen, pageVisible }: { simulation: boolean; tourRunning: boolean; onScreen: boolean; pageVisible: boolean }): TwinFrameloop {
  if (!onScreen || !pageVisible) return 'never'
  return simulation && !tourRunning ? 'always' : 'demand'
}

/** Whether `ref` is on screen (IntersectionObserver) and the tab is visible. Assumes visible where unsupported. */
export function useTwinVisibility(ref: RefObject<Element | null>) {
  const [onScreen, setOnScreen] = useState(true)
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => setOnScreen(entries.some(entry => entry.isIntersecting)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return { onScreen, pageVisible }
}
