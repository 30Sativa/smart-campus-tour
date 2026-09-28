/**
 * Robot positions pushed by the backend on `/hubs/fleet` (contract:
 * docs/architecture.md, "Robot pose telemetry"). This one IS wired to a real
 * hub, but only when `VITE_FLEET_HUB=on`; otherwise the screens keep their
 * mocks and nothing connects.
 *
 * Robots post their pose to the backend; browsers only listen. There is no
 * method here that moves a robot.
 *
 * - Admin/Staff: `RobotPoses` for every robot (latest state, <= 5 Hz, only
 *   robots that changed; a full snapshot right after connecting).
 * - Student: call `WatchTour(tourId)`, then `TourRobotPose` for that Tour's
 *   robot only (<= 2 Hz) and `TourRobotEnded` when the Tour stops RUNNING.
 *
 * `sentAt` and `receivedAt` are both server clock: a sample's age is
 * `sentAt - receivedAt` + the time since the message arrived, so a browser
 * with a wrong clock still judges staleness correctly.
 */
import type { HubConnection } from '@microsoft/signalr'
import { createHubConnection } from '../signalr'

export const FLEET_HUB = '/hubs/fleet'

/** Read the env var here only. */
export const FLEET_HUB_ENABLED = import.meta.env.VITE_FLEET_HUB?.trim().toLowerCase() === 'on'

export type FleetSource = 'physical' | 'gazebo' | 'emulator'

export type OperatorRobotPose = {
  robotCode: string
  source: FleetSource
  mapKey: string
  frameId: string
  x: number
  y: number
  yaw: number
  localized: boolean
  covXY: number | null
  capturedAt: string
  receivedAt: string
}

export type RobotPosesMessage = { sentAt: string; robots: OperatorRobotPose[] }

export type StudentRobotPose = { mapKey: string; x: number; y: number; yaw: number; localized: boolean; receivedAt: string }

export type TourRobotPoseMessage = { tourId: string; sentAt: string; pose: StudentRobotPose | null }

export type FleetConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

/** Age in seconds of a sample at local time `now`, from server timestamps and the local arrival time. */
export function sampleAgeSeconds(sentAt: string, receivedAt: string, arrivedLocalMs: number, now = Date.now()) {
  const atSend = (Date.parse(sentAt) - Date.parse(receivedAt)) / 1000
  return Math.max(0, (Number.isFinite(atSend) ? atSend : 0) + (now - arrivedLocalMs) / 1000)
}

type Handlers = {
  onRobotPoses?: (message: RobotPosesMessage, arrivedLocalMs: number) => void
  onTourRobotPose?: (message: TourRobotPoseMessage, arrivedLocalMs: number) => void
  onTourRobotEnded?: (tourId: string) => void
  onState: (state: FleetConnectionState) => void
  /** Runs after every (re)connect: a Student re-joins its Tour here. */
  onConnected?: (connection: HubConnection) => Promise<void> | void
}

/** Opens `/hubs/fleet`, retrying the first connect. Returns a stop function. */
export function connectFleetHub(handlers: Handlers): () => void {
  const connection = createHubConnection(FLEET_HUB)
  let stopped = false
  let retry: number | undefined

  if (handlers.onRobotPoses) connection.on('RobotPoses', (m: RobotPosesMessage) => handlers.onRobotPoses?.(m, Date.now()))
  if (handlers.onTourRobotPose) connection.on('TourRobotPose', (m: TourRobotPoseMessage) => handlers.onTourRobotPose?.(m, Date.now()))
  if (handlers.onTourRobotEnded) connection.on('TourRobotEnded', (m: { tourId: string }) => handlers.onTourRobotEnded?.(m.tourId))
  connection.onreconnecting(() => handlers.onState('reconnecting'))
  connection.onreconnected(() => {
    handlers.onState('connected')
    void handlers.onConnected?.(connection)
  })
  connection.onclose(() => {
    if (!stopped) handlers.onState('disconnected')
  })

  const start = async (attempt: number) => {
    handlers.onState('connecting')
    try {
      await connection.start()
      if (stopped) return
      handlers.onState('connected')
      await handlers.onConnected?.(connection)
    } catch {
      if (stopped) return
      handlers.onState('disconnected')
      retry = window.setTimeout(() => void start(attempt + 1), Math.min(30_000, 1000 * 2 ** attempt))
    }
  }
  void start(0)

  return () => {
    stopped = true
    window.clearTimeout(retry)
    void connection.stop()
  }
}
