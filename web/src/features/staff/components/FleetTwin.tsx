import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, Layers, LoaderCircle, Map as MapIcon, Maximize2, Minimize2, Navigation, Pause, Play, RotateCcw } from 'lucide-react'
import { EmptyState } from '../../../components/ui/EmptyState'
import { buttonClass } from '../../../components/ui/ui-classes'
import type { TwinFocus, TwinPerfSample } from '../../digital-twin/TwinScene'
import { twinFrameloop, useTwinVisibility } from '../../digital-twin/frameloop'
import { robotModeLabel } from '../../digital-twin/fleet-analysis'
import { twinIconButton } from '../../digital-twin/twin-classes'
import { patrolPaths, patrolTwinRobots, useSimulatedPatrol } from '../../digital-twin/use-simulated-patrol'
import { useFleetTelemetry } from '../operations/fleet-telemetry'
import { useOperationTour, useRunningTours } from '../operations/hooks'
import { useNow } from '../use-now'
import { ageText, defaultRobot, fleetSummary, realRobotViews, realTwinRobots, tourTwinRoute, type RealRobotView } from './fleet-twin'

const TwinScene = lazy(() => import('../../digital-twin/TwinScene'))
const VIEWS = [{ key: 'scene', label: 'Bản đồ' }, { key: 'traffic', label: 'Giao thông' }, { key: 'heatmap', label: 'Mật độ di chuyển' }] as const
type ViewKey = (typeof VIEWS)[number]['key']
const segButton = (on: boolean) =>
  `rounded-md px-2.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] disabled:cursor-not-allowed disabled:opacity-45 ${on ? 'bg-white text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,0.12)]' : 'text-[#64748b] enabled:hover:text-[#0f172a]'}`
const iconButton = (label: string, on = false) => ({ 'aria-label': label, title: label, className: twinIconButton(on) })

/** The previous value while `key` is unchanged, so the scene's props keep their identity between equal updates. */
function useStable<T>(value: T, key: string): T {
  const [held, setHeld] = useState({ key, value })
  if (held.key !== key) {
    setHeld({ key, value })
    return value
  }
  return held.value
}

/**
 * One 3D view of the floor for Staff: the physical robots first (status colour,
 * label always on, camera on the freshest report or `?robot=`), the running
 * Tour's stops and target for the robot in view, and the local patrol as an
 * optional, dimmed layer (S1–S6) that is off by default and forced off while a
 * Tour runs. Simulated robots are never counted or coloured by a real state.
 */
export function FleetTwin({ requestedRobot, perf = false }: { requestedRobot: string | null; perf?: boolean }) {
  const snapshot = useFleetTelemetry()
  const now = useNow()
  const { tours } = useRunningTours()
  const views = realRobotViews(snapshot?.robots ?? [], snapshot?.receivedAt ?? null, now, tours)
  const everReported = views.some(view => view.robot.pose)

  const [chosen, setChosen] = useState<string | null>(null)
  const selected = (chosen ? views.find(view => view.robot.id === chosen) : null) ?? defaultRobot(views, requestedRobot)
  const detail = useOperationTour(selected?.tour?.id ?? '').data
  const routeDetail = detail && selected?.tour && detail.tour.id === selected.tour.id ? detail : null
  const route = useMemo(() => (routeDetail ? tourTwinRoute(routeDetail) : null), [routeDetail])
  const currentStop = route?.targetIndex != null ? route.stops[route.targetIndex] : null

  const locked = tours.length > 0
  const [simWanted, setSimWanted] = useState(false)
  const simOn = simWanted && !locked
  const patrol = useSimulatedPatrol(simOn)
  const [viewWanted, setView] = useState<ViewKey>('scene')
  const view: ViewKey = simOn ? viewWanted : 'scene'
  const [overhead, setOverhead] = useState(false)
  const [labels, setLabels] = useState(false)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (!expanded) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [expanded])

  // The camera opens on the robot in view once it is placed, and again when another is chosen.
  const [focus, setFocus] = useState<TwinFocus | null>(null)
  const [flownTo, setFlownTo] = useState<string | null>(null)
  if (selected?.scenePoint && flownTo !== selected.robot.id) {
    setFlownTo(selected.robot.id)
    setFocus({ id: (focus?.id ?? 0) + 1, position: selected.scenePoint })
  }
  const flyTo = (target: RealRobotView) => {
    setChosen(target.robot.id)
    if (target.scenePoint) { setFlownTo(target.robot.id); setFocus({ id: (focus?.id ?? 0) + 1, position: target.scenePoint }) }
  }

  // A new array only when something drawn changes: the hub re-broadcasts the same pose every second.
  const realList = realTwinRobots(views, selected?.robot.id ?? null, now)
  const real = useStable(realList, JSON.stringify(realList))
  const simulated = useMemo(() => (simOn ? patrolTwinRobots(patrol.state, { playing: patrol.playing, prefix: 'S', synthetic: true, livePose: patrol.livePose }) : []),
    [simOn, patrol.state, patrol.playing, patrol.livePose])
  const robots = useMemo(() => [...real, ...simulated], [real, simulated])
  const paths = useMemo(() => (simOn ? patrolPaths(patrol.state) : []), [simOn, patrol.state])

  const stage = useRef<HTMLDivElement>(null)
  const { onScreen, pageVisible } = useTwinVisibility(stage)
  const frameloop = twinFrameloop({ simulation: simOn, tourRunning: locked, onScreen, pageVisible })
  const [perfSample, setPerfSample] = useState<TwinPerfSample | null>(null)
  const placedCount = views.filter(item => item.scenePoint).length

  return (
    <section aria-label="Digital Twin" className={`flex flex-col overflow-hidden rounded-xl border border-[#dce9fb] bg-white ${expanded ? 'fixed inset-3 z-50 shadow-2xl' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e3eaf3] bg-[#fbfdff] px-3 py-2">
        <p className="min-w-0 text-sm font-bold text-[#0f172a]" data-testid="fleet-summary">{fleetSummary(views)}</p>
        <span className="flex-1" />
        <div role="group" aria-label="Kiểu xem" className="inline-flex gap-0.5 rounded-lg bg-[#eef2f7] p-0.5">
          {VIEWS.map(item => {
            const needsSim = item.key !== 'scene'
            return <button key={item.key} type="button" className={segButton(view === item.key)} aria-pressed={view === item.key} disabled={needsSim && !simOn}
              title={needsSim ? simOn ? `${item.label}: dữ liệu mô phỏng` : 'Chỉ có khi bật robot mô phỏng' : undefined} onClick={() => setView(item.key)}>{item.label}</button>
          })}
        </div>
        <label className={`inline-flex h-9 items-center gap-2 rounded-lg border border-[#e2e8f0] bg-white px-2.5 text-xs font-bold text-[#334155] ${locked ? 'opacity-60' : 'cursor-pointer'}`}>
          <input type="checkbox" role="switch" className="size-4 accent-[#2563eb]" checked={simOn} disabled={locked} aria-describedby={locked ? 'twin-sim-locked' : undefined} onChange={event => setSimWanted(event.target.checked)} />
          Robot mô phỏng
        </label>
        <button type="button" {...iconButton(labels ? 'Ẩn tên điểm dừng' : 'Hiện tên điểm dừng', labels)} aria-pressed={labels} onClick={() => setLabels(value => !value)}><MapIcon size={16} aria-hidden="true" /></button>
        <button type="button" {...iconButton(overhead ? 'Góc nhìn 3D' : 'Nhìn từ trên', overhead)} aria-pressed={overhead} onClick={() => { setOverhead(value => !value); setFlownTo(null) }}><Layers size={16} aria-hidden="true" /></button>
        <button type="button" {...iconButton(expanded ? 'Thu nhỏ' : 'Toàn màn hình', expanded)} aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}</button>
      </div>
      {locked && <p id="twin-sim-locked" role="status" className="border-b border-[#e3eaf3] bg-[#f8fbff] px-4 py-2 text-xs font-semibold text-[#40546f]">Đang có Tour chạy, đã tắt mô phỏng</p>}
      {simOn && <p role="note" className="border-b border-[#f3d38b] bg-[#fff8e6] px-4 py-2 text-xs font-semibold text-[#8a5a06]">
        Đang hiện robot mô phỏng S1–S6: dữ liệu mô phỏng, không phải robot thật{view !== 'scene' ? ` · ${VIEWS.find(item => item.key === view)!.label} tính từ dữ liệu mô phỏng` : ''}
      </p>}

      <div className={`grid min-h-0 lg:grid-cols-[minmax(0,1fr)_300px] ${expanded ? 'flex-1 overflow-y-auto lg:overflow-hidden' : ''}`}>
        {/* As tall as the screen leaves under the header, never a fixed 820px; full screen fills the window. */}
        <div ref={stage} data-testid="twin-stage" data-frameloop={frameloop} className={`relative bg-[#20313f] ${expanded ? 'h-[calc(100dvh-9rem)] lg:h-full' : 'h-[calc(100dvh-15rem)] min-h-[360px]'}`}>
          <div className="absolute inset-0" role="img" aria-label={`Bản đồ 3D với ${placedCount} robot thật${simOn ? ' và 6 robot mô phỏng' : ''}`}>
            <Suspense fallback={<div className="grid size-full place-items-center text-sm text-[#c7d4e4]"><span className="flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />Đang tải bản đồ 3D…</span></div>}>
              <TwinScene modelKey="nvh-v3" robots={robots} route={route} showRoute selectedStopId={null} overhead={overhead} showLabels={labels} focus={focus}
                syntheticPatrol={simOn} seconds={patrol.state.seconds} viewMode={view} heat={patrol.state.heat} patrolPaths={paths}
                frameloop={frameloop} onPerf={perf ? setPerfSample : undefined} />
            </Suspense>
          </div>
          {perf && <dl aria-label="Hiệu năng 3D" className="pointer-events-none absolute top-2 left-2 z-10 grid grid-cols-[auto_auto] gap-x-3 rounded-lg bg-slate-900/85 px-3 py-2 font-mono text-[11px] text-slate-100">
            <dt>FPS</dt><dd>{perfSample?.fps ?? '–'}</dd>
            <dt>Lệnh vẽ</dt><dd>{perfSample?.calls ?? '–'}</dd>
            <dt>Tam giác</dt><dd>{perfSample ? perfSample.triangles.toLocaleString('vi-VN') : '–'}</dd>
            <dt>Texture</dt><dd>{perfSample?.textures ?? '–'}</dd>
            <dt>Vẽ</dt><dd>{frameloop}</dd>
          </dl>}
          {!everReported && !simOn && <div className="absolute inset-0 grid place-items-center bg-[#20313f]/80 p-4">
            <div className="max-w-md rounded-xl bg-white">
              <EmptyState variant="empty" title="Chưa có robot thật nào gửi vị trí" description="Robot hiện ở đây khi miniPC gửi vị trí lên hệ thống. Có thể bật mô phỏng để xem demo."
                action={<>
                  {!locked && <button type="button" className={buttonClass('primary', 'sm')} onClick={() => setSimWanted(true)}>Bật mô phỏng để xem demo</button>}
                  <Link to="/staff/robot" className={buttonClass('secondary', 'sm')}>Robot & thiết bị</Link>
                </>} />
            </div>
          </div>}
        </div>

        <aside aria-label="Danh sách robot" className="border-t border-[#dce9fb] bg-[#f8fbff] p-4 text-sm lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <h2 className="text-xs font-bold tracking-wide text-[#71819a] uppercase">Robot thật ({views.length})</h2>
          {views.length === 0 ? <p className="mt-2 text-[#71819a]">Chưa có robot thật nào báo về.</p>
            : <ul className="mt-2 space-y-3">{views.map(item => (
              <li key={item.robot.id} aria-label={`Robot ${item.robot.id}`} className={`rounded-lg border bg-white p-3 ${selected?.robot.id === item.robot.id ? 'border-[#93c5fd]' : 'border-[#e3eaf3]'}`}>
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
                  <b className="font-mono text-[#0f172a]">{item.robot.id}</b>
                  <span className={`ml-auto text-xs font-semibold ${item.stale ? 'text-[#8a5a06]' : 'text-[#40546f]'}`}>{!item.robot.pose ? 'Chưa gửi vị trí' : item.stale ? 'Dữ liệu cũ' : item.status.label}</span>
                </div>
                <dl className="mt-2 space-y-1 text-xs text-[#40546f]">
                  <div className="flex gap-2"><dt className="text-[#71819a]">Bản đồ</dt><dd className="font-mono">{item.robot.mapKey}</dd></div>
                  {item.ageSeconds !== null && <div className="flex gap-2"><dt className="text-[#71819a]">Vị trí</dt><dd>{ageText(item.ageSeconds, now)}</dd></div>}
                  {item.robot.pose && !item.scenePoint && <dd className="text-[#8a5a06]">Bản đồ này chưa hiệu chỉnh với mô hình 3D.</dd>}
                  {item.tour && <div className="flex flex-wrap gap-x-2"><dt className="text-[#71819a]">Tour</dt><dd><Link to={`/staff/live/${item.tour.id}`} className="font-semibold text-[#2563eb] hover:underline">{item.tour.name}</Link></dd></div>}
                  {item.tour && selected?.robot.id === item.robot.id && currentStop && <div className="flex gap-2"><dt className="text-[#71819a]">Đang tới</dt><dd>{route!.targetIndex! + 1}. {currentStop.name}</dd></div>}
                </dl>
                <button type="button" className={`${buttonClass('secondary', 'sm')} mt-2`} disabled={!item.scenePoint} title={item.scenePoint ? `Bay tới ${item.robot.id}` : 'Robot chưa có trên bản đồ 3D'} onClick={() => flyTo(item)}>
                  <Navigation size={14} aria-hidden="true" />Bay tới
                </button>
                <details className="mt-2 text-xs text-[#40546f]">
                  <summary className="cursor-pointer font-semibold text-[#71819a]">Chi tiết kỹ thuật</summary>
                  <dl className="mt-1.5 space-y-1">
                    {item.robot.pose ? <>
                      <div className="flex gap-2"><dt>Vị trí ROS</dt><dd className="font-mono">X {item.robot.pose.x.toFixed(2)} · Y {item.robot.pose.y.toFixed(2)} m</dd></div>
                      <div className="flex gap-2"><dt>Hướng</dt><dd>{(item.robot.pose.yaw * 180 / Math.PI).toFixed(1)}°</dd></div>
                    </> : <dd>Chưa có vị trí ROS.</dd>}
                    <div className="flex gap-2"><dt>Khung toạ độ</dt><dd className="font-mono">{item.robot.frameId}</dd></div>
                    <div className="flex gap-2"><dt>Mô hình 3D</dt><dd>NVH tầng 6 · V3</dd></div>
                  </dl>
                </details>
              </li>
            ))}</ul>}

          {simOn && <details className="mt-4 rounded-lg border border-dashed border-[#f3d38b] bg-white p-3 text-xs text-[#40546f]">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-[#8a5a06] [&::-webkit-details-marker]:hidden">Mô phỏng ({patrol.state.robots.length})<ChevronDown size={13} aria-hidden="true" className="ml-auto" /></summary>
            <ul className="mt-2 space-y-1" aria-label="Robot mô phỏng">
              {patrol.state.robots.map((item, index) => <li key={item.id} className="flex items-center gap-1.5 opacity-80">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ background: item.color }} /><b>S{index + 1}</b>
                <span className="truncate">{item.mode === 'observing' ? `Điểm ${item.observing! + 1} · quan sát ${Math.ceil(item.remaining)}s` : `${robotModeLabel(item).replace(/\bR(\d)\b/g, 'S$1')} → điểm ${item.target + 1}`}</span>
              </li>)}
            </ul>
            <div className="mt-2 flex items-center gap-1">
              <button type="button" {...iconButton(patrol.playing ? 'Tạm dừng mô phỏng' : 'Tiếp tục mô phỏng')} onClick={() => patrol.setPlaying(value => !value)}>{patrol.playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}</button>
              <button type="button" {...iconButton('Đặt lại mô phỏng')} onClick={patrol.reset}><RotateCcw size={14} aria-hidden="true" /></button>
              <span className="ml-1 tabular-nums text-[#71819a]">{Math.floor(patrol.state.seconds)}s mô phỏng</span>
            </div>
          </details>}
        </aside>
      </div>
    </section>
  )
}
