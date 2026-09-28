import { useEffect, useState } from 'react'
import { FLEET_HUB_ENABLED, connectFleetHub, sampleAgeSeconds, type TourRobotPoseMessage } from '../../api/contracts/fleet-realtime'
import { mapConfigFor, mapToStudentPose } from '../digital-twin/map-config'
import type { StudentRobotPose } from './student-types'

/** Older than this, the 2D map keeps the last position and says it is interrupted. */
export const STUDENT_POSE_STALE_SECONDS = 2

type Latest = { message: TourRobotPoseMessage; arrived: number }

/**
 * The real robot of a RUNNING Tour for the Student 2D map (plan: Student sees
 * only its own Tour's robot, 2D only).
 *
 * - `undefined`: live positions are off (`VITE_FLEET_HUB` not `on`) or the
 *   Tour is not RUNNING; the page keeps its current source.
 * - `null`: live is on but there is nothing trustworthy to draw: no sample
 *   yet, robot not localized, Tour ended, or this map is not calibrated for
 *   the drawing. The map shows the route and POIs without a robot.
 * - a pose, marked stale after 2 s without a new sample.
 */
export function useTourRobotPose(tourId: string, running: boolean): StudentRobotPose | null | undefined {
  const [latest, setLatest] = useState<Latest | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const active = FLEET_HUB_ENABLED && running && Boolean(tourId)

  useEffect(() => {
    if (!active) return
    const stop = connectFleetHub({
      onTourRobotPose: (message, arrived) => {
        if (message.tourId === tourId) setLatest({ message, arrived })
      },
      onTourRobotEnded: (ended) => {
        if (ended === tourId) setLatest(null)
      },
      onState: () => undefined,
      // Re-join after every reconnect; the server forgets groups on disconnect.
      onConnected: async (connection) => {
        const watching = await connection.invoke<boolean>('WatchTour', tourId).catch(() => false)
        if (!watching) setLatest(null)
      },
    })
    const tick = window.setInterval(() => setNow(Date.now()), 500)
    return () => {
      window.clearInterval(tick)
      stop()
      setLatest(null)
    }
  }, [active, tourId])

  if (!active) return undefined
  const pose = latest?.message.pose
  if (!latest || !pose || !pose.localized) return null
  const placed = mapToStudentPose(mapConfigFor(pose.mapKey), pose)
  if (!placed) return null
  const age = sampleAgeSeconds(latest.message.sentAt, pose.receivedAt, latest.arrived, now)
  return { x: placed.x, y: placed.y, heading: placed.heading, isStale: age > STUDENT_POSE_STALE_SECONDS, lastUpdatedAt: pose.receivedAt }
}
