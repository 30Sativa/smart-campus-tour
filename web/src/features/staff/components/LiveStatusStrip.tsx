import type { ReactNode } from 'react'
import type { AmrStatus, TourOperation } from '../../../api/contracts/staff'
import { stepLabel } from '../status'
import { formatStopwatch, formatTime } from '../formatters'
import { POSE_DISCONNECTED_SECONDS, POSE_STALE_SECONDS, routeProgress } from '../attention'
import { cardClass, tileClass } from '../../../components/ui/ui-classes'

type Tone = 'normal' | 'warn' | 'danger'
type Variant = 'strip' | 'panel'
const VALUE: Record<Tone, string> = { normal: 'text-[#0f172a]', warn: 'text-[#8a5a06]', danger: 'text-[#b23e31]' }

function Cell({ label, value, sub, tone = 'normal', variant }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; variant: Variant }) {
  const frame =
    variant === 'panel'
      ? `${tileClass} px-3 py-2 ${tone === 'danger' ? '!border-[#fecaca] !bg-[#fef2f2]' : tone === 'warn' ? '!border-[#fde7c2] !bg-[#fffbf2]' : ''}`
      : 'border-[#eef1f4] px-3.5 py-2.5 [&:not(:first-child)]:border-l'
  return (
    <div className={`min-w-0 ${frame}`}>
      <dt className="text-[11px] font-medium text-[#64748b]">{label}</dt>
      <dd className={`m-0 truncate text-[14px] font-semibold tabular-nums ${VALUE[tone]}`}>{value}</dd>
      {sub && <dd className="m-0 truncate text-[11px] text-[#64748b]">{sub}</dd>}
    </div>
  )
}

const LINK: Record<'live' | 'stale' | 'lost' | 'none', { label: string; className: string; dot: string }> = {
  live: { label: 'Kết nối tốt', className: 'border-[#bfe6d2] bg-[#effbf5] text-[#1f7a55]', dot: 'bg-[#1f9d63]' },
  stale: { label: 'Tín hiệu chậm', className: 'border-[#fde7c2] bg-[#fffbf2] text-[#8a5a06]', dot: 'bg-[#d69412]' },
  lost: { label: 'Mất kết nối', className: 'border-[#fecaca] bg-[#fef2f2] text-[#b23e31]', dot: 'bg-[#dc2626]' },
  none: { label: 'Chưa có robot', className: 'border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]', dot: 'bg-[#94a3b8]' },
}

/**
 * The same facts as `RunStatus` (scope §11.5): step, target POI, dwell left,
 * run time, how old the robot's position is, and the command awaiting a result.
 * `strip` lays them out as one row; `panel` is a card for the live page's side
 * column, robot position first, so the map keeps the width.
 */
export function LiveStatusStrip({ tour, robot, now, variant = 'strip' }: { tour: TourOperation; robot?: AmrStatus; now: number; variant?: Variant }) {
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

  const step = <Cell key="step" variant={variant} label="Bước hiện tại" value={stepLabel(progress?.step)} sub={`${narration} · ${tour.language}`} />
  const where = <Cell key="where" variant={variant} label={moving ? 'Đang tới' : 'Điểm hiện tại'} value={target} sub={`${done}/${total} POI đã qua`} />
  const dwell = <Cell key="dwell" variant={variant} label="Thời gian dừng còn" value={dwellLeft != null ? `${dwellLeft} giây` : '-'} sub={progress?.hold ? 'Đang giữ tại POI' : undefined} tone={progress?.hold ? 'warn' : 'normal'} />
  const run = <Cell key="run" variant={variant} label="Đã chạy" value={formatStopwatch(tour.startedAt, now)} sub={`Bắt đầu ${formatTime(tour.startedAt)}`} />
  const pose = (
    <Cell
      key="pose"
      variant={variant}
      label="Vị trí robot"
      value={!robot ? 'Chưa có dữ liệu' : lost ? 'Mất kết nối' : `${age ?? '-'} giây trước`}
      sub={!robot ? undefined : lost ? 'Vị trí là mẫu cuối cùng' : stale ? 'Vị trí cũ' : robot.name}
      tone={lost ? 'danger' : stale ? 'warn' : 'normal'}
    />
  )
  const pending = (
    <Cell
      key="pending"
      variant={variant}
      label="Lệnh đang chờ"
      value={progress?.pendingCommand ? progress.pendingCommand.label : 'Không có'}
      sub={<>Chặng <span className="font-mono">{progress?.legId ?? '-'}</span> · lượt <span className="font-mono">{progress?.visitId ?? '-'}</span></>}
    />
  )

  if (variant === 'panel') {
    const link = LINK[!robot ? 'none' : lost ? 'lost' : stale ? 'stale' : 'live']
    return (
      <section className={`${cardClass} p-4`} aria-label="Thông số vận hành">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[#0f172a]">Thông số</h2>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${link.className}`}>
            <span aria-hidden="true" className={`size-2 rounded-full ${link.dot}`} />
            {link.label}
          </span>
        </div>
        <dl aria-label="Trạng thái phiên" className="m-0 grid grid-cols-2 gap-2">
          {pose}
          {pending}
          {step}
          {where}
          {dwell}
          {run}
        </dl>
      </section>
    )
  }

  return (
    <dl aria-label="Trạng thái phiên" className="m-0 grid grid-cols-2 overflow-hidden rounded-xl border border-[#e2e8f0] bg-white sm:grid-cols-3 xl:grid-cols-6">
      {step}
      {where}
      {dwell}
      {run}
      {pose}
      {pending}
    </dl>
  )
}
