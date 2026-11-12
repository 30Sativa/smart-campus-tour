import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import { fleetKey, useFleetConnection, type FleetRobot, type FleetSnapshot } from '../staff/operations/fleet-telemetry'
import { fleetObservations, fleetTelemetrySource } from './fleet-telemetry-source'
import { acceptObservation } from './robot-telemetry'

const robot = (patch: Partial<FleetRobot> = {}): FleetRobot => ({
  id: 'robot_01', name: 'Robot 01', connectionState: 'Live', batteryPercent: 80, lastSeenAt: '2026-11-11T09:00:00Z',
  telemetryAgeSeconds: 0, source: 'Physical', pose: { x: 1, y: 2, yaw: 0.5, capturedAt: '2026-11-11T09:00:00Z' },
  poseAgeSeconds: 0, localized: true, motionReady: true, syncFresh: true, poseFresh: true, executionStatus: 'IDLE',
  mapKey: 'map2-v2', frameId: 'map', legId: null, faultCode: null, needsCheck: false, ...patch,
})
const at = (capturedAt: string, x = 1) => robot({ pose: { x, y: 2, yaw: 0.5, capturedAt } })
const now = Date.parse('2026-11-11T09:00:05Z')

afterEach(() => useFleetConnection.setState({ state: 'connecting' }))

describe('fleet telemetry as a twin source', () => {
  it('numbers each new pose, drops re-broadcasts, and stays acceptable to the twin', () => {
    const next = fleetObservations()
    const first = next([at('2026-11-11T09:00:00Z')])!
    expect(first).toMatchObject({ robotId: 'robot_01', mapKey: 'map2-v2', frameId: 'map', seq: 1, pose: { x: 1, y: 2, yaw: 0.5 } })
    expect(next([at('2026-11-11T09:00:00Z')])).toBeNull()
    const second = next([at('2026-11-11T09:00:02Z', 1.5)])!
    expect(second.seq).toBe(2)
    const accepted = acceptObservation(acceptObservation(null, first, now), second, now)
    expect(accepted?.pose.x).toBe(1.5)
  })

  it('follows only a physical robot that reports a pose', () => {
    const next = fleetObservations()
    expect(next([robot({ source: 'Gazebo' }), robot({ id: 'robot_02', pose: null })])).toBeNull()
    expect(next([robot({ source: 'Emulator' }), robot({ id: 'robot_03' })])?.robotId).toBe('robot_03')
  })

  it('emits from the shared hub snapshot and connection state, and unsubscribes', () => {
    const client = new QueryClient()
    const samples: unknown[] = []
    const states: string[] = []
    const stop = fleetTelemetrySource(client).subscribe(sample => samples.push(sample), state => states.push(state))
    client.setQueryData<FleetSnapshot>(fleetKey, { robots: [at('2026-11-11T09:00:00Z')], receivedAt: now })
    useFleetConnection.getState().set('connected')
    expect(samples).toHaveLength(1)
    expect(states).toEqual(['connecting', 'connected'])
    stop()
    client.setQueryData<FleetSnapshot>(fleetKey, { robots: [at('2026-11-11T09:00:02Z')], receivedAt: now })
    useFleetConnection.getState().set('reconnecting')
    expect(samples).toHaveLength(1)
    expect(states).toHaveLength(2)
  })
})
