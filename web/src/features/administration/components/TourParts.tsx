import { Link } from 'react-router'
import { CalendarClock, ChevronRight, CircleCheck, CircleX, Clock3, Route } from 'lucide-react'
import type { AdminTour, ReadyCheck, RegistrationCounts } from '../../../api/contracts/admin'
import { buttonClass } from '../../staff/ui-classes'
import { formatSlot } from '../admin-format'
import { rowClass, tdClass, thClass } from '../admin-classes'
import { TableFrame, TourStateBadge } from '../AdminUi'

/**
 * The READY checklist as the server evaluated it (scope §5.2). Every line
 * says what it looked at; a failing line says exactly what is missing, so the
 * screen never answers with a bare "Cannot finalize".
 *
 * READY here means content and groups are locked. It says nothing about the
 * robot: device checks happen at Start, in the operations console.
 */
export function ReadyChecklist({ checks }: { checks: ReadyCheck[] }) {
  const failing = checks.filter((check) => !check.passed)
  const passing = checks.filter((check) => check.passed)
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#efefe9]" role="progressbar" aria-label="Điều kiện đã đạt" aria-valuemin={0} aria-valuemax={checks.length} aria-valuenow={passing.length}>
          <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${failing.length ? 'bg-[#d69412]' : 'bg-[#5f7a12]'}`} style={{ width: `${(passing.length / Math.max(1, checks.length)) * 100}%` }} />
        </div>
        <span className="text-xs font-medium text-[#4a4f59] tabular-nums">{passing.length}/{checks.length}</span>
      </div>
      <p className={`mb-3 text-sm font-semibold ${failing.length ? 'text-[#92400e]' : 'text-[#4d6410]'}`} role="status">
        {failing.length ? `Còn ${failing.length} điều kiện chưa đạt để chốt Tour` : 'Đủ điều kiện chốt Tour sang Sẵn sàng'}
      </p>
      {/* What blocks READY comes first and carries the detail; what already
          passes is a quiet list underneath, so the page answers "why not yet"
          before anything else. */}
      {failing.length > 0 && (
        <ul className="mb-4 grid gap-2" aria-label="Điều kiện chưa đạt">
          {failing.map((check) => (
            <li key={check.id} className="flex items-start gap-2.5 rounded-xl border border-[#f1dcb0] bg-[#fffaf0] px-3.5 py-2.5 transition-colors duration-300">
              <CircleX size={18} className="mt-0.5 shrink-0 text-[#c07a0e]" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[#1c1c1c]">{check.label}<span className="sr-only">: chưa đạt</span></span>
                {check.detail && <span className="block text-[13px] leading-5 text-[#7d5310]">{check.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ul className="grid gap-x-4 gap-y-2 sm:grid-cols-2" aria-label="Điều kiện đã đạt">
        {passing.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-[13px] text-[#3a3d44]">
            <CircleCheck size={16} className="mt-0.5 shrink-0 text-[#5f7a12]" aria-hidden="true" />
            <span className="min-w-0">{check.label}<span className="sr-only">: đạt</span>{check.detail && <span className="block text-xs text-[#8e9096]">{check.detail}</span>}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-[#efefe9] pt-3 text-xs leading-5 text-[#8e9096]">Sẵn sàng nghĩa là đã khóa nội dung và danh sách đoàn. Không có nghĩa robot đã sẵn sàng: Staff kiểm tra robot, đầu xoay và nguồn hình khi bắt đầu.</p>
    </div>
  )
}

const SEGMENTS: Array<{ key: keyof Omit<RegistrationCounts, 'total'>; label: string; stroke: string; dot: string }> = [
  { key: 'approved', label: 'đã duyệt', stroke: '#9cc93a', dot: 'bg-[#9cc93a]' },
  { key: 'submitted', label: 'chờ duyệt', stroke: '#e0a02a', dot: 'bg-[#e0a02a]' },
  { key: 'rejected', label: 'từ chối', stroke: '#c9534a', dot: 'bg-[#c9534a]' },
  { key: 'cancelled', label: 'đã hủy', stroke: '#c6c7cc', dot: 'bg-[#c6c7cc]' },
]

const RING_R = 22
const RING_C = 2 * Math.PI * RING_R

/**
 * Registration report: a ring split by decision (approved, waiting, rejected,
 * cancelled) with "approved / total" in the middle, and the counts beside it.
 * It reports how decisions stand, not elapsed time, so it is an image with a
 * spoken summary rather than a progressbar. The waiting slice pulses to draw
 * a reviewer's eye; reduced motion keeps it still.
 */
export function RegistrationBar({ counts }: { counts: RegistrationCounts }) {
  const parts = SEGMENTS.filter((segment) => counts[segment.key] > 0)
  const summary = parts.map((segment) => `${counts[segment.key]} ${segment.label}`).join(' · ')
  if (counts.total === 0) return <p className="text-[13px] text-[#6b6e75]">Chưa có đoàn đăng ký</p>

  // Slices with a 2px gap between them when there is more than one.
  const gap = parts.length > 1 ? 2.5 : 0
  const lengths = parts.map((segment) => (counts[segment.key] / counts.total) * RING_C)
  const slices = parts.map((segment, i) => ({
    segment,
    dash: Math.max(lengths[i] - gap, 0.5),
    offset: lengths.slice(0, i).reduce((sum, value) => sum + value, 0),
  }))

  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <svg viewBox="0 0 56 56" className="size-14 shrink-0 -rotate-90" role="img" aria-label={`${counts.total} đăng ký: ${summary}`}>
        <circle cx="28" cy="28" r={RING_R} fill="none" stroke="#efefe9" strokeWidth="7" />
        {slices.map(({ segment, dash, offset: at }) => (
          <circle
            key={segment.key}
            cx="28"
            cy="28"
            r={RING_R}
            fill="none"
            stroke={segment.stroke}
            strokeWidth="7"
            strokeLinecap="butt"
            strokeDasharray={`${dash} ${RING_C - dash}`}
            strokeDashoffset={-at}
            className={segment.key === 'submitted' ? 'animate-pulse motion-reduce:animate-none' : undefined}
          >
            <title>{`${counts[segment.key]} ${segment.label}`}</title>
          </circle>
        ))}
        <text x="28" y="28" transform="rotate(90 28 28)" textAnchor="middle" dominantBaseline="central" className="fill-[#1c1c1c] text-[13px] font-semibold tabular-nums">
          {counts.approved}/{counts.total}
        </text>
      </svg>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs leading-5">
          <span className="font-mono text-[11px] tracking-[0.06em] text-[#6b6e75] uppercase">Đăng ký đoàn</span>
          {counts.submitted > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1c1c1c] py-0.5 pr-2.5 pl-1 font-medium text-white">
              <span className="grid size-4.5 place-items-center rounded-full bg-[#e0a02a] text-[#1c1c1c]"><Clock3 size={11} aria-hidden="true" /></span>
              {counts.submitted} đoàn chờ duyệt
            </span>
          ) : (
            <span className="text-[#4d6410]">{counts.approved === counts.total ? 'Đã duyệt hết' : 'Không còn đoàn chờ'}</span>
          )}
        </div>
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-[#4a4f59]" aria-hidden="true">
          {parts.map((segment) => (
            <div key={segment.key} className="flex items-center gap-1.5">
              <span className={`size-2 shrink-0 rounded-full ${segment.dot}`} />
              <dt className="min-w-0 truncate">{segment.label}</dt>
              <dd className={`ml-auto font-semibold tabular-nums ${segment.key === 'submitted' ? 'text-[#92400e]' : 'text-[#1c1c1c]'}`}>{counts[segment.key]}</dd>
            </div>
          ))}
          <div className="col-span-2 mt-0.5 border-t border-[#efefe9] pt-0.5 text-[11px] text-[#8e9096]">Tổng {counts.total} đoàn đăng ký</div>
        </dl>
      </div>
    </div>
  )
}

type JourneyStep = { key: string; label: string }

const JOURNEY: JourneyStep[] = [
  { key: 'open', label: 'Đăng ký' },
  { key: 'review', label: 'Duyệt' },
  { key: 'finalize', label: 'Chốt' },
  { key: 'run', label: 'Vận hành' },
]

/** Which step a Tour is on, and a one-line note for that step. Derived from state the server already sent. */
function journeyOf(tour: Pick<AdminTour, 'state' | 'counts' | 'readyBlockers'>): { index: number; note: string; tone: 'ok' | 'warn' | 'live' | 'done' | 'muted' } {
  const { state, counts, readyBlockers } = tour
  if (state === 'Completed') return { index: 4, note: 'Buổi đã hoàn thành', tone: 'done' }
  if (state === 'Cancelled') return { index: -1, note: 'Buổi đã hủy', tone: 'muted' }
  if (state === 'Running') return { index: 3, note: 'Staff đang điều hành', tone: 'live' }
  if (state === 'Ready') return { index: 3, note: 'Đã chốt, chờ Staff bắt đầu', tone: 'ok' }
  if (counts.total === 0) return { index: 0, note: 'Chưa có đoàn đăng ký', tone: 'muted' }
  if (counts.submitted > 0) return { index: 1, note: `Duyệt nốt ${counts.submitted} đoàn để chốt`, tone: 'warn' }
  if (readyBlockers.length) return { index: 2, note: `Còn ${readyBlockers.length} điều kiện trước khi chốt`, tone: 'warn' }
  return { index: 2, note: 'Đủ điều kiện chốt', tone: 'ok' }
}

/**
 * Where a Tour is on its way to running, as a four-node stepper: done nodes
 * are ink with a lime tick, the current node is a lime ring (pulsing while
 * live), the track fills up to it. A step is not a timer; the note under the
 * current node says what is holding it.
 */
export function TourJourney({ tour }: { tour: Pick<AdminTour, 'state' | 'counts' | 'readyBlockers'> }) {
  const { index, note, tone } = journeyOf(tour)
  const last = JOURNEY.length - 1
  const fill = index < 0 ? 0 : Math.min(index, last) / last
  const noteColor = tone === 'warn' ? 'text-[#92400e]' : tone === 'ok' || tone === 'live' ? 'text-[#4d6410]' : 'text-[#6b6e75]'
  // Node centres run from one edge to the other: 12.5px (half a node) in from each side.
  const at = (i: number) => `calc(12.5px + (100% - 25px) * ${i / last})`
  return (
    <div className="min-w-0">
      <ol className="relative h-[44px]" aria-label="Tiến trình chuẩn bị Tour">
        <span aria-hidden="true" className="absolute top-[11px] right-[12.5px] left-[12.5px] h-[3px] rounded-full bg-[#e3e3dc]">
          <span className="block h-full rounded-full bg-[linear-gradient(90deg,#1c1c1c,#9cc93a)] transition-[width] duration-700 ease-out" style={{ width: `${fill * 100}%` }} />
        </span>
        {JOURNEY.map((step, i) => {
          const done = index > i || (tone === 'done' && index >= i)
          const current = index === i && tone !== 'done'
          const align = i === 0 ? 'items-start text-left' : i === last ? 'items-end text-right' : 'items-center text-center'
          const shift = i === 0 ? '-12.5px' : i === last ? 'calc(-100% + 12.5px)' : '-50%'
          return (
            <li
              key={step.key}
              className={`absolute top-0 flex flex-col gap-1.5 whitespace-nowrap ${align}`}
              style={{ left: at(i), transform: `translateX(${shift})` }}
              aria-current={current ? 'step' : undefined}
            >
              <span className="relative grid size-[25px] place-items-center">
                {current && tone === 'live' && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-[#bde74e]/60 motion-reduce:animate-none" />}
                <span
                  className={`relative grid size-[25px] place-items-center rounded-full text-[11px] font-semibold transition-colors ${
                    done ? 'bg-[#1c1c1c] text-[#bde74e]'
                    : current ? tone === 'warn' ? 'border-[3px] border-[#e0a02a] bg-white text-[#92400e]' : 'border-[3px] border-[#9cc93a] bg-white text-[#1c1c1c]'
                    : 'border-2 border-[#d6d7da] bg-white text-[#8e9096]'
                  }`}
                >
                  {done ? <CircleCheck size={15} strokeWidth={2.4} aria-hidden="true" /> : i + 1}
                </span>
              </span>
              <span className={`text-[11px] leading-tight ${current ? 'font-semibold text-[#1c1c1c]' : done ? 'text-[#4a4f59]' : 'text-[#8e9096]'}`}>
                {step.label}
                <span className="sr-only">{done ? ' (đã xong)' : current ? ' (bước hiện tại)' : ''}</span>
              </span>
            </li>
          )
        })}
      </ol>
      <p className={`mt-1.5 text-xs font-medium ${noteColor}`}>{note}</p>
    </div>
  )
}

export function RegistrationSummary({ counts }: { counts: RegistrationCounts }) {
  const items: Array<[string, number, string]> = [
    ['Tổng', counts.total, 'text-[#1c1c1c]'],
    ['Chờ duyệt', counts.submitted, counts.submitted ? 'text-[#a86a06]' : 'text-[#1c1c1c]'],
    ['Đã duyệt', counts.approved, 'text-[#4d6410]'],
    ['Từ chối', counts.rejected, 'text-[#1c1c1c]'],
    ['Đã hủy', counts.cancelled, 'text-[#1c1c1c]'],
  ]
  return (
    <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {items.map(([label, value, tone]) => (
        <div key={label} className="rounded-xl border border-[#e3e3dc] bg-[#f7f7f3] px-3 py-2.5">
          <dt className="text-[11px] font-semibold text-[#6b6e75]">{label}</dt>
          <dd className={`mt-0.5 text-xl font-bold tabular-nums ${tone}`}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The one next thing a row offers, by state. */
function rowAction(tour: AdminTour): { label: string; kind: 'primary' | 'secondary' } {
  if (tour.state === 'Scheduled' && tour.counts.submitted > 0) return { label: 'Duyệt đăng ký', kind: 'primary' }
  if (tour.state === 'Scheduled' && tour.allowedActions.finalize.allowed) return { label: 'Chốt Tour', kind: 'primary' }
  if (tour.state === 'Scheduled' || tour.state === 'Ready') return { label: 'Mở Tour', kind: 'secondary' }
  return { label: 'Xem', kind: 'secondary' }
}

const detailPath = (tour: AdminTour) => `/admin/tours/${tour.id}${tour.state === 'Scheduled' && tour.counts.submitted > 0 ? '?tab=registrations' : ''}`

/**
 * Tours as a table on desktop/tablet (scrolls sideways on tablet) and as cards
 * on a phone. Columns follow scope §11.1: time, route, state, registrations.
 */
export function AdminTourTable({ tours, label, showCounts = true }: { tours: AdminTour[]; label: string; showCounts?: boolean }) {
  return (
    <>
      <TableFrame label={label}>
        <thead className="border-b border-[#efefe9] bg-[#f7f7f3]">
          <tr>
            <th scope="col" className={thClass}>Tour</th>
            <th scope="col" className={thClass}>Thời gian dự kiến</th>
            <th scope="col" className={thClass}>Tuyến</th>
            {showCounts && <th scope="col" className={`${thClass} text-right`}>Đăng ký</th>}
            {showCounts && <th scope="col" className={`${thClass} text-right`}>Đã duyệt</th>}
            {showCounts && <th scope="col" className={`${thClass} text-right`}>Chờ duyệt</th>}
            <th scope="col" className={thClass}>Trạng thái</th>
            <th scope="col" className={`${thClass} sticky right-0 bg-[#f7f7f3] text-right`}>Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#efefe9]">
          {tours.map((tour) => {
            const action = rowAction(tour)
            return (
              <tr key={tour.id} className={rowClass}>
                <td className={`${tdClass} min-w-60`}>
                  <Link to={`/admin/tours/${tour.id}`} className="font-semibold text-[#1c1c1c] hover:text-[#4d6410] hover:underline">{tour.name}</Link>
                  <p className="text-xs text-[#8e9096]">{tour.code}</p>
                </td>
                <td className={`${tdClass} text-[13px] whitespace-nowrap text-[#3a3d44] tabular-nums`}>{formatSlot(tour.scheduledAt)}</td>
                <td className={`${tdClass} min-w-44 text-[13px] text-[#3a3d44]`}>{tour.routeName}</td>
                {showCounts && <td className={`${tdClass} text-right tabular-nums`}>{tour.counts.total}</td>}
                {showCounts && <td className={`${tdClass} text-right tabular-nums`}>{tour.counts.approved}</td>}
                {showCounts && <td className={`${tdClass} text-right font-bold tabular-nums ${tour.counts.submitted ? 'text-[#a86a06]' : 'text-[#8e9096]'}`}>{tour.counts.submitted}</td>}
                <td className={tdClass}><TourStateBadge state={tour.state} /></td>
                <td className={`${tdClass} sticky right-0 bg-white text-right`}>
                  <Link to={detailPath(tour)} className={buttonClass(action.kind, 'sm')}>{action.label}</Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </TableFrame>
      <ul className="divide-y divide-[#efefe9] md:hidden" aria-label={label}>
        {tours.map((tour) => <li key={tour.id}><TourSummaryCard tour={tour} /></li>)}
      </ul>
    </>
  )
}

/** One Tour on a phone. */
export function TourSummaryCard({ tour }: { tour: AdminTour }) {
  const action = rowAction(tour)
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-[#1c1c1c]">{tour.name}</p>
          <p className="text-xs text-[#8e9096]">{tour.code}</p>
        </div>
        <TourStateBadge state={tour.state} />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[#3a3d44]"><CalendarClock size={14} className="text-[#8e9096]" aria-hidden="true" />{formatSlot(tour.scheduledAt)}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#3a3d44]"><Route size={14} className="text-[#8e9096]" aria-hidden="true" />{tour.routeName}</p>
      <p className="mt-2 text-xs text-[#6b6e75]">{tour.counts.total} đăng ký, {tour.counts.approved} đã duyệt, <span className={tour.counts.submitted ? 'font-bold text-[#a86a06]' : ''}>{tour.counts.submitted} chờ duyệt</span></p>
      <Link to={detailPath(tour)} className={`${buttonClass(action.kind, 'sm')} mt-3 w-full`}>{action.label}<ChevronRight size={14} aria-hidden="true" /></Link>
    </div>
  )
}
