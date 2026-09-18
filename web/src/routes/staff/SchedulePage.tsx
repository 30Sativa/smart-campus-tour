import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  Bot,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  CirclePause,
  CirclePlay,
  Clock,
  Filter,
  PackageOpen,
  RotateCcw,
  UserRound,
  Waypoints,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useOpsSchedule } from '../../features/operations/operations-hooks'
import {
  CellIcon,
  ErrorPanel,
  LoadingPanel,
  PageHeader,
  StatusBadge,
  SummaryTile,
  panelClass,
} from '../../features/operations/OperationsUi'
import { formatTime } from '../../features/operations/formatters'

/**
 * The `value` is the enum the API filters on and must not change; only the
 * label is translated. Keeping both here is what stops a Vietnamese screen from
 * sprouting an English chip.
 */
const filters: Array<{ value: string; label: string }> = [
  { value: 'All', label: 'Tất cả' },
  { value: 'Today', label: 'Hôm nay' },
  { value: 'Upcoming', label: 'Sắp tới' },
  { value: 'Scheduled', label: 'Đã lên lịch' },
  { value: 'Active', label: 'Đang diễn ra' },
  { value: 'Paused', label: 'Tạm dừng' },
  { value: 'Completed', label: 'Hoàn thành' },
  { value: 'Cancelled', label: 'Đã hủy' },
]

/**
 * The summary row above the table.
 *
 * `match` is the set of API status values a tile counts, because the API spells
 * a running session `InProgress` in the data and `Active` in the filter. The
 * tile counts the first and filters by the second, so the number under a tile
 * always matches the table you get by pressing it.
 */
const summaryTiles: Array<{ status: string; label: string; icon: LucideIcon; match?: string[] }> = [
  { status: 'All', label: 'Tổng phiên tour', icon: CalendarDays },
  { status: 'Active', label: 'Đang diễn ra', icon: CirclePlay, match: ['inprogress', 'active'] },
  { status: 'Scheduled', label: 'Đã lên lịch', icon: Clock, match: ['scheduled'] },
  { status: 'Completed', label: 'Hoàn thành', icon: CircleCheck, match: ['completed'] },
  { status: 'Paused', label: 'Tạm dừng', icon: CirclePause, match: ['paused'] },
]

/** Shown wherever a robot has not been assigned yet. Never a placeholder name. */
function Unassigned() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-[#a96d0b]">
      <PackageOpen size={16} strokeWidth={1.9} aria-hidden="true" />
      Chưa gán
    </span>
  )
}

export default function SchedulePage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || 'All'
  const date = params.get('date') || undefined

  /**
   * `All` is the UI's word for "no filter", so it is not sent. That also makes
   * this key identical to `dayQuery` below whenever no status is applied, and
   * TanStack collapses the two hooks onto one request instead of fetching the
   * same list twice.
   */
  const query = useMemo(() => (status === 'All' ? { date } : { status, date }), [status, date])
  const schedule = useOpsSchedule(query)

  /**
   * The same endpoint read without the status filter.
   *
   * The summary has to describe the whole day, not the slice currently on
   * screen — otherwise pressing "Hoàn thành" would leave every other tile
   * reading zero and the row would stop being a summary. Counting the rows the
   * API just returned is presentation, not a business rule: no total here is
   * derived from anything the table does not already show.
   */
  const dayQuery = useMemo(() => ({ date }), [date])
  const day = useOpsSchedule(dayQuery)

  const counts = useMemo(() => {
    const rows = day.data
    return summaryTiles.map((tile) => ({
      ...tile,
      count: !rows
        ? null
        : tile.match
          ? rows.filter((row) => tile.match?.includes(row.status.trim().toLowerCase())).length
          : rows.length,
    }))
  }, [day.data])

  const setStatus = (next: string) =>
    setParams((current) => {
      if (next === 'All') current.delete('status')
      else current.set('status', next)
      return current
    })

  const setDate = (next: string) =>
    setParams((current) => {
      if (next) current.set('date', next)
      else current.delete('date')
      return current
    })

  const isFiltered = status !== 'All' || Boolean(date)

  return (
    <div className="min-h-full bg-[#f1f6fe] px-4 py-5 font-sans sm:px-6 lg:px-8 lg:py-7">
      <div className="mx-auto w-full max-w-[1500px]">
        <PageHeader
          eyebrow="Vận hành tour"
          title="Lịch và phiên tour"
          description="Xem và điều phối các phiên tour. Thông tin lịch là chỉ đọc; thao tác gán AMR chỉ khả dụng trong chi tiết phiên chưa bắt đầu."
        />

        {/* ── Summary ──────────────────────────────────────────────────────
            Five tiles, one accent. The mock this came from tinted each tile a
            different hue; that would have made colour mean "which status" here
            and "how urgent" three centimetres lower on the status badge, which
            is the one thing the operations palette must not do. So the tiles
            carry the count and the label, and every one of them is blue. */}
        <section aria-label="Tổng quan lịch tour" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {counts.map(({ status: value, label, icon, count }) => (
            <SummaryTile
              key={value}
              label={label}
              value={count ?? '—'}
              icon={icon}
              selected={status === value}
              onSelect={() => setStatus(value)}
            />
          ))}
        </section>

        <section className={`${panelClass} mt-5`}>
          {/* ── Filters ───────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 border-b border-[#edf2fa] px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between lg:px-5">
            <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Lọc theo trạng thái">
              {filters.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  aria-pressed={status === value}
                  className={`min-h-9 shrink-0 rounded-full px-3.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f8df7] ${
                    status === value ? 'bg-[#2f62b8] text-white' : 'text-[#71819a] hover:bg-[#f1f6fe] hover:text-[#2f62b8]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <label className="flex min-h-9 items-center gap-2 rounded-xl border border-[#dce9fb] px-3 text-xs font-bold text-[#2f62b8] focus-within:border-[#4f8df7] focus-within:ring-1 focus-within:ring-[#4f8df7]">
                <Filter size={15} strokeWidth={1.9} aria-hidden="true" />
                Ngày
                <input
                  type="date"
                  value={date || ''}
                  onChange={(event) => setDate(event.target.value)}
                  className="bg-transparent text-[#2f62b8] outline-none"
                />
              </label>
              {/* Only offered when there is something to clear, so the control
                  never sits there doing nothing. */}
              {isFiltered && (
                <button
                  type="button"
                  onClick={() => setParams(new URLSearchParams())}
                  className="flex min-h-9 items-center gap-1.5 rounded-xl border border-[#dce9fb] px-3 text-xs font-bold text-[#71819a] transition-colors hover:border-[#5b91ed] hover:bg-[#f1f6fe] hover:text-[#2f62b8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f8df7]"
                >
                  <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
                  Xóa lọc
                </button>
              )}
            </div>
          </div>

          {schedule.isPending ? (
            <div className="p-5">
              <LoadingPanel />
            </div>
          ) : schedule.isError ? (
            <div className="p-5">
              <ErrorPanel error={schedule.error} />
            </div>
          ) : schedule.data.length === 0 ? (
            <p className="p-12 text-center text-sm font-medium text-[#71819a]">
              Không có phiên tour phù hợp với bộ lọc hiện tại.
            </p>
          ) : (
            <>
              {/* ── Table, from large screens up ───────────────────────────── */}
              <div className="hidden lg:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#f8fbff] text-[11px] font-bold text-[#71819a]">
                    <tr>
                      <th scope="col" className="px-6 py-4">Thời gian</th>
                      <th scope="col" className="px-4 py-4">Tuyến tham quan</th>
                      <th scope="col" className="px-4 py-4">Khách / booking</th>
                      <th scope="col" className="px-4 py-4">AMR</th>
                      <th scope="col" className="px-4 py-4">Trạng thái</th>
                      <th scope="col" className="px-6 py-4 text-right">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2fa] bg-white">
                    {schedule.data.map((tour) => (
                      <tr key={tour.sessionId} className="transition-colors hover:bg-[#f8fbff]">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <CellIcon icon={Clock} />
                            <div>
                              <p className="font-bold text-[#40546f] tabular-nums">
                                {formatTime(tour.startTime)}–{formatTime(tour.endTime)}
                              </p>
                              <p className="mt-1 text-xs text-[#71819a]">
                                {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(tour.startTime))}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <CellIcon icon={Waypoints} />
                            <span className="font-semibold text-[#40546f]">{tour.routeName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <CellIcon icon={UserRound} />
                            <div className="min-w-0">
                              <p className="font-medium text-[#647793]">{tour.visitorName || 'Không công khai'}</p>
                              <p className="mt-1 font-mono text-[11px] text-[#8a98ac]">{tour.bookingId.slice(0, 8)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {tour.amrName ? (
                            <div className="flex items-center gap-3">
                              <CellIcon icon={Bot} />
                              <span className="text-[#647793]">{tour.amrName}</span>
                            </div>
                          ) : (
                            <Unassigned />
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge value={tour.status} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            to={`/staff/tours/${tour.sessionId}`}
                            className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-[#dce9fb] px-3 text-xs font-bold text-[#2f62b8] transition-colors hover:border-[#5b91ed] hover:bg-[#eaf4ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f8df7]"
                          >
                            Mở phiên
                            <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── The same rows as cards, below large ─────────────────────
                  A six-column table on a phone is a horizontal scrollbar with a
                  table hidden behind it. Same data, same order, one column. */}
              <ul className="divide-y divide-[#edf2fa] lg:hidden">
                {schedule.data.map((tour) => (
                  <li key={tour.sessionId} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <CellIcon icon={Clock} />
                        <div>
                          <p className="font-bold text-[#40546f] tabular-nums">
                            {formatTime(tour.startTime)}–{formatTime(tour.endTime)}
                          </p>
                          <p className="mt-1 text-xs text-[#71819a]">
                            {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(tour.startTime))}
                          </p>
                        </div>
                      </div>
                      <StatusBadge value={tour.status} />
                    </div>

                    <p className="mt-3.5 flex items-center gap-3 text-sm font-semibold text-[#40546f]">
                      <CellIcon icon={Waypoints} />
                      {tour.routeName}
                    </p>

                    <div className="mt-2.5 flex items-center gap-3">
                      <CellIcon icon={UserRound} />
                      <p className="min-w-0 text-sm text-[#647793]">
                        {tour.visitorName || 'Không công khai'}
                        <span className="ml-2 font-mono text-[11px] text-[#8a98ac]">{tour.bookingId.slice(0, 8)}</span>
                      </p>
                    </div>

                    <div className="mt-2.5 flex items-center gap-3 text-sm">
                      {tour.amrName ? (
                        <>
                          <CellIcon icon={Bot} />
                          <span className="text-[#647793]">{tour.amrName}</span>
                        </>
                      ) : (
                        <Unassigned />
                      )}
                    </div>

                    <Link
                      to={`/staff/tours/${tour.sessionId}`}
                      className="mt-4 flex min-h-10 items-center justify-center gap-1 rounded-xl border border-[#dce9fb] px-3 text-xs font-bold text-[#2f62b8] hover:border-[#5b91ed] hover:bg-[#eaf4ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f8df7]"
                    >
                      Mở phiên
                      <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
