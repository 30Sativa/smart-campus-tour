import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh } from 'three'
import { mapToScene, type RobotPose } from './demo-motion'

/**
 * The CampusTour robot in the 3D scene: a two-wheel platform carrying the
 * camera on a pan head.
 *
 * - It eases toward each new pose rather than jumping, so a ~1 Hz telemetry
 *   stream still reads as motion; `smoothing` is how fast it catches up. It
 *   never moves past the last sample it was given.
 * - `headYaw` turns only the camera head, relative to the body: panning the
 *   camera never turns the body marker (scope §11.6).
 * - `accent` carries status colour; `pulse` draws one soft ring under a robot
 *   that is actively driving; `dimmed` greys a robot out of focus or stale.
 */
export function RobotModel({ pose, accent = '#2f62b8', pulse = false, dimmed = false, smoothing = 4, headYaw = 0, children }: {
  pose: RobotPose
  accent?: string
  pulse?: boolean
  dimmed?: boolean
  smoothing?: number
  headYaw?: number
  children?: ReactNode
}) {
  const group = useRef<Group>(null)
  const head = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const target = mapToScene(pose)
  useFrame((state, delta) => {
    const blend = 1 - Math.exp(-smoothing * delta)
    if (group.current) {
      group.current.position.x += (target.position[0] - group.current.position.x) * blend
      group.current.position.z += (target.position[2] - group.current.position.z) * blend
      const difference = target.rotation - group.current.rotation.y
      group.current.rotation.y += Math.atan2(Math.sin(difference), Math.cos(difference)) * blend
    }
    if (head.current) head.current.rotation.y += (headYaw - head.current.rotation.y) * (1 - Math.exp(-3 * delta))
    if (ring.current) {
      const phase = (state.clock.elapsedTime % 2.4) / 2.4
      ring.current.scale.setScalar(1 + phase * 1.4)
      const material = ring.current.material as { opacity: number }
      material.opacity = 0.35 * (1 - phase)
    }
  })
  const body = dimmed ? '#c9d3e1' : '#eaf4ff'
  return (
    <group ref={group} position={target.position} rotation={[0, target.rotation, 0]}>
      {pulse && (
        <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.62, 48]} />
          <meshBasicMaterial color={accent} transparent opacity={0.3} />
        </mesh>
      )}
      <mesh position={[0, 0.25, 0]} castShadow><boxGeometry args={[0.7, 0.32, 0.5]} /><meshStandardMaterial color={body} metalness={0.25} roughness={0.4} /></mesh>
      {[-0.28, 0.28].map((z) => <mesh key={z} position={[0, 0.15, z]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.15, 0.15, 0.08, 24]} /><meshStandardMaterial color="#28384b" /></mesh>)}
      <mesh position={[0.365, 0.29, 0]}><boxGeometry args={[0.015, 0.06, 0.28]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1} /></mesh>
      <mesh position={[0.8, 0.04, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.13, 0.3, 3]} /><meshBasicMaterial color={accent} /></mesh>
      <group ref={head} position={[0, 0.48, 0]}>
        <mesh castShadow><boxGeometry args={[0.42, 0.15, 0.38]} /><meshStandardMaterial color={dimmed ? '#9aa8bd' : accent} /></mesh>
        <mesh position={[0.16, 0.13, 0]}><cylinderGeometry args={[0.09, 0.09, 0.1, 24]} /><meshStandardMaterial color="#162740" /></mesh>
        <mesh position={[0.26, 0.13, 0]} rotation={[0, 0, -Math.PI / 2]}><cylinderGeometry args={[0.05, 0.05, 0.06, 16]} /><meshStandardMaterial color="#0d1726" /></mesh>
      </group>
      {children}
    </group>
  )
}
