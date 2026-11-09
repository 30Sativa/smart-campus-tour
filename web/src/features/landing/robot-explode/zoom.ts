import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { Vector3 } from 'three'

/**
 * Zoom is a factor on the camera's usual distance from the robot: below 1 the
 * camera comes closer, above 1 it stands back.
 */
export const ZOOM = { min: 0.4, max: 1.6, step: 1.3 } as const

export function clampZoom(level: number) {
  return Math.min(ZOOM.max, Math.max(ZOOM.min, level))
}

/** One press of + (in) or − (out). Snaps back to exactly 1 when a press lands close to it. */
export function stepZoom(level: number, direction: 'in' | 'out') {
  const next = clampZoom(direction === 'in' ? level / ZOOM.step : level * ZOOM.step)
  return Math.abs(next - 1) < 0.05 ? 1 : next
}

/** How big the robot looks next to the usual view, for the reset button: 100 %, 169 %… */
export function zoomPercent(level: number) {
  return Math.round(100 / level)
}

/** Moves the camera along its line of sight until it stands `distance` from `target`, easing by `blend`. */
export function dollyTo(position: Vector3, target: Vector3, distance: number, blend: number, scratch: Vector3) {
  scratch.subVectors(position, target)
  const current = scratch.length()
  scratch.setLength(current + (distance - current) * blend)
  position.copy(target).add(scratch)
}

/**
 * Zoom for one 3D stage: buttons call `zoomIn`/`zoomOut`/`reset`; on the stage
 * itself a trackpad pinch or Ctrl/⌘ + wheel zooms, and so does a two-finger
 * pinch on a touch screen. A plain wheel still scrolls the page.
 */
export function useZoom(stage: RefObject<HTMLElement | null>) {
  const [level, setLevel] = useState(1)

  useEffect(() => {
    const element = stage.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      setLevel(current => clampZoom(current * Math.exp(event.deltaY * 0.004)))
    }
    let pinch = 0
    const spread = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
    const onTouchStart = (event: TouchEvent) => { pinch = event.touches.length === 2 ? spread(event.touches) : 0 }
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinch) return
      event.preventDefault()
      const now = spread(event.touches)
      setLevel(current => clampZoom(current * (pinch / now)))
      pinch = now
    }
    const onTouchEnd = () => { pinch = 0 }
    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('touchstart', onTouchStart, { passive: true })
    element.addEventListener('touchmove', onTouchMove, { passive: false })
    element.addEventListener('touchend', onTouchEnd)
    return () => {
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('touchstart', onTouchStart)
      element.removeEventListener('touchmove', onTouchMove)
      element.removeEventListener('touchend', onTouchEnd)
    }
  }, [stage])

  return {
    level,
    zoomIn: useCallback(() => setLevel(current => stepZoom(current, 'in')), []),
    zoomOut: useCallback(() => setLevel(current => stepZoom(current, 'out')), []),
    reset: useCallback(() => setLevel(1), []),
  }
}
