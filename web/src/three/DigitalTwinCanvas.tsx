import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'

/**
 * Smoke test for the React Three Fiber setup: canvas, lighting, a demo mesh
 * and orbit controls. Not the real Digital Twin.
 */
export function DigitalTwinCanvas() {
  return (
    <div className="h-screen w-full bg-slate-950">
      <Canvas camera={{ position: [3, 3, 3] }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 5, 5]} />

        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="orange" />
        </mesh>

        <OrbitControls />
      </Canvas>
    </div>
  )
}
