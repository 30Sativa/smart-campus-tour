import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MotionTest } from '../components/ui/MotionTest'

export function DigitalTwinCanvas() {
  return (
    <div className="relative h-screen w-full bg-slate-950">
      <MotionTest />

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