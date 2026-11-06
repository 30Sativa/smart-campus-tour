import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { createHubConnection } from '../../../api/signalr'
import type { RealtimeConnectionState } from '../../../api/contracts/staff-realtime'
import { useAuthStore } from '../../../stores/auth-store'
import { tourKeys } from '../../administration/tours/hooks'

/**
 * Live robot telemetry from the Staff-only `/hubs/operations` SignalR hub
 * (`FleetUpdated`, docs/architecture.md §3.1.2). This is the robot's own
 * report as the backend received it: it is not a Tour state and not proof that
 * a command ran. The hub sends no command and accepts none.
 */
export type FleetPose = { x: number; y: number; yaw: number; capturedAt: string }
export type FleetRobot = {
  /** The robot code. */
  id: string
  name: string
  /** `Live` means a recent HTTPS sync, not an open socket. */
  connectionState: 'Live' | 'Stale' | string
  batteryPercent: number | null
  lastSeenAt: string
  telemetryAgeSeconds: number
  source: 'Physical' | 'Gazebo' | 'Emulator' | string
  pose: FleetPose | null
  poseAgeSeconds: number | null
  localized: boolean | null
  motionReady: boolean | null
  syncFresh: boolean
  poseFresh: boolean
  /** Robot-reported execution status, e.g. IDLE / NAVIGATING. */
  executionStatus: string
  mapKey: string
  frameId: string
  legId: string | null
  faultCode: string | null
  needsCheck: boolean
}
/** One broadcast; `receivedAt` lets ages keep counting while no new one arrives. */
export type FleetSnapshot = { robots: FleetRobot[]; receivedAt: number }
export type FleetConnection = RealtimeConnectionState

export const FLEET_HUB_PATH = '/hubs/operations'
/** Sent by the hub after a Tour command commits; carries nothing (docs/architecture.md §3.1.2). */
export const TOUR_UPDATED = 'TourUpdated'
const fleetKey = ['staff', 'fleet-telemetry'] as const
const RESTART_MS = 5_000

/** Connection state is client state, shared by the shell and the pages reading telemetry. */
export const useFleetConnection = create<{ state: FleetConnection; set: (state: FleetConnection) => void }>(set => ({
  state: 'connecting',
  set: state => set({ state }),
}))

/**
 * The one hub subscription, owned by the Staff shell. Automatic reconnect covers
 * short drops; a closed connection (e.g. its JWT expired) is restarted with the
 * current token after a pause, until the shell unmounts.
 */
export function useFleetTelemetrySync() {
  const client = useQueryClient()
  const setState = useFleetConnection(store => store.set)
  useEffect(() => {
    let disposed = false
    let restart: number | undefined
    let connection: ReturnType<typeof createHubConnection>
    try {
      connection = createHubConnection(FLEET_HUB_PATH, { accessTokenFactory: () => useAuthStore.getState().accessToken ?? '' })
    } catch (error) {
      // Telemetry is one panel of the console: a hub that cannot even be built
      // is reported as disconnected, never allowed to take the whole area down.
      console.error('[fleet-telemetry] cannot create the operations hub connection', error)
      setState('disconnected')
      return
    }
    const schedule = () => { restart = window.setTimeout(start, RESTART_MS) }
    const start = () => {
      setState('connecting')
      connection.start().then(
        () => { if (!disposed) setState('connected') },
        () => { if (!disposed) { setState('disconnected'); schedule() } },
      )
    }
    connection.on('FleetUpdated', (robots: unknown) => {
      if (Array.isArray(robots)) client.setQueryData<FleetSnapshot>(fleetKey, { robots: robots as FleetRobot[], receivedAt: Date.now() })
    })
    // A Tour command committed somewhere (TourUpdated has no payload): re-read the Tours on screen now instead of at
    // the next poll. Polling stays as the fallback, since a signal may be coalesced or lost.
    const refreshTours = () => void client.invalidateQueries({ queryKey: tourKeys.all })
    connection.on(TOUR_UPDATED, refreshTours)
    connection.onreconnecting(() => setState('reconnecting'))
    // Signals sent while the socket was down are gone, so catch up once.
    connection.onreconnected(() => { setState('connected'); refreshTours() })
    connection.onclose(() => { if (!disposed) { setState('disconnected'); schedule() } })
    start()
    return () => {
      disposed = true
      window.clearTimeout(restart)
      connection.off('FleetUpdated')
      connection.off(TOUR_UPDATED)
      void connection.stop()
    }
  }, [client, setState])
}

/** The latest snapshot, or null before the first one arrives. Nothing here is ever invented. */
export function useFleetTelemetry() {
  const client = useQueryClient()
  return useQuery({
    queryKey: fleetKey,
    queryFn: () => client.getQueryData<FleetSnapshot>(fleetKey) ?? null,
    staleTime: Infinity,
  }).data ?? null
}

/** One robot's latest report, by robot code. */
export function useFleetRobot(robotCode: string | null | undefined) {
  const snapshot = useFleetTelemetry()
  const robot = robotCode ? snapshot?.robots.find(item => item.id === robotCode) ?? null : null
  return { robot, receivedAt: snapshot?.receivedAt ?? null }
}

/** Age of the report now, counting the time since the broadcast that carried it. */
export function telemetryAge(robot: FleetRobot, receivedAt: number | null, now: number): number {
  return robot.telemetryAgeSeconds + (receivedAt ? Math.max(0, now - receivedAt) / 1000 : 0)
}
