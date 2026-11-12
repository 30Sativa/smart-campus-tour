import { useMemo } from 'react'
import { hashKey, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { fleetKey, useFleetConnection, type FleetRobot, type FleetSnapshot } from '../staff/operations/fleet-telemetry'
import type { RobotObservation, RobotTelemetrySource } from './robot-telemetry'

type FleetObservation = Omit<RobotObservation, 'frameId'> & { frameId: string }

/**
 * Turns `FleetUpdated` snapshots into one robot's observations. The hub
 * re-broadcasts the last pose until a new one arrives and carries no sequence
 * number, so a repeated `capturedAt` is dropped and each new one is numbered;
 * `acceptObservation` then still rejects anything out of order. Only a
 * physical robot is followed: Gazebo and Emulator robots have their own views.
 */
export function fleetObservations(): (robots: FleetRobot[]) => FleetObservation | null {
  let last: { robotId: string; mapKey: string; capturedAt: string; seq: number } | null = null
  return robots => {
    const robot = robots.find(item => item.source === 'Physical' && item.pose)
    if (!robot?.pose) return null
    const sameStream = last?.robotId === robot.id && last.mapKey === robot.mapKey
    if (sameStream && last!.capturedAt === robot.pose.capturedAt) return null
    const seq = sameStream ? last!.seq + 1 : 1
    last = { robotId: robot.id, mapKey: robot.mapKey, capturedAt: robot.pose.capturedAt, seq }
    return {
      robotId: robot.id, mapKey: robot.mapKey, frameId: robot.frameId, streamId: `${robot.id}/${robot.mapKey}`, seq,
      capturedAt: robot.pose.capturedAt, pose: { x: robot.pose.x, y: robot.pose.y, yaw: robot.pose.yaw },
    }
  }
}

/** The Staff shell's hub subscription as a twin telemetry source; it opens no connection of its own. */
export function fleetTelemetrySource(client: QueryClient): RobotTelemetrySource {
  return {
    subscribe(onObservation, onState) {
      const next = fleetObservations()
      const read = () => {
        const snapshot = client.getQueryData<FleetSnapshot>(fleetKey)
        const sample = snapshot ? next(snapshot.robots) : null
        if (sample) onObservation(sample)
      }
      const key = hashKey(fleetKey)
      onState(useFleetConnection.getState().state)
      read()
      const stopCache = client.getQueryCache().subscribe(event => { if (event.type === 'updated' && event.query.queryHash === key) read() })
      const stopConnection = useFleetConnection.subscribe(store => onState(store.state))
      return () => { stopCache(); stopConnection() }
    },
  }
}

export function useFleetTelemetrySource() {
  const client = useQueryClient()
  return useMemo(() => fleetTelemetrySource(client), [client])
}
