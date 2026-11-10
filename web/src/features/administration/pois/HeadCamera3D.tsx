import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { ContactShadows, Line, OrbitControls, RoundedBox } from '@react-three/drei'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DoubleSide, type Group, Mesh } from 'three'
import { HEAD_PAN_LIMIT_DEG } from '../../technical/head-camera-preset'
import type { Pose } from './head-motion'

/**
 * 3D picture of the VR camera head at a POI: the robot's CAD body (front is +X, as in the Digital Twin) with a
 * pan/tilt head carrying the Quest 3 on its top cover. PAN turns about the vertical axis, positive to the left;
 * TILT about the head's own side axis, positive up. The head mount is drawn for explanation, not measured.
 * Loaded lazily, only where WebGL exists; the SVG views remain the fallback.
 */

const RAD = Math.PI / 180
const RING = 0.72
/** The mechanical PAN stop (robot firmware HOME offset): 174° to the right. */
const STOP_DEG = -174
const TOP = 0.474   // top cover of the CAD body, metres
const MAST_X = -0.16

function CadBody() {
  const gltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}models/robot/campus-amr.glb`)
  const model = useMemo(() => {
    const root = gltf.scene.clone(true)
    root.traverse(child => { if (child instanceof Mesh) { child.castShadow = true; child.receiveShadow = true } })
    return root
  }, [gltf.scene])
  return <primitive object={model} dispose={null} />
}

/** A floor arc around the head's axis, from one PAN angle to another (positive left). */
function arcPoints(from: number, to: number, radius = RING) {
  const points: [number, number, number][] = []
  const step = from < to ? 2 : -2
  for (let deg = from; step > 0 ? deg <= to : deg >= to; deg += step)
    points.push([MAST_X + radius * Math.cos(deg * RAD), 0.006, -radius * Math.sin(deg * RAD)])
  return points
}

function Quest3() {
  return <group position={[0.06, 0, 0]}>
    {/* Visor and front plate */}
    <RoundedBox args={[0.07, 0.095, 0.185]} radius={0.03} smoothness={4} castShadow>
      <meshStandardMaterial color="#f4f6f8" roughness={0.45} />
    </RoundedBox>
    <RoundedBox args={[0.012, 0.075, 0.16]} radius={0.006} position={[0.036, 0, 0]}>
      <meshStandardMaterial color="#e2e8f0" roughness={0.35} />
    </RoundedBox>
    {/* Three front sensors: two colour cameras and the depth sensor between them */}
    {[-0.045, 0.045].map(z => <mesh key={z} position={[0.043, -0.008, z]} rotation={[0, 0, -Math.PI / 2]}>
      <cylinderGeometry args={[0.013, 0.013, 0.006, 24]} /><meshStandardMaterial color="#0f172a" roughness={0.2} metalness={0.4} />
    </mesh>)}
    <mesh position={[0.043, 0.012, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <cylinderGeometry args={[0.008, 0.008, 0.006, 20]} /><meshStandardMaterial color="#1e293b" />
    </mesh>
    {/* Back of the headset (battery / strap mount) */}
    <RoundedBox args={[0.03, 0.05, 0.08]} radius={0.012} position={[-0.05, 0, 0]}>
      <meshStandardMaterial color="#334155" roughness={0.6} />
    </RoundedBox>
  </group>
}

function Head({ pose, still }: { pose: Pose; still: boolean }) {
  const pan = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  // Ease toward the pose: a new choice glides there, and "Chạy thử" (already smooth) is followed closely.
  useFrame((_, delta) => {
    const k = 1 - Math.exp(-14 * delta)
    if (pan.current) pan.current.rotation.y += (pose.pan * RAD - pan.current.rotation.y) * k
    if (tilt.current) tilt.current.rotation.z += (pose.tilt * RAD - tilt.current.rotation.z) * k
  })
  return <group position={[MAST_X, TOP, 0]}>
    {/* Mast and PAN motor */}
    <mesh position={[0, 0.09, 0]} castShadow><cylinderGeometry args={[0.022, 0.03, 0.18, 24]} /><meshStandardMaterial color="#475569" metalness={0.5} roughness={0.35} /></mesh>
    <group ref={pan} position={[0, 0.2, 0]}>
      <mesh castShadow><cylinderGeometry args={[0.045, 0.045, 0.04, 32]} /><meshStandardMaterial color="#1e293b" metalness={0.4} roughness={0.4} /></mesh>
      {/* TILT bracket: two arms around the headset */}
      {[-0.105, 0.105].map(z => <mesh key={z} position={[0.02, 0.065, z]} castShadow><boxGeometry args={[0.03, 0.11, 0.012]} /><meshStandardMaterial color="#334155" metalness={0.4} /></mesh>)}
      <group ref={tilt} position={[0.02, 0.1, 0]}>
        <Quest3 />
        {!still && <mesh position={[0.46, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.26, 0.78, 40, 1, true]} />
          <meshBasicMaterial color="#2d719e" transparent opacity={0.14} side={DoubleSide} depthWrite={false} />
        </mesh>}
      </group>
    </group>
  </group>
}

function Floor({ sweepDeg }: { sweepDeg: number | null }) {
  const stop = [MAST_X + RING * Math.cos(STOP_DEG * RAD), 0.02, -RING * Math.sin(STOP_DEG * RAD)] as const
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[1.25, 64]} /><meshStandardMaterial color="#f1f5f9" /></mesh>
    <Line points={arcPoints(-HEAD_PAN_LIMIT_DEG, HEAD_PAN_LIMIT_DEG)} color="#cbd5e1" lineWidth={2} />
    {sweepDeg != null && <Line points={arcPoints(-sweepDeg, sweepDeg, RING + 0.04)} color="#2d719e" lineWidth={3} dashed dashSize={0.03} gapSize={0.025} />}
    {/* Front marker on the floor */}
    <Line points={[[MAST_X + RING - 0.06, 0.006, 0], [MAST_X + RING + 0.08, 0.006, 0]]} color="#94a3b8" lineWidth={2} />
    <mesh position={stop} rotation={[0, STOP_DEG * RAD, 0]} castShadow><boxGeometry args={[0.04, 0.04, 0.04]} /><meshStandardMaterial color="#f59e0b" /></mesh>
  </group>
}

export default function HeadCamera3D({ pose, sweepDeg, still, label }: { pose: Pose; sweepDeg: number | null; still: boolean; label: string }) {
  return <div role="img" aria-label={label} className="relative h-64 w-full overflow-hidden rounded-xl bg-gradient-to-b from-[#eef4fa] to-[#f8fbfe]">
    <Canvas shadows dpr={[1, 2]} camera={{ position: [1.55, 1.55, 1.75], fov: 34 }} gl={{ antialias: true }}
      fallback={<p className="p-6 text-xs text-[#64748b]">Trình duyệt chưa hỗ trợ WebGL nên chưa xem được mô phỏng 3D. Số PAN, TILT bên dưới vẫn đúng.</p>}>
      <hemisphereLight args={['#ffffff', '#cbd5e1', 1.1]} />
      <directionalLight position={[2, 3, 1.5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <Suspense fallback={null}><CadBody /></Suspense>
      <Head pose={pose} still={still} />
      <Floor sweepDeg={sweepDeg} />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.35} scale={2.4} blur={2.2} far={1} />
      <OrbitControls target={[-0.08, 0.3, 0]} enablePan={false} minDistance={1.2} maxDistance={3.6} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
    <span className="pointer-events-none absolute right-2 top-1.5 rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-[#64748b]">Kéo để xoay góc nhìn</span>
  </div>
}
