import { Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CampusModel } from './CampusModel'
import { RobotModel } from './RobotModel'
import { PATROL_FLOOR_Y, PATROL_MODEL_SCALE, PATROL_TRANSFORM, type PatrolState } from './patrol-demo'
import { fleetCameraView, type CameraMode } from './camera-view'
import { CampusLighting } from './CampusLighting'
import { PCFShadowMap } from 'three'

function CameraRig({ state, number, mode, point }: { state: PatrolState; number: number; mode: CameraMode; point: number }) {
  const { camera } = useThree()
  const view = fleetCameraView(state, number, mode, point)
  useFrame(() => {
    camera.position.set(...view.position)
    camera.lookAt(...view.target)
  })
  return null
}

export function FleetCamera({ state, number, mode, point }: { state: PatrolState; number: number; mode: CameraMode; point: number }) {
  if (state.cameraOffline) return <div className="grid h-52 place-items-center rounded-xl bg-slate-900 text-sm text-slate-200">Camera ảo mất kết nối · khôi phục tại Kịch bản</div>
  const label = mode === 'point' ? `Camera point ${point + 1}` : `Camera ảo ${mode === 'cctv' ? 'CCTV' : 'trên robot'} R${number}`
  return <div className="relative h-64 overflow-hidden rounded-xl bg-slate-100" role="img" aria-label={label}>
    <Canvas dpr={1} shadows={{ type: PCFShadowMap }} frameloop="always" camera={{ fov: mode === 'point' ? 75 : 65, near: 0.01 }}>
      <color attach="background" args={['#20313f']} /><CampusLighting />
      <Suspense fallback={null}><CampusModel modelKey="nvh-v3" />
        {state.robots.filter(r => mode !== 'robot' || r.number !== number).map(r => <RobotModel key={r.id} cad pose={r.pose} transform={PATROL_TRANSFORM} scale={PATROL_MODEL_SCALE} groundY={PATROL_FLOOR_Y} exactPose showDirection={false} />)}
      </Suspense>
      <CameraRig state={state} number={number} mode={mode} point={point} />
    </Canvas>
    <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[10px] text-white">SCENE CAMERA · {mode === 'point' ? `Point ${point + 1}` : `R${number}`} · {state.seconds.toFixed(1)}s</span>
  </div>
}
