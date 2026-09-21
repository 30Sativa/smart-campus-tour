/**
 * The labelled stand-in for the operations hub (`api/contracts/staff-realtime.ts`).
 *
 * While at least one subscriber is listening it advances `staff-sim.ts` once a
 * second and announces what changed, the way the hub will: a robot snapshot on
 * every tick, a tour id + revision when a Tour moved on, and the reason when a
 * Tour starts needing assistance. Nothing runs while no one listens, so tests and the public site never
 * start the clock.
 */
import type { RealtimeConnectionState, StaffRealtime, StaffRealtimeEvent } from '../api/contracts/staff-realtime'
import { robotView, sim, tick, tourById } from './staff-sim'

const TICK_MS = 1000

export function createMockStaffRealtime(tickMs = TICK_MS): StaffRealtime {
  const listeners = new Set<(event: StaffRealtimeEvent) => void>()
  let timer: ReturnType<typeof setInterval> | null = null
  let last = 0

  const emit = (event: StaffRealtimeEvent) => listeners.forEach((listener) => listener(event))

  const step = () => {
    const at = Date.now()
    const dt = Math.min((at - last) / 1000, 2)
    last = at
    const changes = tick(dt)
    if (changes.fleet) emit({ type: 'FleetUpdated', robots: sim.robots.map(robotView) })
    changes.tours.forEach((tourId) => emit({ type: 'TourUpdated', tourId, revision: tourById(tourId)?.revision ?? 0 }))
    changes.assistance.forEach((item) => emit({ type: 'AssistanceRequired', ...item }))
  }

  return {
    subscribe(onEvent, onState: (state: RealtimeConnectionState) => void) {
      listeners.add(onEvent)
      onState('connected')
      if (!timer) {
        last = Date.now()
        timer = setInterval(step, tickMs)
      }
      return () => {
        listeners.delete(onEvent)
        if (listeners.size === 0 && timer) {
          clearInterval(timer)
          timer = null
        }
      }
    },
  }
}

export const mockStaffRealtime = createMockStaffRealtime()
