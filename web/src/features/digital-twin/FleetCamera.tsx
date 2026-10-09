import { Suspense, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CampusModel } from './CampusModel'
import { RobotModel } from './RobotModel'
import { PATROL_FLOOR_Y, PATROL_MODEL_SCALE, PATROL_TRANSFORM, type PatrolState } from './patrol-demo'
import { mapToScenePose } from './map-config'

function CameraRig({ state, number, cctv }: { state: PatrolState; number: number; cctv: boolean }) {
  const { camera } = useThree()
  const r = state.robots.find(robot => robot.number === number)!
  const target = useMemo(() => mapToScenePose(r.pose, PATROL_TRANSFORM), [r.pose])
  useFrame(() => {
    const [x, , z] = target.position, yaw = target.rotation
    if (cctv) { camera.position.set(x + 0.9, PATROL_FLOOR_Y + 1.8, z + 0.7); camera.lookAt(x, PATROL_FLOOR_Y, z) }
    else {
      camera.position.set(x + Math.cos(yaw) * PATROL_MODEL_SCALE * 0.46, PATROL_FLOOR_Y + PATROL_MODEL_SCALE * 0.35, z - Math.sin(yaw) * PATROL_MODEL_SCALE * 0.46)
      camera.lookAt(x + Math.cos(yaw) * 1.4, PATROL_FLOOR_Y + PATROL_MODEL_SCALE * 0.3, z - Math.sin(yaw) * 1.4)
    }
  })
  return null
}

export function FleetCamera({ state, number, cctv }: { state: PatrolState; number: number; cctv: boolean }) {
  if (state.cameraOffline) return <div className="grid h-52 place-items-center rounded-xl bg-slate-900 text-sm text-slate-200">Camera ảo mất kết nối · khôi phục tại Kịch bản</div>
  return <div className="relative h-52 overflow-hidden rounded-xl bg-slate-100" role="img" aria-label={`Camera ảo ${cctv ? 'CCTV' : 'trên robot'} R${number}`}>
    <Canvas dpr={1} frameloop="always" camera={{ fov: 65, near: 0.01 }}>
      <color attach="background" args={['#edf2fa']} /><ambientLight intensity={0.9} /><directionalLight position={[5,12,6]} intensity={1.2} />
      <Suspense fallback={null}><CampusModel modelKey="nvh-v3" />
        {state.robots.filter(r => cctv || r.number !== number).map(r => <RobotModel key={r.id} cad pose={r.pose} transform={PATROL_TRANSFORM} scale={PATROL_MODEL_SCALE} groundY={PATROL_FLOOR_Y} exactPose showDirection={false} />)}
      </Suspense>
      <CameraRig state={state} number={number} cctv={cctv} />
    </Canvas>
    <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[10px] text-white">SCENE CAMERA · R{number} · {state.seconds.toFixed(1)}s</span>
  </div>
}
