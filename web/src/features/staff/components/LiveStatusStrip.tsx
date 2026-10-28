import type { ReactNode } from 'react'
import type { AmrStatus, TourOperation } from '../../../api/contracts/staff'
import { stepLabel } from '../status'
import { formatStopwatch, formatTime } from '../formatters'
import { POSE_DISCONNECTED_SECONDS, POSE_STALE_SECONDS, routeProgress } from '../attention'

type Tone = 'normal' | 'warn' | 'danger'
const VALUE: Record<Tone, string> = { normal: 'text-[#0f172a]', warn: 'text-[#8a5a06]', danger: 'text-[#b23e31]' }

function Cell({ label, value, sub, tone = 'normal' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0 border-[#eef1f4] px-3.5 py-2.5 [&:not(:first-child)]:border-l">
      <dt className="text-[11px] font-medium text-[#64748b]">{label}</dt>
      <dd className={`m-0 truncate text-[14px] font-semibold tabular-nums ${VALUE[tone]}`}>{value}</dd>
      {sub && <dd className="m-0 truncate text-[11px] text-[#64748b]">{sub}</dd>}
    </div>
  )
}

/**
 * The same facts as `RunStatus` (scope §11.5) laid out as one row, so the live
 * page keeps the map and the controls in view: step, target POI, dwell left,
 * run time, how old the robot's position is, and the command awaiting a result.
 */
export function LiveStatusStrip({ tour, robot, now }: { tour: TourOperation; robot?: AmrStatus; now: number }) {
  const progress = tour.progress
  const { current, done, total } = routeProgress(tour)
  const returning = progress?.step === 'ReturningToEnd'
  const moving = progress?.step === 'Navigating' || returning
  const target = returning ? tour.endPoint.name : current?.name ?? '-'
  const dwellLeft = progress?.dwellEndsAt ? Math.max(0, Math.round((new Date(progress.dwellEndsAt).getTime() - now) / 1000)) : null
  const age = robot?.poseAgeSeconds
  const lost = robot && (robot.connectionState !== 'Live' || (age ?? 0) > POSE_DISCONNECTED_SECONDS)
  const stale = robot && !lost && (age ?? 0) > POSE_STALE_SECONDS
  const narration = progress?.narration === 'Playing' ? 'Thuyết minh đang phát' : progress?.narration === 'Stopped' ? 'Thuyết minh đã dừng' : 'Thuyết minh chưa phát'

  return (
    <dl aria-label="Trạng thái phiên" className="m-0 grid grid-cols-2 overflow-hidden rounded-xl border border-[#e2e8f0] bg-white sm:grid-cols-3 xl:grid-cols-6">
      <Cell label="Bước hiện tại" value={stepLabel(progress?.step)} sub={`${narration} · ${tour.language}`} />
      <Cell label={moving ? 'Đang tới' : 'Điểm hiện tại'} value={target} sub={`${done}/${total} POI đã qua`} />
      <Cell label="Thời gian dừng còn" value={dwellLeft != null ? `${dwellLeft} giây` : '-'} sub={progress?.hold ? 'Đang giữ tại POI' : undefined} tone={progress?.hold ? 'warn' : 'normal'} />
      <Cell label="Đã chạy" value={formatStopwatch(tour.startedAt, now)} sub={`Bắt đầu ${formatTime(tour.startedAt)}`} />
      <Cell
        label="Vị trí robot"
        value={!robot ? 'Chưa có dữ liệu' : lost ? 'Mất kết nối' : `${age ?? '-'} giây trước`}
        sub={!robot ? undefined : lost ? 'Vị trí là mẫu cuối cùng' : stale ? 'Vị trí cũ' : robot.name}
        tone={lost ? 'danger' : stale ? 'warn' : 'normal'}
      />
      <Cell
        label="Lệnh đang chờ"
        value={progress?.pendingCommand ? progress.pendingCommand.label : 'Không có'}
        sub={<>Chặng <span className="font-mono">{progress?.legId ?? '-'}</span> · lượt <span className="font-mono">{progress?.visitId ?? '-'}</span></>}
      />
    </dl>
  )
}
