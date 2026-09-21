import { Grid, Line, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { DEMO_ROUTE, type RobotPose } from '../features/digital-twin/demo-motion'
import { CampusModel } from '../features/digital-twin/CampusModel'
import { RobotModel } from '../features/digital-twin/RobotModel'

export function DigitalTwinCanvas({ pose, overhead }: { pose: RobotPose; overhead: boolean }) {
  return <div className="h-[clamp(340px,58vh,640px)] w-full bg-[#edf2fa]" role="img" aria-label="Khuôn viên minh họa 3D với robot chạy trên tuyến vòng tròn">
    <Canvas key={String(overhead)} shadows camera={{ position: overhead ? [0, 18, 0.01] : [12, 11, 12], fov: 45 }} fallback={<p className="p-8 text-sm text-[#40546f]">Trình duyệt chưa hỗ trợ WebGL. Bạn vẫn có thể xem tọa độ robot trong bảng thông tin.</p>}>
      <color attach="background" args={['#edf2fa']} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 12, 6]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} />
      <Grid position={[0, -0.32, 0]} args={[24, 24]} cellSize={1} cellColor="#dce9fb" sectionSize={5} sectionColor="#b8c9e0" fadeDistance={35} />
      <CampusModel />
      <Line points={DEMO_ROUTE} color="#5b91ed" lineWidth={2} dashed dashSize={0.18} gapSize={0.12} />
      <RobotModel pose={pose} smoothing={25} />
      <OrbitControls makeDefault target={[0, 0, 0]} minDistance={6} maxDistance={30} maxPolarAngle={Math.PI / 2.1} />
    </Canvas>
  </div>
}
