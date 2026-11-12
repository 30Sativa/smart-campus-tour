import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { CanvasTexture, Object3D, SRGBColorSpace, type DirectionalLight, type Group } from 'three'
import type { MapProps } from './world'

/* The robot alone on a dark stage, for the home page: no map to load, only a
   floor that follows it and a grid that slides past while it drives in the
   scroll story's first chapters. */

const FLOOR = '#16232d'

/** A soft round pool of light on the floor: bright round the robot, fading into the dark. */
function poolTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(120, 160, 180, 0.32)')
    gradient.addColorStop(0.35, 'rgba(70, 105, 125, 0.16)')
    gradient.addColorStop(1, 'rgba(22, 35, 45, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/** The stage floor round the robot, a pool of light under it and the grid. */
export function StudioFloor({ driveRef }: MapProps) {
  const follow = useRef<Group>(null)
  const pool = useMemo(() => poolTexture(), [])
  useFrame(() => {
    const { x, y } = driveRef.current
    follow.current?.position.set(x, 0, y)
  })
  return (
    <group>
      <group ref={follow}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[60, 64]} />
          <meshStandardMaterial color={FLOOR} roughness={0.92} metalness={0.05} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} renderOrder={1}>
          <planeGeometry args={[9, 9]} />
          <meshBasicMaterial map={pool} transparent depthWrite={false} />
        </mesh>
      </group>
      <Grid position={[0, 0.006, 0]} args={[30, 30]} cellSize={0.5} cellThickness={0.55} cellColor="#2a3f4d" sectionSize={2.5} sectionThickness={1} sectionColor="#3c5a6c" fadeDistance={26} fadeStrength={1.4} infiniteGrid />
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
