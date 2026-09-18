import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'

/**
 * Smoke test for the React Three Fiber setup: canvas, lighting, a demo mesh
 * and orbit controls. Not the real Digital Twin.
 *
 * The height is bounded rather than a viewport calculation. It used to be
 * `100dvh - 4rem`, which is the height of the whole shell viewport, but this
 * canvas sits inside a card that is itself below a sticky header, a page
 * heading and a card heading: a full-viewport child pushed the status list it
 * belongs with entirely off the screen, and on a phone the visitor met a tall
 * dark rectangle with no context above or below it.
 */
export function DigitalTwinCanvas() {
  return (
    <div className="h-[clamp(320px,52vh,560px)] w-full bg-slate-950">
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
