import { Clock3, Hourglass, Radio, Send } from 'lucide-react'
import type { AmrStatus, TourOperation } from '../../../api/contracts/staff'
import { Field } from '../StaffUi'
import { stepLabel } from '../status'
import { formatStopwatch, formatTime } from '../formatters'
import { POSE_STALE_SECONDS, routeProgress } from '../attention'
import { TourStateBadges } from './TourParts'

/**
 * What an operator must see about a running Tour at any moment (scope §11.5):
 * TourState and OperationalStatus, the step, the POI, how old the data is, the
 * command still waiting for an outcome, and the dwell left at a POI.
 */
export function RunStatus({ tour, robot, now, compact = false }: { tour: TourOperation; robot?: AmrStatus; now: number; compact?: boolean }) {
  const progress = tour.progress
  const { current, done, total } = routeProgress(tour)
  const target = progress?.step === 'ReturningToEnd' ? tour.endPoint.name : current?.name ?? '—'
  const dwellLeft = progress?.dwellEndsAt ? Math.max(0, Math.round((new Date(progress.dwellEndsAt).getTime() - now) / 1000)) : null
  const poseAge = robot?.poseAgeSeconds
  const stale = robot && (robot.connectionState !== 'Live' || (poseAge ?? 0) > POSE_STALE_SECONDS)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TourStateBadges tour={tour} size={compact ? 'sm' : 'md'} />
        {!compact && <span className="text-xs text-[#8a98ac]">{done}/{total} POI · rev {tour.revision}</span>}
      </div>
      <dl className={`mt-4 grid grid-cols-2 gap-x-4 gap-y-4 ${compact ? 'rounded-xl bg-[#f7f9fc] p-4 [&_dd]:text-xs [&_dt]:text-[10px]' : ''}`}>
        <Field label="Bước hiện tại">{stepLabel(progress?.step)}</Field>
        <Field label={progress?.step === 'Navigating' || progress?.step === 'ReturningToEnd' ? 'Đang tới' : 'POI'}>{target}</Field>
        <Field label="Bắt đầu">{formatTime(tour.startedAt)} · <span className="tabular-nums">{formatStopwatch(tour.startedAt, now)}</span></Field>
        <Field label="Thời gian dừng còn">
          {dwellLeft != null ? <span className="tabular-nums">{dwellLeft}s{progress?.hold ? ' (đang giữ)' : ''}</span> : '—'}
        </Field>
      </dl>
      <ul className={`mt-4 space-y-1.5 ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
        <li className={`flex items-center gap-2 ${stale ? 'font-bold text-[#8a5a06]' : 'text-[#647793]'}`}>
          <Radio size={14} aria-hidden="true" />
          {robot ? (robot.connectionState !== 'Live' ? 'Robot mất kết nối — vị trí là mẫu cuối cùng' : `Vị trí cập nhật ${poseAge ?? '—'}s trước${stale ? ' (cũ)' : ''}`) : 'Chưa có dữ liệu robot'}
        </li>
        <li className="flex items-center gap-2 text-[#647793]">
          <Send size={14} aria-hidden="true" />
          {progress?.pendingCommand ? <span>Đang chờ kết quả: <strong className="text-[#1f314d]">{progress.pendingCommand.label}</strong> <span className="font-mono text-xs">{progress.pendingCommand.id}</span></span> : 'Không có lệnh đang chờ'}
        </li>
        <li className="flex items-center gap-2 text-[#647793]">
          <Hourglass size={14} aria-hidden="true" />
          Chặng <span className="font-mono text-xs">{progress?.legId ?? '—'}</span> · lượt dừng <span className="font-mono text-xs">{progress?.visitId ?? '—'}</span>
        </li>
        <li className="flex items-center gap-2 text-[#647793]">
          <Clock3 size={14} aria-hidden="true" />
          Thuyết minh: {progress?.narration === 'Playing' ? 'đang phát trên web học sinh' : progress?.narration === 'Stopped' ? 'đã dừng' : 'chưa phát'} · {tour.language}
        </li>
      </ul>
    </div>
  )
}
