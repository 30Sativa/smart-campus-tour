import { useState, type ReactNode } from 'react'
import { Html, Line } from '@react-three/drei'
import { modelHorizontalDistance, type ScenePosition as Position } from './scene-ruler'

/** Measurements use the displayed model metres, not an uncalibrated ROS frame. */
export function SceneRuler({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [points, setPoints] = useState<Position[]>([])
  const distance = points.length === 2 ? modelHorizontalDistance(points[0], points[1]) : 0
  const raised = points.map(([x, y, z]): Position => [x, y + 0.015, z])
  return <group onClick={enabled ? event => {
    event.stopPropagation()
    const point = event.point.toArray() as Position
    setPoints(current => current.length === 1 ? [...current, point] : [point])
  } : undefined}>
    {children}
    {enabled && raised.map((point, i) => <mesh name="measurement-point" key={i} position={point}><sphereGeometry args={[0.025, 12, 12]} /><meshBasicMaterial color="#e0f2fe" toneMapped={false} /></mesh>)}
    {enabled && raised.length === 2 && <group>
      <Line points={raised} color="#e0f2fe" lineWidth={1} />
      <Html center position={raised[0].map((v, i) => (v + raised[1][i]) / 2) as Position} zIndexRange={[25, 20]}><span className="pointer-events-none whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white">{distance.toFixed(2)} m</span></Html>
    </group>}
  </group>
}
