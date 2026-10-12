import { lazy, Suspense, useEffect, useState } from 'react'
import { createPatrol, patrolPose, robotRoute, stepPatrol, PATROL_TICK, PATROL_TRANSFORM, PATROL_MODEL_SCALE, PATROL_FLOOR_Y } from './patrol-demo'
import { FleetPanels, type FleetTab } from './FleetPanels'
import { robotModeLabel } from './fleet-analysis'

const TwinScene = lazy(() => import('./TwinScene'))
const buttonClass = 'rounded-lg border border-[#dce9fb] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#40546f] focus-visible:outline-2 focus-visible:outline-[#4f8df7]'

/** Default local patrol; never publishes poses or motion commands. */
export function PatrolDemo({ overhead, showLabels }: { overhead: boolean; showLabels: boolean }) {
  const [state, setState] = useState(() => createPatrol())
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [selected, setSelected] = useState(1)
  const [tab, setTab] = useState<FleetTab>('robots')
  const [view, setView] = useState('scene')
  const [routes, setRoutes] = useState(true)
  const [sensors, setSensors] = useState(false)
  const [panel, setPanel] = useState(false)
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
  return <div className="flex h-full min-h-0 flex-col" aria-label="Tuần tra 6 robot">
    <div className="flex flex-wrap gap-1.5 border-b border-slate-200 bg-white px-3 py-2">
      {['scene','traffic','heatmap'].map(v=><button key={v} className={buttonClass} aria-pressed={view===v} onClick={()=>setView(v)}>{v==='scene'?'Bản đồ':v==='traffic'?'Giao thông':'Heatmap'}</button>)}
      <button className={buttonClass} aria-pressed={routes} onClick={()=>setRoutes(v=>!v)}>Tuyến robot</button>
      <button className={buttonClass} aria-pressed={sensors} onClick={()=>setSensors(v=>!v)}>Cảm biến ảo</button>
      <button className={buttonClass} aria-expanded={panel} onClick={()=>setPanel(v=>!v)}>Bảng vận hành</button>
    </div>
    <div className="relative min-h-[200px] flex-1" role="img" aria-label="6 robot đi đến 10 điểm ngẫu nhiên">
      <Suspense fallback={<p className="p-3 text-xs">Đang tải bản đồ 3D…</p>}>
        <TwinScene modelKey="nvh-v3" robots={robots} overhead={overhead} showLabels={showLabels} syntheticPatrol seconds={state.seconds} viewMode={view} heat={state.heat} sensors={sensors}
          patrolPaths={routes ? state.robots.map(r=>({id:r.id,color:r.color,points:robotRoute(r),active:r.mode==='moving'||r.mode==='yielding'})) : []}
          onSelectRobot={id=>{setSelected(Number(id.split('_')[1]));setPanel(true);setTab('robots')}} />
      </Suspense>
      {(view==='traffic'||sensors)&&<span className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[10px] text-slate-600">{view==='traffic'?'Đỏ: chờ · Cam: nhường · Xanh: thông tuyến':'Cảm biến ảo 270° / 4m'}</span>}
    </div>
    <div className="max-h-[55%] shrink-0 overflow-auto border-t border-[#dce9fb] bg-[#fbfdff] text-xs text-[#40546f]">
      <div className="p-3">
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1" aria-label="Trạng thái robot">
        {state.robots.map((r, i) => <li key={r.id} className="flex items-center gap-1.5"><span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} /><button className="font-bold underline-offset-2 hover:underline" aria-label={`Chọn R${i+1}`} onClick={()=>{setSelected(r.number);setPanel(true);setTab('robots')}}>R{i + 1}</button><span>{r.mode==='observing' ? `Điểm ${r.observing! + 1} · quan sát ${Math.ceil(r.remaining)}s` : `${robotModeLabel(r)} → điểm ${r.target + 1}`}</span></li>)}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button className={buttonClass} onClick={() => setPlaying(value => !value)}>{playing ? 'Tạm dừng' : 'Tiếp tục'}</button>
        <button className={buttonClass} onClick={() => setState(createPatrol())}>Đặt lại</button>
        <label className="flex items-center gap-1">Tốc độ phát<select className={buttonClass} value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1}>1×</option><option value={5}>5×</option><option value={10}>10×</option></select></label>
        <span className="tabular-nums">{Math.floor(state.seconds)}s tuần tra{!playing ? ' · tạm dừng' : ''}</span>
      </div>
      <p className="mt-2 text-[10px] text-[#71819a]">Vị trí tính trên web · Đích ngẫu nhiên · Quan sát 60s · R1 ưu tiên cao nhất · Robot số lớn chủ động vào chỗ tránh</p>
      </div>
      {panel && <><nav className="flex flex-wrap gap-1 border-t border-slate-200 px-3 py-2" aria-label="Chức năng Fleet Twin">
        {([['robots','Robot'],['tasks','Nhiệm vụ'],['events','Nhật ký'],['metrics','Thống kê'],['scenarios','Kịch bản'],['copilot','AI Copilot'],['camera','Camera'],['whatif','What-if']] as [FleetTab,string][]).map(([id,label])=><button key={id} className={buttonClass} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}
      </nav><FleetPanels tab={tab} state={state} setState={setState} selected={selected} setSelected={setSelected} /></>}
    </div>
  </div>
}
