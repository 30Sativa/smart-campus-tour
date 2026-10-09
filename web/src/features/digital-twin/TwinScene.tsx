import { Grid, Html, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import type { MapPose, RouteStop } from '../../api/contracts/staff'
import { CampusModel } from './CampusModel'
import { mapToScene } from './demo-motion'
import { RobotModel } from './RobotModel'
import type { Affine2D } from './map-config'
import type { CampusModelKey } from './campus-model'
import { PATROL_POIS, PATROL_TRANSFORM, PATROL_FLOOR_Y } from './patrol-demo'
import { mapToScenePose } from './map-config'
import { FleetPathLine, type FleetPath } from './FleetPaths'
import { nodePoint } from './patrol-routing'

export type TwinRobot = {
  id: string
  name: string
  pose: MapPose
  transform?: Affine2D
  /** Status colour, already resolved from the tone table. */
  color: string
  /** Driving right now: gets the pulse ring. */
  active: boolean
  focused: boolean
  /** Pose too old to show as live: greyed, no motion. */
  stale: boolean
  /** Camera head relative to the body, radians. */
  headYaw: number
  scale?: number
  groundY?: number
  exactPose?: boolean
  traffic?: 'hold' | 'yield' | 'clear'
}

export type TwinRoute = {
  stops: RouteStop[]
  endPoint: { name: string; position: MapPose }
  /** Index of the POI being approached or visited; null when heading to the end point. */
  targetIndex: number | null
  heading: 'poi' | 'end' | 'none'
}

export type TwinSceneProps = {
  modelKey?: CampusModelKey
  robots: TwinRobot[]
  route?: TwinRoute | null
  selectedStopId?: string | null
  overhead: boolean
  showLabels: boolean
  syntheticPatrol?: boolean
  patrolPaths?: FleetPath[]
  seconds?: number
  onSelectRobot?: (id: string) => void
  heat?: Record<number, number>
  viewMode?: string
  sensors?: boolean
}

const STOP_COLOR: Record<RouteStop['status'], string> = {
  Completed: '#2f8f6b',
  Current: '#2f62b8',
  Upcoming: '#9aa8bd',
  Skipped: '#c3cad6',
}

const ground = (pose: MapPose): [number, number, number] => {
  const { position } = mapToScene({ x: pose.x, y: pose.y, yaw: 0 })
  return [position[0], 0, position[2]]
}

function Marker({ position, color, label, number, emphasis, showLabel, fixedLabel = false }: { position: MapPose; color: string; label: string; number: string; emphasis: 'target' | 'selected' | null; showLabel: boolean; fixedLabel?: boolean }) {
  return (
    <group position={ground(position)}>
      <mesh position={[0, 0.03, 0]} rotation={fixedLabel ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
        {fixedLabel ? <ringGeometry args={[0.16, 0.2, 48]} /> : <cylinderGeometry args={[emphasis ? 0.34 : 0.26, emphasis ? 0.34 : 0.26, 0.06, 32]} />}
        <meshStandardMaterial color={color} />
      </mesh>
      {emphasis && (
        <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.52, 40]} />
          <meshBasicMaterial color={emphasis === 'selected' ? '#1f314d' : '#2f62b8'} transparent opacity={0.75} />
        </mesh>
      )}
      <Html position={[0, fixedLabel ? 0.06 : 0.45, 0]} center distanceFactor={fixedLabel ? undefined : 14} zIndexRange={[10, 0]}>
        <span aria-label={fixedLabel ? `Điểm point ${number}` : undefined} className={`pointer-events-none inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${fixedLabel ? 'text-[#40546f]' : emphasis === 'target' ? 'bg-[#2f62b8] text-white shadow-sm' : emphasis === 'selected' ? 'bg-[#1f314d] text-white shadow-sm' : 'bg-white/90 text-[#40546f] shadow-sm'}`}>
          <span className="tabular-nums">{number}</span>
          {!fixedLabel && (showLabel || emphasis) && <span>{label}</span>}
        </span>
      </Html>
    </group>
  )
}

/**
 * POIs in order, the end point, and the current target. No line is drawn
 * between POIs: the real Nav2 path is not known here, and a straight line
 * through walls would pretend it is (scope §11.3).
 */
function Route({ route, selectedStopId, showLabels }: { route: TwinRoute; selectedStopId?: string | null; showLabels: boolean }) {
  return (
    <group>
      {route.stops.map((stop, index) => (
        <Marker key={stop.id} position={stop.position} color={STOP_COLOR[stop.status]} label={stop.name} number={String(index + 1)} showLabel={showLabels} emphasis={stop.id === selectedStopId ? 'selected' : route.heading === 'poi' && route.targetIndex === index ? 'target' : null} />
      ))}
      <Marker position={route.endPoint.position} color="#1f314d" label={`Kết thúc · ${route.endPoint.name}`} number="⚑" showLabel={showLabels} emphasis={route.heading === 'end' ? 'target' : null} />
    </group>
  )
}

/**
 * The WebGL half of the operational twin. Kept apart from the DOM wrapper so
 * tests can replace it: jsdom has no WebGL (web/AGENTS.md §5).
 */
export default function TwinScene({ robots, route, selectedStopId, overhead, showLabels, modelKey, syntheticPatrol = false, patrolPaths = [], seconds = 0, onSelectRobot, heat = {}, viewMode = 'scene', sensors = false }: TwinSceneProps) {
  return (
    <Canvas
      key={String(overhead)}
      dpr={[1, 1.5]}
      // No shadows: this view re-renders on every telemetry sample, and a soft
      // shadow map over the whole campus costs more than it tells anyone.
      camera={{ position: overhead ? [0, modelKey === 'nvh-v3' ? 28 : 21, 0.01] : modelKey === 'nvh-v3' ? [6, 21, 15] : [5, 17, 12], fov: 42 }}
      fallback={<p className="p-8 text-sm text-[#40546f]">Trình duyệt chưa hỗ trợ WebGL. Vị trí robot vẫn có trong bảng thông tin.</p>}
    >
      <color attach="background" args={['#edf2fa']} />
      <ambientLight intensity={modelKey === 'nvh-v3' ? 0.85 : 1.5} />
      <directionalLight position={[5, 12, 6]} intensity={modelKey === 'nvh-v3' ? 1.2 : 2} />
      <Grid position={[0, -0.32, 0]} args={[26, 26]} cellSize={1} cellColor="#dce9fb" sectionSize={5} sectionColor="#b8c9e0" fadeDistance={38} />
      <CampusModel modelKey={modelKey} />
      {syntheticPatrol && <group>
        {patrolPaths.map(path => <FleetPathLine key={path.id} route={path} seconds={seconds} />)}
        {viewMode === 'heatmap' && Object.entries(heat).filter(([,count]) => count > 0).map(([id, count]) => {
          const p = nodePoint(Number(id)), { position } = mapToScenePose({ ...p, yaw: 0 }, PATROL_TRANSFORM)
          return <mesh key={id} position={[position[0], PATROL_FLOOR_Y + 0.025, position[2]]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.08, 12]} /><meshBasicMaterial color="#f97316" transparent opacity={Math.min(0.75, 0.15 + count * 0.05)} /></mesh>
        })}
        {showLabels && PATROL_POIS.map(p => {
          const { position } = mapToScenePose({ ...p, yaw: 0 }, PATROL_TRANSFORM)
          return <group key={p.poi} position={[0, PATROL_FLOOR_Y, 0]}><Marker position={{ x: position[0], y: -position[2] }} color="#5997b4" label="60 giây" number={String(p.poi)} showLabel={showLabels} emphasis={null} fixedLabel /></group>
        })}
      </group>}
      {route && showLabels && <Route route={route} selectedStopId={selectedStopId} showLabels={showLabels} />}
      {robots.map((robot) => (
        <RobotModel key={robot.id} cad={syntheticPatrol} onSelect={onSelectRobot ? () => onSelectRobot(robot.id) : undefined} pose={{ x: robot.pose.x, y: robot.pose.y, yaw: robot.pose.yaw ?? 0 }} transform={robot.transform} accent={robot.color} pulse={robot.active && !robot.stale} dimmed={robot.stale || (!robot.focused && Boolean(route))} stale={robot.stale} headYaw={robot.headYaw} scale={robot.scale} groundY={robot.groundY} exactPose={robot.exactPose} showDirection={!syntheticPatrol}>
          {syntheticPatrol && viewMode === 'traffic' && <mesh position={[0,0.025,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[0.72,0.85,40]}/><meshBasicMaterial color={robot.traffic==='hold'?'#dc2626':robot.traffic==='yield'?'#f59e0b':'#16a34a'} transparent opacity={0.75}/></mesh>}
          {syntheticPatrol && sensors && <mesh position={[0,0.02,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[0.2,4,48,1,-Math.PI*0.75,Math.PI*1.5]}/><meshBasicMaterial color={robot.color} transparent opacity={0.06} depthWrite={false}/></mesh>}
          <Html position={[0, 1.1, 0]} center distanceFactor={syntheticPatrol ? undefined : 14} zIndexRange={[20, 10]}>
            <span style={syntheticPatrol ? { backgroundColor: robot.color } : undefined} className={`pointer-events-none rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold whitespace-nowrap shadow-sm ${syntheticPatrol ? 'inline-block -translate-y-5 text-white' : robot.stale ? 'bg-[#fff8e6] text-[#8a5a06]' : robot.focused ? 'bg-[#1f314d] text-white' : 'bg-white/90 text-[#40546f]'}`}>
              {robot.name}{robot.stale ? ' · dữ liệu cũ' : ''}
            </span>
          </Html>
        </RobotModel>
      ))}
      <OrbitControls makeDefault target={[0, 0, 0]} minDistance={6} maxDistance={32} maxPolarAngle={Math.PI / 2.1} />
    </Canvas>
  )
}
