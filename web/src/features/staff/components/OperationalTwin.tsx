import { lazy, Suspense, useState } from 'react'
import { Eye, EyeOff, Layers, LoaderCircle, Map as MapIcon } from 'lucide-react'
import type { AmrStatus, TourOperation } from '../../../api/contracts/staff'
import type { TwinRobot, TwinRoute } from '../../digital-twin/TwinScene'
import { statusInfo, type StatusTone } from '../status'
import { LiveDot } from '../StaffUi'
import { POSE_STALE_SECONDS } from '../attention'

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
    <section className={`relative overflow-hidden rounded-2xl border border-[#dce9fb] bg-[#edf2fa] ${className}`} aria-label="Digital Twin vận hành 3D">
      <div className="absolute inset-x-0 top-14 bottom-0" role="img" aria-label={tour ? `Bản đồ 3D: ${focusRobot?.name ?? 'robot'} và các POI của ${tour.code}` : `Bản đồ 3D với ${placed.length} robot`}>
        <Suspense fallback={<div className="grid size-full place-items-center text-sm text-[#647793]"><span className="flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" />Đang tải bản đồ 3D…</span></div>}>
          <TwinScene robots={twinRobots} route={route} selectedStopId={selectedStopId} overhead={overhead} showLabels={labels} />
        </Suspense>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-[#e3eaf3] bg-[#fbfdff] p-3">
        <span className="pointer-events-auto inline-flex items-center gap-2 text-xs font-bold text-[#1f314d]">
          <LiveDot tone="ok" />Operational Twin
          {sources.length > 0 && <span className="font-mono text-[10px] font-normal text-[#8a98ac]">· có dữ liệu {sources.join(', ')}</span>}
        </span>
        <span className="pointer-events-auto flex gap-1.5">
          <button type="button" onClick={() => setOverhead((value) => !value)} aria-pressed={overhead} className={toolClass(overhead)}>
            {overhead ? <Layers size={14} aria-hidden="true" /> : <MapIcon size={14} aria-hidden="true" />}{overhead ? 'Góc 3D' : 'Nhìn từ trên'}
          </button>
          <button type="button" onClick={() => setLabels((value) => !value)} aria-pressed={labels} className={toolClass(labels)}>
            {labels ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}Tên POI
          </button>
        </span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-3">
        <span className="rounded-lg bg-white/90 px-3 py-2 text-[11px] font-semibold text-[#516783] shadow-sm ring-1 ring-[#dce9fb] backdrop-blur">
          {tour ? 'Số = thứ tự POI · ⚑ điểm kết thúc · không vẽ đường Nav2' : 'Vị trí từ telemetry, hệ tọa độ bản đồ robot'}
        </span>
        {missing > 0 && <span className="rounded-lg bg-white/90 px-3 py-2 text-[11px] font-semibold text-[#8a5a06] shadow-sm ring-1 ring-[#dce9fb]">{missing} robot không gửi vị trí</span>}
      </div>
    </section>
  )
}
