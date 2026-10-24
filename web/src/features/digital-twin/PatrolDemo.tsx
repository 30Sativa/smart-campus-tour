import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Camera, ChevronDown, Eye, Info, PanelRight, Pause, Play, RotateCcw, X } from 'lucide-react'
import { createPatrol, patrolPose, robotRoute, stepPatrol, PATROL_TICK, PATROL_TRANSFORM, PATROL_MODEL_SCALE, PATROL_FLOOR_Y } from './patrol-demo'
import { FleetPanels, type FleetTab } from './FleetPanels'
import { robotModeLabel } from './fleet-analysis'
import type { CameraMode } from './camera-view'
import { TwinTools, type TwinTool } from './TwinTools'
import { twinIconButton } from './twin-classes'

const TwinScene = lazy(() => import('./TwinScene'))
const buttonClass = 'rounded-lg border border-[#dce9fb] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#40546f] focus-visible:outline-2 focus-visible:outline-[#4f8df7]'
const NOTE = 'Vị trí tính trên web · Chạy trọn vòng · Mỗi vòng bỏ dừng 1–3 điểm ngẫu nhiên · Quan sát 60s · R1 ưu tiên cao nhất'
const segButton = (on: boolean) =>
  `rounded-md px-2.5 py-1.5 text-xs font-bold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] ${on ? 'bg-white text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,0.12)]' : 'text-[#64748b] hover:text-[#0f172a]'}`

/**
 * Default local patrol; never publishes poses or motion commands.
 *
 * One toolbar above the map (view, what to show, camera point, the operations
 * panel, plus whatever the host passes in `toolbarStart` / `toolbarEnd`), and
 * everything else on the map itself: the robot list (bottom left), the 3D
 * tools (bottom centre), playback (bottom right) and the note (top right). The
 * operations panel slides over the map's right edge.
 */
export function PatrolDemo({ overhead, showLabels, onToggleLabels, toolbarStart, toolbarEnd }: {
  overhead: boolean
  showLabels: boolean
  onToggleLabels: () => void
  toolbarStart?: ReactNode
  toolbarEnd?: ReactNode
}) {
  const [tool, setTool] = useState<TwinTool>('select')
  const [state, setState] = useState(() => createPatrol())
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [selected, setSelected] = useState(1)
  const [tab, setTab] = useState<FleetTab>('robots')
  const [view, setView] = useState('scene')
  const [routes, setRoutes] = useState(true)
  const [sensors, setSensors] = useState(false)
  const [panel, setPanel] = useState(false)
  const [cameraPoint, setCameraPoint] = useState(0)
  const [cameraMode, setCameraMode] = useState<CameraMode>('point')
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showMenu) return
    const onPointer = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setShowMenu(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowMenu(false) }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); window.removeEventListener('keydown', onKey) }
  }, [showMenu])
  useEffect(() => {
    if (!playing) return
    let previous = performance.now()
    let accumulator = 0
    const timer = window.setInterval(() => {
      const now = performance.now()
      const elapsed = Math.min((now - previous) / 1000, 0.25)
      previous = now
      if (document.hidden) { accumulator = 0; return }
      accumulator += elapsed * speed
      const ticks = Math.floor((accumulator + 1e-9) / PATROL_TICK)
      accumulator -= ticks * PATROL_TICK
      if (ticks) setState(current => {
        let next = current
        for (let i = 0; i < ticks; i++) next = stepPatrol(next)
        return next
      })
    }, 50)
    return () => window.clearInterval(timer)
  }, [playing, speed])
  const robots = state.robots.map((r, i) => ({
    id: r.id, name: `R${i + 1}`, color: r.color, pose: patrolPose(r),
    transform: PATROL_TRANSFORM, scale: PATROL_MODEL_SCALE, groundY: PATROL_FLOOR_Y, exactPose: true,
    active: (r.mode === 'moving' || r.mode === 'yielding') && !r.waiting && playing, focused: r.number === selected, stale: false,
    headYaw: 0,
    traffic: r.waiting ? 'hold' as const : r.yieldTo !== null ? 'yield' as const : 'clear' as const,
  }))
  const shown = [routes, sensors, showLabels].filter(Boolean).length
  const cameraOn = panel && tab === 'camera' && cameraMode === 'point'
  const toggle = (label: string, on: boolean, click: () => void) => (
    <button type="button" aria-pressed={on} onClick={click} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-[#0f172a] hover:bg-[#f1f5f9]">
      <span aria-hidden="true" className={`grid size-4 place-items-center rounded border-2 text-[10px] text-white ${on ? 'border-[#2563eb] bg-[#2563eb]' : 'border-[#cbd5e1]'}`}>{on ? '✓' : ''}</span>
      {label}
    </button>
  )
  return <div className="flex h-full min-h-0 flex-col" aria-label="Tuần tra 6 robot">
    <div className="flex flex-wrap items-center gap-2 border-b border-[#e3eaf3] bg-[#fbfdff] px-3 py-2">
      {toolbarStart}
      <span className="flex-1" />
      <div role="group" aria-label="Kiểu xem" className="inline-flex gap-0.5 rounded-lg bg-[#eef2f7] p-0.5">
        {['scene','traffic','heatmap'].map(v=><button key={v} type="button" className={segButton(view===v)} aria-pressed={view===v} onClick={()=>setView(v)}>{v==='scene'?'Bản đồ':v==='traffic'?'Giao thông':'Heatmap'}</button>)}
      </div>
      <div ref={menuRef} className="relative">
        <button type="button" aria-haspopup="true" aria-expanded={showMenu} onClick={() => setShowMenu(v => !v)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-2.5 text-xs font-bold text-[#334155] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] ${showMenu ? 'border-[#93c5fd] shadow-[0_0_0_3px_rgba(147,197,253,0.3)]' : 'border-[#e2e8f0] hover:bg-[#f8fafc]'}`}>
          <Eye size={15} aria-hidden="true" />Hiển thị<span className="text-[#2563eb]">{shown}/3</span>
          <ChevronDown size={13} aria-hidden="true" className={`transition-transform ${showMenu ? 'rotate-180' : ''}`} />
        </button>
        {showMenu && <div className="absolute top-[calc(100%+6px)] right-0 z-30 w-52 rounded-xl border border-[#e2e8f0] bg-white p-1.5 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.4)] transition-[opacity,translate] duration-150 starting:-translate-y-1 starting:opacity-0">
          {toggle('Tuyến robot', routes, () => setRoutes(v => !v))}
          {toggle('Cảm biến ảo', sensors, () => setSensors(v => !v))}
          {toggle('Điểm point', showLabels, onToggleLabels)}
        </div>}
      </div>
      <button type="button" className={twinIconButton(cameraOn)} aria-label="Camera point" title="Camera point" aria-pressed={cameraOn} onClick={() => { setPanel(true); setTab('camera'); setCameraMode('point') }}><Camera size={16} aria-hidden="true" /></button>
      <button type="button" className={twinIconButton(panel)} aria-label="Bảng vận hành" title="Bảng vận hành" aria-expanded={panel} onClick={()=>setPanel(v=>!v)}><PanelRight size={16} aria-hidden="true" /></button>
      {toolbarEnd}
    </div>
    <div className="@container/stage relative min-h-[200px] flex-1 overflow-hidden">
      <div className="absolute inset-0" role="img" aria-label="6 robot đi trọn vòng, bỏ ngẫu nhiên một số điểm dừng">
        <Suspense fallback={<p className="p-3 text-xs">Đang tải bản đồ 3D…</p>}>
          <TwinScene modelKey="nvh-v3" robots={robots} overhead={overhead} showLabels={showLabels} syntheticPatrol seconds={state.seconds} viewMode={view} heat={state.heat} sensors={sensors}
            tool={tool}
            showCameras={cameraOn} cameraPoint={cameraPoint}
            onSelectCamera={point => { setCameraPoint(point); setCameraMode('point'); setPanel(true); setTab('camera') }}
            patrolPaths={routes ? state.robots.map(r=>({id:r.id,color:r.color,points:robotRoute(r),active:r.mode==='moving'||r.mode==='yielding'})) : []}
            onSelectRobot={tool === 'select' ? id=>{setSelected(Number(id.split('_')[1]));setPanel(true);setTab('robots')} : undefined} />
        </Suspense>
      </div>
      <TwinTools tool={tool} onTool={setTool} routes={routes} onRoutes={() => setRoutes(v => !v)} labels={showLabels} onLabels={onToggleLabels} />

      <div className="group absolute top-3 right-3 z-10">
        <button type="button" aria-label="Cách mô phỏng hoạt động" aria-describedby="patrol-note" className="grid size-8 place-items-center rounded-full bg-slate-900/70 text-slate-100 backdrop-blur focus-visible:outline-2 focus-visible:outline-sky-300"><Info size={15} aria-hidden="true" /></button>
        <p id="patrol-note" role="tooltip" className="pointer-events-none absolute top-[calc(100%+6px)] right-0 w-64 rounded-lg bg-slate-900 px-3 py-2 text-[11px] leading-relaxed text-slate-100 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">{NOTE}</p>
      </div>

      <div className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-1.5 @max-lg/stage:bottom-[68px] @lg/stage:max-w-[min(520px,calc(50%-130px))]">
        {(view==='traffic'||sensors)&&<span className="pointer-events-none rounded bg-white/90 px-2 py-1 text-[10px] text-slate-600">{view==='traffic'?'Đỏ: chờ · Cam: nhường · Xanh: thông tuyến':'Cảm biến ảo 270° / 4m'}</span>}
        <details className="group/list w-full rounded-xl bg-white/95 text-xs text-[#40546f] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] backdrop-blur">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-bold text-[#334155] [&::-webkit-details-marker]:hidden">
            <span className="flex gap-0.5" aria-hidden="true">{state.robots.map(r => <span key={r.id} className="size-2 rounded-full" style={{ background: r.color }} />)}</span>
            <span className="truncate">{state.robots.length} robot · trạng thái</span>
            <ChevronDown size={13} aria-hidden="true" className="ml-auto shrink-0 transition-transform group-open/list:rotate-180" />
          </summary>
          <ul className="grid gap-x-4 gap-y-1 px-3 pb-2.5 sm:grid-cols-2" aria-label="Trạng thái robot">
            {state.robots.map((r, i) => <li key={r.id} className="flex min-w-0 items-center gap-1.5"><span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} /><button className="font-bold underline-offset-2 hover:underline" aria-label={`Chọn R${i+1}`} onClick={()=>{setSelected(r.number);setPanel(true);setTab('robots')}}>R{i + 1}</button><span className="truncate">{r.mode==='observing' ? `Điểm ${r.observing! + 1} · quan sát ${Math.ceil(r.remaining)}s` : `${robotModeLabel(r)} → điểm ${r.target + 1}`}</span></li>)}
          </ul>
        </details>
      </div>

      <div aria-label="Điều khiển mô phỏng" className="absolute right-3 bottom-3 z-10 flex items-center gap-0.5 rounded-xl bg-slate-900/85 p-1 text-xs text-slate-100 backdrop-blur @max-lg/stage:top-14 @max-lg/stage:bottom-auto">
        <button type="button" aria-label={playing ? 'Tạm dừng' : 'Tiếp tục'} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 font-bold hover:bg-white/10" onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}<span className="hidden @3xl/stage:inline">{playing ? 'Tạm dừng' : 'Tiếp tục'}</span></button>
        <button type="button" aria-label="Đặt lại" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 font-bold hover:bg-white/10" onClick={() => setState(createPatrol())}><RotateCcw size={14} aria-hidden="true" /><span className="hidden @3xl/stage:inline">Đặt lại</span></button>
        <select aria-label="Tốc độ phát" className="h-8 cursor-pointer appearance-none rounded-lg bg-white/10 px-2.5 font-bold text-slate-100 [&>option]:text-slate-900" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1}>1×</option><option value={5}>5×</option><option value={10}>10×</option></select>
        <span className="hidden px-2 tabular-nums text-slate-300 @3xl/stage:inline">{Math.floor(state.seconds)}s tuần tra{!playing ? ' · tạm dừng' : ''}</span>
      </div>

      {panel && <aside aria-label="Bảng vận hành" className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[400px] flex-col border-l border-[#dce9fb] bg-white text-xs text-[#40546f] shadow-[-20px_0_40px_-24px_rgba(15,23,42,0.45)] transition-[opacity,translate] duration-300 starting:translate-x-6 starting:opacity-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
          <b className="text-[13px] text-[#0f172a]">Bảng vận hành</b>
          <button type="button" aria-label="Đóng bảng vận hành" className="grid size-7 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" onClick={() => setPanel(false)}><X size={14} aria-hidden="true" /></button>
        </div>
        <nav className="flex flex-wrap gap-1 border-b border-slate-200 px-3 py-2" aria-label="Chức năng Fleet Twin">
          {([['robots','Robot'],['tasks','Nhiệm vụ'],['events','Nhật ký'],['metrics','Thống kê'],['scenarios','Kịch bản'],['copilot','AI Copilot'],['camera','Camera'],['whatif','What-if']] as [FleetTab,string][]).map(([id,label])=><button key={id} className={buttonClass} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}
        </nav>
        <div className="min-h-0 flex-1 overflow-auto">
          <FleetPanels tab={tab} state={state} setState={setState} selected={selected} setSelected={setSelected} cameraPoint={cameraPoint} onCameraPointChange={setCameraPoint} cameraMode={cameraMode} onCameraModeChange={setCameraMode} />
        </div>
      </aside>}
    </div>
  </div>
}
