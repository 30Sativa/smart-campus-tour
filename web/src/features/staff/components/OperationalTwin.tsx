import { lazy, Suspense, useEffect, useState } from 'react'
import { Eye, EyeOff, Layers, LoaderCircle, Map as MapIcon, Maximize2, Minimize2 } from 'lucide-react'
import type { AmrStatus, TourOperation } from '../../../api/contracts/staff'
import type { TwinRobot, TwinRoute } from '../../digital-twin/TwinScene'
import { statusInfo, type StatusTone } from '../status'
import { LiveDot } from '../StaffUi'
import { POSE_STALE_SECONDS } from '../attention'
import { PatrolDemo } from '../../digital-twin/PatrolDemo'

const TwinScene = lazy(() => import('../../digital-twin/TwinScene'))

const TONE_COLOR: Record<StatusTone, string> = {
  ok: '#2f8f6b',
  info: '#2f62b8',
  warn: '#d69412',
  danger: '#c9534a',
  muted: '#8a98ac',
}

/** Head presets as yaw relative to the body. Display calibration, not measured angles. */
const HEAD_YAW: Record<string, number> = { FRONT: 0, LEFT: Math.PI / 3, RIGHT: -Math.PI / 3 }

const toolClass = (on: boolean) =>
  `inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] ${on ? 'bg-[#1f314d] text-white' : 'bg-white/90 text-[#40546f] ring-1 ring-[#dce9fb] hover:bg-white'}`

/**
 * Operational Digital Twin for Staff (scope §11): the campus model, each robot
 * that reports a pose (body heading and camera head separately), and - for a
 * Tour in focus - its POIs in order, the end point and the current target.
 *
 * A robot without a pose is absent, never parked at a guess. A stale pose is
 * greyed and labelled, and the marker stops where the last sample put it.
 * Non-physical sources carry their label on the overlay.
 */
export function OperationalTwin({ robots, tour, selectedStopId, className = '' }: {
  robots: AmrStatus[]
  tour?: TourOperation | null
  selectedStopId?: string | null
  className?: string
}) {
  const [overhead, setOverhead] = useState(false)
  const [labels, setLabels] = useState(false)
  const [expanded, setExpanded] = useState(false)
  useEffect(()=>{ if(!expanded)return; const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false)}; window.addEventListener('keydown',close); return()=>window.removeEventListener('keydown',close) },[expanded])
  // Idle view has a default local fleet; active Tours retain reported observations.
  const demo = !tour
  const placed = robots.filter((robot) => robot.pose)
  const missing = robots.length - placed.length
  const focusId = tour?.robotId ?? null
  const twinRobots: TwinRobot[] = placed.map((robot) => {
    const stale = robot.connectionState !== 'Live' || (robot.poseAgeSeconds ?? 0) > POSE_STALE_SECONDS
    const statusKey = robot.id === focusId && tour ? (tour.operationalStatus === 'NeedsAssistance' ? 'NeedsAssistance' : tour.state) : robot.needsCheck ? 'Maintenance' : robot.executionState ?? robot.operationalState
    return {
      id: robot.id,
      name: robot.source && robot.source !== 'Physical' ? `${robot.name} (${robot.source})` : robot.name,
      pose: robot.pose as NonNullable<AmrStatus['pose']>,
      color: TONE_COLOR[statusInfo(statusKey).tone],
      active: robot.executionState === 'Navigating',
      focused: robot.id === focusId,
      stale,
      headYaw: HEAD_YAW[robot.headPreset ?? 'FRONT'] ?? 0,
    }
  })
  const progress = tour?.progress
  const route: TwinRoute | null = tour
    ? { stops: tour.stops, endPoint: tour.endPoint, targetIndex: progress?.stopIndex ?? null, heading: !progress ? 'none' : progress.step === 'ReturningToEnd' ? 'end' : progress.stopIndex != null ? 'poi' : 'none' }
    : null
  const focusRobot = robots.find((robot) => robot.id === focusId)
  const sources = [...new Set(placed.map((robot) => robot.source).filter((source) => source && source !== 'Physical'))]

  return (
    <section className={`flex flex-col overflow-hidden rounded-2xl border border-[#dce9fb] bg-[#edf2fa] ${expanded ? 'fixed inset-3 z-50 h-[calc(100dvh-1.5rem)] shadow-2xl' : `relative ${demo ? 'min-h-[680px] sm:min-h-[600px]' : ''} ${className}`}`} aria-label="Digital Twin vận hành 3D">
      <div className="order-2 min-h-0 flex-1">
        {demo ? <PatrolDemo overhead={overhead} showLabels={labels} /> : (
          <div className="h-full" role="img" aria-label={tour ? `Bản đồ 3D: ${focusRobot?.name ?? 'robot'} và các POI của ${tour.code}` : `Bản đồ 3D với ${placed.length} robot`}>
            <Suspense fallback={<div className="grid size-full place-items-center text-sm text-[#647793]"><span className="flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" />Đang tải bản đồ 3D…</span></div>}>
              <TwinScene modelKey="nvh-v3" robots={twinRobots} route={route} selectedStopId={selectedStopId} overhead={overhead} showLabels={labels} />
            </Suspense>
          </div>
        )}
      </div>

      <div className="order-1 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-[#e3eaf3] bg-[#fbfdff] p-3">
        <span className="pointer-events-auto inline-flex items-center gap-2 text-xs font-bold text-[#1f314d]">
          <LiveDot tone={demo ? 'muted' : 'ok'} pulse={!demo} />Operational Twin
          {demo ? <span className="rounded-full bg-[#eaf4ff] px-2 py-1 text-[10px] text-[#2f62b8]">6 robot · Chưa kết nối miniPC</span> : sources.length > 0 && <span className="font-mono text-[10px] font-normal text-[#8a98ac]">· có dữ liệu {sources.join(', ')}</span>}
        </span>
        <span className="pointer-events-auto flex flex-wrap gap-1.5">
          {demo && <button type="button" className={toolClass(expanded)} onClick={()=>setExpanded(v=>!v)} aria-pressed={expanded}>{expanded?<Minimize2 size={14}/>:<Maximize2 size={14}/>} {expanded?'Thu nhỏ':'Toàn màn hình'}</button>}
          <button type="button" onClick={() => setOverhead((value) => !value)} aria-pressed={overhead} className={toolClass(overhead)}>
            {overhead ? <Layers size={14} aria-hidden="true" /> : <MapIcon size={14} aria-hidden="true" />}{overhead ? 'Góc 3D' : 'Nhìn từ trên'}
          </button>
          <button type="button" onClick={() => setLabels((value) => !value)} aria-pressed={labels} className={toolClass(labels)}>
            {labels ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}Điểm point
          </button>
        </span>
      </div>

      {!demo && <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-3">
        <span className="rounded-lg bg-white/90 px-3 py-2 text-[11px] font-semibold text-[#516783] shadow-sm ring-1 ring-[#dce9fb] backdrop-blur">
          NVH tầng 6 · V3{tour ? ' · Số = thứ tự POI · ⚑ điểm kết thúc · không vẽ đường Nav2' : ' · Chưa hiệu chỉnh tọa độ robot với model 3D'}
        </span>
        {missing > 0 && <span className="rounded-lg bg-white/90 px-3 py-2 text-[11px] font-semibold text-[#8a5a06] shadow-sm ring-1 ring-[#dce9fb]">{missing} robot không gửi vị trí</span>}
      </div>}
    </section>
  )
}
