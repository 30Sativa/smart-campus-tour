import { Link } from 'react-router'
import type { AmrStatus, TourOperation } from '../../../api/contracts/staff'
import { groupSummary, routeProgress } from '../attention'
import { REASON_SHORT } from '../reason'
import { CARD, DONE, NAVY, REST, tookPlace } from '../overview-data'

/**
 * The running session as three bars (route, time, battery) and today's
 * students session by session. Only readings the operations API supplied.
 */
export function RunningFunnel({ tours, robots, now }: { tours: TourOperation[]; robots: AmrStatus[]; now: number }) {
  const running = tours.find((tour) => tour.state === 'Running')
  const robot = running ? robots.find((item) => item.id === running.robotId) : undefined
  const progress = running ? routeProgress(running) : null
  const started = running?.startedAt ? new Date(running.startedAt).getTime() : null
  const ends = running ? new Date(running.estimatedEndAt).getTime() : NaN
  const elapsed = started != null && Number.isFinite(ends) && ends > started ? Math.round(((now - started) / (ends - started)) * 100) : null
  const minutes = started != null ? Math.max(0, Math.floor((now - started) / 60_000)) : null
  const assist = running?.operationalStatus === 'NeedsAssistance'
  return (
    <section className={CARD} aria-labelledby="ov-run">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f1f2f4] px-5 py-3.5">
        <h2 id="ov-run" className="text-sm font-semibold tracking-[-0.01em] text-[#1f2937]">Buổi đang chạy{running ? ` · ${running.code}` : ''}</h2>
        {running && <Link to={`/staff/live/${running.id}`} className="text-xs font-semibold text-[#2d719e] hover:underline">Mở điều hành ›</Link>}
      </div>
      {!running ? (
        <p className="px-5 py-10 text-center text-sm text-[#6b7280]">Hiện không có buổi nào đang chạy.</p>
      ) : (
        <>
          <ol className="grid gap-4 px-5 py-5">
            <Meter label="POI đã qua" detail={`${progress?.done ?? 0} / ${progress?.total ?? 0}`} value={progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0} color={DONE} />
            {elapsed != null && <Meter label="Thời gian đã chạy" detail={`${minutes} phút · dự kiến xong lúc ${new Date(ends).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`} value={elapsed} color={NAVY} />}
            {robot?.batteryPercent != null && <Meter label={`Pin ${robot.name}`} detail={`${robot.batteryPercent}%`} value={robot.batteryPercent} color={robot.batteryPercent < 30 ? '#b42318' : REST} />}
          </ol>
          <p className="flex flex-wrap gap-1.5 px-5 pb-5">
            {assist && <span className="rounded-md bg-[#fef2f2] px-2 py-0.5 text-[11.5px] font-semibold text-[#b42318]">Cần hỗ trợ{running.reason ? ` · ${(REASON_SHORT[running.reason] ?? running.reason).toLowerCase()}` : ''}</span>}
            {progress?.current && <span className="rounded-md bg-[#f3f4f6] px-2 py-0.5 text-[11.5px] font-semibold text-[#4b5563]">Đang tới {progress.current.name}</span>}
            <span className="rounded-md bg-[#f3f4f6] px-2 py-0.5 text-[11.5px] font-semibold text-[#4b5563]">{groupSummary(running).groups} đoàn · {groupSummary(running).students} HS</span>
          </p>
        </>
      )}
    </section>
  )
}

function Meter({ label, detail, value, color }: { label: string; detail: string; value: number; color: string }) {
  const safe = Math.max(0, Math.min(100, value))
  return (
    <li className="grid gap-x-5 gap-y-1.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
      <p className="text-[13px] font-semibold text-[#1f2937]">{label}<span className="block text-xs font-medium text-[#6b7280] tabular-nums">{detail}</span></p>
      <div className="h-3 overflow-hidden rounded-full bg-[#f3f4f6]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safe}>
        <span className="block h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${safe}%`, background: color }} />
      </div>
    </li>
  )
}

/** Approved students per session today: dark once it ran, light while it is still ahead. */
export function StudentsByTour({ tours }: { tours: TourOperation[] }) {
  const rows = tours.filter(tookPlace).map((tour) => ({
    id: tour.id,
    code: tour.code,
    time: new Date(tour.startedAt ?? tour.scheduledAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    students: groupSummary(tour).students,
    status: tour.state === 'Running' ? 'đang chạy' : tour.state === 'Completed' || tour.state === 'Cancelled' ? 'xong' : 'sắp tới',
    ran: tour.state !== 'Scheduled' && tour.state !== 'Ready',
  }))
  const max = Math.max(1, ...rows.map((row) => row.students))
  const total = rows.reduce((s, row) => s + row.students, 0)
  return (
    <section className={CARD} aria-labelledby="ov-students">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f1f2f4] px-5 py-3.5">
        <h2 id="ov-students" className="text-sm font-semibold tracking-[-0.01em] text-[#1f2937]">Học sinh theo buổi hôm nay</h2>
        <span className="text-xs text-[#6b7280] tabular-nums">{total} học sinh · {rows.length} buổi</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[#6b7280]">Chưa có dữ liệu buổi hôm nay.</p>
      ) : (
        <ul className="grid gap-2.5 px-5 py-5" role="img" aria-label={rows.map((row) => `${row.code}: ${row.students} học sinh`).join(', ')}>
          {rows.map((row) => (
            <li key={row.id} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_40px] items-center gap-3 text-[13px]">
              <span className="truncate"><Link to={`/staff/tours/${row.id}`} className="font-semibold text-[#1f2937] hover:text-[#2d719e]">{row.code}</Link> · {row.time} <span className={row.status === 'đang chạy' ? 'font-semibold text-[#2563eb]' : 'text-[#6b7280]'}>{row.status}</span></span>
              <span className="h-3.5 rounded bg-[#f3f4f6]"><span className="block h-full rounded" style={{ width: `${(row.students / max) * 100}%`, background: row.ran ? DONE : REST }} /></span>
              <b className="text-right tabular-nums">{row.students}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
