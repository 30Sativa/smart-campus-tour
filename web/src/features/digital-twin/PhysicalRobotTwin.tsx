import { lazy, Suspense, useEffect, useReducer, useState } from 'react'
import type { RealtimeConnectionState } from '../../api/contracts/staff-realtime'
import { panelClass } from '../../components/ui/ConsolePrimitives'
import { useNow } from '../staff/use-now'
import { mapConfigFor } from './map-config'
import { acceptObservation, observationView, type RobotObservation, type RobotTelemetrySource } from './robot-telemetry'
import type { CampusModelKey } from './campus-model'

const TwinScene = lazy(() => import('./TwinScene'))
const connectionLabels: Record<RealtimeConnectionState, string> = {
  connecting: 'Đang kết nối', connected: 'Đã kết nối', reconnecting: 'Đang kết nối lại', disconnected: 'Chưa kết nối',
}
type State = { sample: RobotObservation | null; connection: RealtimeConnectionState; rejected: boolean }
type Action = { type: 'observation'; value: unknown; now: number } | { type: 'connection'; value: RealtimeConnectionState } | { type: 'reset' }
const initial: State = { sample: null, connection: 'disconnected', rejected: false }
function reduce(state: State, action: Action): State {
  if (action.type === 'reset') return initial
  if (action.type === 'connection') return { ...state, connection: action.value }
  const sample = acceptObservation(state.sample, action.value, action.now)
  return { ...state, sample, rejected: sample === state.sample }
}

/** Prepared read-only surface. No production transport is bound before ADR-0008 passes. */
export function PhysicalRobotTwin({ source }: { source?: RobotTelemetrySource }) {
  const [state, dispatch] = useReducer(reduce, initial)
  const [overhead, setOverhead] = useState(false)
  const [modelKey, setModelKey] = useState<CampusModelKey>('nvh-v3')
  const now = useNow()
  useEffect(() => {
    dispatch({ type: 'reset' })
    if (!source) return
    return source.subscribe(
      (value) => dispatch({ type: 'observation', value, now: Date.now() }),
      (value) => dispatch({ type: 'connection', value }),
    )
  }, [source])
  const { sample, connection } = state
  const map = mapConfigFor(sample?.mapKey)
  const selectedMap = map && (map.scene.modelKey ?? 'legacy') === modelKey ? map : null
  const view = observationView(sample, connection, now, selectedMap)
  const robots = sample && view.scenePose && map ? [{
    id: sample.robotId, name: sample.robotId, pose: sample.pose, transform: map.scene.transform,
    color: view.stale ? '#8a98ac' : '#2f62b8', active: false, focused: true, stale: view.stale, headYaw: 0,
  }] : []
  return <section className={`${panelClass} mb-5 overflow-hidden`} aria-label="Digital Twin robot thật">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf2fa] px-5 py-4">
      <div><h2 className="font-bold text-[#1f314d]">Robot thật</h2><p className="mt-1 text-sm text-[#71819a]">{connectionLabels[connection]} · {sample ? view.stale ? 'Dữ liệu vị trí cũ' : 'Đang nhận vị trí' : 'Chưa có vị trí robot'}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-[#40546f]">Model 3D <select className="rounded-lg border border-[#dce9fb] bg-white px-3 py-2" value={modelKey} onChange={(event) => setModelKey(event.target.value as CampusModelKey)}><option value="nvh-v3">NVH tầng 6 · V3</option><option value="legacy">Model OBJ trước</option></select></label>
        <button type="button" className="rounded-lg border border-[#dce9fb] px-3 py-2 text-sm font-semibold text-[#40546f]" onClick={() => setOverhead((value) => !value)}>{overhead ? 'Góc nhìn 3D' : 'Nhìn từ trên'}</button>
      </div>
    </div>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="h-[clamp(340px,55vh,600px)]" role="img" aria-label={robots.length ? 'Bản đồ 3D với vị trí robot thật' : 'Bản đồ 3D chưa đặt robot thật'}>
        <Suspense fallback={<p className="p-8 text-sm text-[#71819a]">Đang tải bản đồ 3D…</p>}><TwinScene robots={robots} modelKey={modelKey} overhead={overhead} showLabels={false} /></Suspense>
      </div>
      <aside className="border-t border-[#dce9fb] bg-[#f8fbff] p-5 lg:border-t-0 lg:border-l">
        <p className="text-sm font-semibold text-[#1f314d]">{sample?.robotId ?? 'Chờ robot kết nối'}</p>
        {sample ? <dl className="mt-5 space-y-3 text-sm text-[#40546f]">
          <div><dt>Bản đồ</dt><dd className="font-mono">{sample.mapKey}</dd></div>
          <div><dt>Vị trí ROS</dt><dd className="font-mono">X {sample.pose.x.toFixed(2)} · Y {sample.pose.y.toFixed(2)} m</dd></div>
          <div><dt>Hướng</dt><dd>{(sample.pose.yaw * 180 / Math.PI).toFixed(1)}°</dd></div>
          <div><dt>Tuổi dữ liệu vị trí</dt><dd>{view.ageSeconds?.toFixed(1)} giây</dd></div>
        </dl> : <p className="mt-4 text-sm leading-relaxed text-[#71819a]">Bản đồ đã sẵn sàng để xem. Robot chỉ xuất hiện khi có dữ liệu vị trí và bản đồ 3D đã được hiệu chỉnh.</p>}
        {!view.calibrated && <p className="mt-5 text-sm text-[#8a5a06]">Chưa hiệu chỉnh tọa độ robot với model 3D.</p>}
        {state.rejected && <p role="status" className="mt-4 text-sm text-[#8a5a06]">Bỏ qua mẫu vị trí không hợp lệ hoặc đã cũ.</p>}
        {!source && <p className="mt-5 text-xs leading-relaxed text-[#71819a]">Kết nối robot thật sẽ được bật sau khi cấu hình và kiểm tra trên miniPC. Phần này không dùng dữ liệu demo.</p>}
      </aside>
    </div>
  </section>
}
