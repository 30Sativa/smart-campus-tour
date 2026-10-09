import { useRef, type ComponentRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { PATROL_FLOOR_Y, PATROL_TRANSFORM } from './patrol-demo'
import { mapToScenePose } from './map-config'
import type { Point } from './patrol-routing'

export type FleetPath = { id: string; color: string; points: Point[]; active: boolean }
export function FleetPathLine({ route, seconds }: { route: FleetPath; seconds: number }) {
  const line = useRef<ComponentRef<typeof Line>>(null)
  useFrame(() => { if (line.current) line.current.material.dashOffset = -seconds * 0.22 })
  if (route.points.length < 2) return null
  return <Line ref={line} points={route.points.map(p => {
    const { position } = mapToScenePose({ ...p, yaw: 0 }, PATROL_TRANSFORM)
    return [position[0], PATROL_FLOOR_Y + 0.02, position[2]] as [number, number, number]
  })} color={route.color} lineWidth={2} dashed dashSize={0.12} gapSize={0.08} transparent opacity={route.active ? 0.85 : 0.4} />
}
