import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { Object3D, type DirectionalLight, type Group } from 'three'
import type { MapProps } from './world'

/* The robot alone on a dark stage, for the home page's parts (no map to load). */

/** A quiet floor round the robot: its shadow and a fine grid fading into the dark. */
export function StudioFloor({ driveRef }: MapProps) {
  const follow = useRef<Group>(null)
  useFrame(() => {
    const { x, y } = driveRef.current
    follow.current?.position.set(x, 0.01, y)
  })
  return (
    <group ref={follow}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[6, 64]} />
        <shadowMaterial transparent opacity={0.4} />
      </mesh>
      {/* A little above the shadow, not in its plane, so the two do not fight over the same depth. */}
      <Grid position={[0, 0.004, 0]} args={[10, 10]} cellSize={0.1} cellThickness={0.6} cellColor="#9fb3bf" sectionSize={0.5} sectionThickness={1} sectionColor="#7f97a6" fadeDistance={8} fadeStrength={1.6} infiniteGrid />
    </group>
  )
}

/** A soft key light from the front left that follows the robot, a cool fill and the sky. */
export function StudioLights({ driveRef }: MapProps) {
  const key = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])
  useFrame(() => {
    const { x, y } = driveRef.current
    target.position.set(x, 0, y)
    target.updateMatrixWorld()
    key.current?.position.set(x - 3, 6, y + 4)
  })
  return (
    <>
      <primitive object={target} />
      <hemisphereLight args={['#dbe9f2', '#1a2630', 1.1]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        ref={key}
        target={target}
        color="#fff4e6"
        intensity={2.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[6, 3, -5]} color="#9fd8ff" intensity={0.7} />
    </>
  )
}
