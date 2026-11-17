import { describe, expect, it } from 'vitest'
import { createPatrol } from '../../digital-twin/patrol-demo'
import { patrolTwinRobots } from '../../digital-twin/use-simulated-patrol'
import type { FleetRobot } from '../operations/fleet-telemetry'
import { ageText, defaultRobot, fleetSummary, realRobotViews } from './fleet-twin'

const robot = (patch: Partial<FleetRobot> = {}): FleetRobot => ({
  id: 'amr_01', name: 'AMR 01', connectionState: 'Live', batteryPercent: 80, lastSeenAt: '2026-11-15T02:00:00Z',
  telemetryAgeSeconds: 0, source: 'Physical', pose: { x: 0, y: 0, yaw: 0, capturedAt: '2026-11-15T02:00:00Z' },
  poseAgeSeconds: 0, localized: true, motionReady: true, syncFresh: true, poseFresh: true, executionStatus: 'IDLE',
  mapKey: 'map2-v2', frameId: 'map', legId: null, faultCode: null, needsCheck: false, ...patch,
})
const now = Date.parse('2026-11-15T02:00:10Z')

describe('Digital Twin fleet reading', () => {
  it('counts only physical robots, never Gazebo, Emulator or the patrol', () => {
    const views = realRobotViews([robot(), robot({ id: 'gz', source: 'Gazebo' }), robot({ id: 'em', source: 'Emulator' })], now, now, [])
    expect(views.map(view => view.robot.id)).toEqual(['amr_01'])
    expect(fleetSummary(views)).toBe('1 robot thật · amr_01 đang chờ')
    expect(patrolTwinRobots(createPatrol(), { playing: true, prefix: 'S', synthetic: true }).map(item => `${item.name}:${item.synthetic}`))
      .toEqual(['S1:true', 'S2:true', 'S3:true', 'S4:true', 'S5:true', 'S6:true'])
  })

  it('ages a pose since the broadcast and greys it past the stale limit', () => {
    const [view] = realRobotViews([robot({ poseAgeSeconds: 1 })], now - 3000, now, [])
    expect(view.ageSeconds).toBe(4)
    expect(view.stale).toBe(true)
    expect(view.color).toBe('#8a98ac')
    expect(ageText(4, now)).toBe('4 giây trước')
  })

  it('opens on ?robot= when it is physical, else on the newest pose', () => {
    const views = realRobotViews([robot({ id: 'a', poseAgeSeconds: 3 }), robot({ id: 'b', poseAgeSeconds: 1 })], now, now, [])
    expect(defaultRobot(views, null)?.robot.id).toBe('b')
    expect(defaultRobot(views, 'A')?.robot.id).toBe('a')
    expect(defaultRobot(views, 'nope')?.robot.id).toBe('b')
  })
})
