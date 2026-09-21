import { useRef } from 'react'
import { Grid, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { DEMO_ROUTE, mapToScene, type RobotPose } from '../features/digital-twin/demo-motion'
import { CampusModel } from '../features/digital-twin/CampusModel'

function Robot({ pose }: { pose: RobotPose }) {
  const group = useRef<Group>(null)
  const target = mapToScene(pose)
  useFrame((_, delta) => {
    if (!group.current) return
    const blend = 1 - Math.exp(-25 * delta)
    group.current.position.x += (target.position[0] - group.current.position.x) * blend
    group.current.position.z += (target.position[2] - group.current.position.z) * blend
    const difference = target.rotation - group.current.rotation.y
    group.current.rotation.y += Math.atan2(Math.sin(difference), Math.cos(difference)) * blend
  })
  return <group ref={group} position={target.position} rotation={[0, target.rotation, 0]}>
    <mesh position={[0, 0.25, 0]} castShadow><boxGeometry args={[0.7, 0.32, 0.5]} /><meshStandardMaterial color="#eaf4ff" metalness={0.25} roughness={0.4} /></mesh>
    <mesh position={[0, 0.48, 0]} castShadow><boxGeometry args={[0.42, 0.15, 0.38]} /><meshStandardMaterial color="#2f62b8" /></mesh>
    <mesh position={[0.16, 0.61, 0]}><cylinderGeometry args={[0.09, 0.09, 0.1, 24]} /><meshStandardMaterial color="#162740" /></mesh>
    {[-0.28, 0.28].map((z) => <mesh key={z} position={[0, 0.15, z]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.15, 0.15, 0.08, 24]} /><meshStandardMaterial color="#28384b" /></mesh>)}
    <mesh position={[0.365, 0.29, 0]}><boxGeometry args={[0.015, 0.06, 0.28]} /><meshStandardMaterial color="#5b91ed" emissive="#5b91ed" emissiveIntensity={1} /></mesh>
    <mesh position={[0.8, 0.04, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.13, 0.3, 3]} /><meshBasicMaterial color="#2f62b8" /></mesh>
  </group>
}

export function DigitalTwinCanvas({ pose, overhead }: { pose: RobotPose; overhead: boolean }) {
  return <div className="h-[clamp(340px,58vh,640px)] w-full bg-[#edf2fa]" role="img" aria-label="Khuôn viên minh họa 3D với robot chạy trên tuyến vòng tròn">
    <Canvas key={String(overhead)} shadows camera={{ position: overhead ? [0, 18, 0.01] : [12, 11, 12], fov: 45 }} fallback={<p className="p-8 text-sm text-[#40546f]">Trình duyệt chưa hỗ trợ WebGL. Bạn vẫn có thể xem tọa độ robot trong bảng thông tin.</p>}>
      <color attach="background" args={['#edf2fa']} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 12, 6]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} />
      <Grid position={[0, -0.32, 0]} args={[24, 24]} cellSize={1} cellColor="#dce9fb" sectionSize={5} sectionColor="#b8c9e0" fadeDistance={35} />
      <CampusModel />
      <Line points={DEMO_ROUTE} color="#5b91ed" lineWidth={2} dashed dashSize={0.18} gapSize={0.12} />
      <Robot pose={pose} />
      <OrbitControls makeDefault target={[0, 0, 0]} minDistance={6} maxDistance={30} maxPolarAngle={Math.PI / 2.1} />
    </Canvas>
  </div>
}
