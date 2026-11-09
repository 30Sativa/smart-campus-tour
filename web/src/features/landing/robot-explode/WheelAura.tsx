import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'

/** How the aura is laid out: speed arcs round the tyre, streaks on the floor behind, chevrons ahead. */
const AURA = { arcs: [{ radius: 0.118, width: 0.005, opacity: 0.9 }, { radius: 0.142, width: 0.0035, opacity: 0.5 }], streaks: 5, chevrons: 3 } as const

type AuraParts = { arcs: (Group | null)[]; halos: (Mesh | null)[]; streaks: (Mesh | null)[]; chevrons: (Mesh | null)[] }

function fade(mesh: Mesh | null, opacity: number) {
  if (mesh) (mesh.material as MeshBasicMaterial).opacity = opacity
}

/**
 * Moves the aura with the wheels: the arcs turn with the tyre, the halo
 * breathes, streaks slide back along the floor and chevrons slide forward,
 * everything as strong as the wheels are fast (`drive`, 0…1).
 */
function runAura(parts: AuraParts, angle: number, time: number, drive: number) {
  parts.arcs.forEach((arc, index) => {
    if (!arc) return
    arc.rotation.x = angle * (index % 2 ? 0.8 : 1)
    arc.children.forEach(child => fade(child as Mesh, (child.userData.opacity as number) * drive))
  })
  parts.halos.forEach(halo => {
    fade(halo, (0.1 + 0.06 * Math.sin(time * 5)) * drive)
    halo?.scale.setScalar(1 + 0.06 * Math.sin(time * 5))
  })
  parts.streaks.forEach((streak, index) => {
    if (!streak) return
    const phase = (time * 1.1 + (index % AURA.streaks) / AURA.streaks + (index % 3) * 0.13) % 1
    streak.position.z = -0.06 - phase * 0.34
    fade(streak, Math.sin(phase * Math.PI) * 0.7 * drive)
  })
  parts.chevrons.forEach((chevron, index) => {
    if (!chevron) return
    const phase = (time * 0.7 + (index % AURA.chevrons) / AURA.chevrons) % 1
    chevron.position.z = 0.08 + phase * 0.3
    fade(chevron, Math.sin(phase * Math.PI) * 0.85 * drive)
  })
}

/**
 * A moving aura round each drive wheel: glowing speed arcs turning with the
 * tyre over a soft halo, light streaks running back along the floor and
 * chevrons running ahead, so the robot is seen to drive forward (+z). It is
 * as strong as `drive` (0 hidden … 1 full); `angle` is how far the wheels
 * have turned (rad).
 */
export default function WheelAura({ centres, color, drive, angle }: {
  centres: readonly Vector3[]
  color: string
  drive: () => number
  angle: () => number
}) {
  const parts = useRef<AuraParts>({ arcs: [], halos: [], streaks: [], chevrons: [] })
  useFrame(state => runAura(parts.current, angle(), state.clock.elapsedTime, drive()))
  return (
    <>
      {centres.map((centre, side) => {
        const out = centre.x < 0 ? -1 : 1
        return (
          <group key={side} position={centre}>
            {AURA.arcs.map((arc, layer) => (
              <group key={layer} ref={node => { parts.current.arcs[side * AURA.arcs.length + layer] = node }}>
                {[0, 1, 2].map(index => (
                  <mesh key={index} rotation={[0, Math.PI / 2, ((index + layer * 0.5) * Math.PI * 2) / 3]} userData={{ opacity: arc.opacity }} renderOrder={21}>
                    <torusGeometry args={[arc.radius, arc.width, 8, 48, Math.PI * (layer ? 0.3 : 0.42)]} />
                    <meshBasicMaterial color={layer ? '#ffffff' : color} transparent opacity={0} depthTest={false} toneMapped={false} />
                  </mesh>
                ))}
              </group>
            ))}
            <mesh ref={node => { parts.current.halos[side] = node }} position={[out * 0.03, 0, 0]} rotation={[0, Math.PI / 2, 0]} renderOrder={20}>
              <ringGeometry args={[0.09, 0.15, 48]} />
              <meshBasicMaterial color={color} transparent opacity={0} depthTest={false} toneMapped={false} side={2} />
            </mesh>
            {Array.from({ length: AURA.streaks }, (_, index) => (
              <mesh
                key={`s${index}`}
                ref={node => { parts.current.streaks[side * AURA.streaks + index] = node }}
                position={[out * (0.005 + (index - 2) * 0.012), 0.002 - centre.y, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                renderOrder={20}
              >
                <planeGeometry args={[0.005, 0.09 + (index % 2) * 0.05]} />
                <meshBasicMaterial color={color} transparent opacity={0} depthTest={false} toneMapped={false} side={2} />
              </mesh>
            ))}
            {Array.from({ length: AURA.chevrons }, (_, index) => (
              <mesh
                key={`c${index}`}
                ref={node => { parts.current.chevrons[side * AURA.chevrons + index] = node }}
                position={[0, 0.003 - centre.y, 0]}
                rotation={[Math.PI / 2, 0, 0]}
                renderOrder={20}
              >
                <ringGeometry args={[0.026, 0.04, 3, 1, Math.PI / 6, (Math.PI * 2) / 3]} />
                <meshBasicMaterial color={color} transparent opacity={0} depthTest={false} toneMapped={false} side={2} />
              </mesh>
            ))}
          </group>
        )
      })}
    </>
  )
}
