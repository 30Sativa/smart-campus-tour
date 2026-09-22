import { Link } from 'react-router'
import { useEffect, useRef } from 'react'
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
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f1f5f9]" role="progressbar" aria-label="Điều kiện đã đạt" aria-valuemin={0} aria-valuemax={checks.length} aria-valuenow={passing.length}>
          <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${failing.length ? 'bg-[#d69412]' : 'bg-[#2f8f6b]'}`} style={{ width: `${(passing.length / Math.max(1, checks.length)) * 100}%` }} />
        </div>
        <span className="text-xs font-medium text-[#475569] tabular-nums">{passing.length}/{checks.length}</span>
      </div>
      <p className={`mb-3 text-sm font-semibold ${failing.length ? 'text-[#92400e]' : 'text-[#2f7a5b]'}`} role="status">
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
                <span className="block text-[13px] font-semibold text-[#0f172a]">{check.label}<span className="sr-only">: chưa đạt</span></span>
                {check.detail && <span className="block text-[13px] leading-5 text-[#7d5310]">{check.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ul className="grid gap-x-4 gap-y-2 sm:grid-cols-2" aria-label="Điều kiện đã đạt">
        {passing.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-[13px] text-[#334155]">
            <CircleCheck size={16} className="mt-0.5 shrink-0 text-[#2f8f6b]" aria-hidden="true" />
            <span className="min-w-0">{check.label}<span className="sr-only">: đạt</span>{check.detail && <span className="block text-xs text-[#94a3b8]">{check.detail}</span>}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-[#f1f5f9] pt-3 text-xs leading-5 text-[#94a3b8]">Sẵn sàng nghĩa là đã khóa nội dung và danh sách đoàn. Không có nghĩa robot đã sẵn sàng: Staff kiểm tra robot, đầu xoay và nguồn hình khi bắt đầu.</p>
    </div>
  )
}

const SEGMENTS: Array<{ key: keyof Omit<RegistrationCounts, 'total'>; label: string; fill: string }> = [
  { key: 'approved', label: 'đã duyệt', fill: 'bg-[#2f8f6b]' },
  { key: 'submitted', label: 'chờ duyệt', fill: 'bg-[#d69412]' },
  { key: 'rejected', label: 'từ chối', fill: 'bg-[#c9534a]' },
  { key: 'cancelled', label: 'đã hủy', fill: 'bg-[#94a3b8]' },
]

/**
 * The bar shows registration proportions, not elapsed time or automatic
 * approval progress. Only the waiting segment moves to draw attention to work
 * that needs a reviewer; the actual counts always come from the API.
 */
export function RegistrationBar({ counts }: { counts: RegistrationCounts }) {
  const sheenRef = useRef<HTMLSpanElement>(null)
  const hasPending = counts.submitted > 0

  // One native transform animation keeps this summary light on lazy-loaded
  // admin routes. Cancel it when the queue empties or motion is reduced.
  useEffect(() => {
    const sheen = sheenRef.current
    if (!sheen?.animate) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let animation: Animation | undefined
    const syncMotion = () => {
      animation?.cancel()
      if (preference.matches) return
      animation = sheen.animate([
        { transform: 'translateX(-100%)', offset: 0 },
        { transform: 'translateX(100%)', offset: 0.75 },
        { transform: 'translateX(100%)', offset: 1 },
      ], { duration: 3000, iterations: Infinity, easing: 'linear' })
    }
    syncMotion()
    preference.addEventListener('change', syncMotion)
    return () => {
      animation?.cancel()
      preference.removeEventListener('change', syncMotion)
    }
  }, [hasPending])

  const parts = SEGMENTS.filter((segment) => counts[segment.key] > 0)
  const summary = parts.map((segment) => `${counts[segment.key]} ${segment.label}`).join(' · ')
  if (counts.total === 0) return <p className="text-[13px] text-[#64748b]">Chưa có đoàn đăng ký</p>
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs leading-5">
        {counts.submitted > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f1dcb0] bg-[#fffaf0] px-2 py-0.5 font-semibold text-[#92400e]">
            <Clock3 size={14} aria-hidden="true" />
            {counts.submitted} đoàn chờ duyệt
          </span>
        ) : <span className="font-medium text-[#475569]">Đăng ký đoàn</span>}
        <span className="text-[#64748b]"><strong className="font-semibold text-[#334155] tabular-nums">{counts.total}</strong> đoàn đăng ký</span>
      </div>
      <div className="flex h-2.5 gap-1 overflow-hidden rounded-full bg-[#f1f5f9]" role="img" aria-label={`${counts.total} đăng ký: ${summary}`}>
        {parts.map((segment) => (
          <span
            key={segment.key}
            title={`${counts[segment.key]} ${segment.label}`}
            className={`relative h-full min-w-0 overflow-hidden rounded-full ${segment.fill}`}
            style={{ flexBasis: 0, flexGrow: counts[segment.key] }}
          >
            {segment.key === 'submitted' && (
              <>
                <span className="absolute inset-0 bg-[repeating-linear-gradient(115deg,transparent,transparent_6px,rgba(255,255,255,0.25)_6px,rgba(255,255,255,0.25)_10px)]" />
                <span
                  ref={sheenRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/55 to-transparent [transform:translateX(-100%)] motion-reduce:hidden"
                />
              </>
            )}
          </span>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] leading-5 text-[#475569]" aria-hidden="true">
        {parts.map((segment) => (
          <span key={segment.key} className={`inline-flex items-center gap-1.5 ${segment.key === 'submitted' ? 'font-semibold text-[#92400e]' : ''}`}>
            <span className={`size-2 shrink-0 rounded-full ${segment.fill}`} />
            <span><span className="font-semibold tabular-nums">{counts[segment.key]}</span> {segment.label}</span>
          </span>
        ))}
      </p>
    </div>
  )
}

export function RegistrationSummary({ counts }: { counts: RegistrationCounts }) {
  const items: Array<[string, number, string]> = [
    ['Tổng', counts.total, 'text-[#1e293b]'],
    ['Chờ duyệt', counts.submitted, counts.submitted ? 'text-[#a86a06]' : 'text-[#1e293b]'],
    ['Đã duyệt', counts.approved, 'text-[#2f7a5b]'],
    ['Từ chối', counts.rejected, 'text-[#1e293b]'],
    ['Đã hủy', counts.cancelled, 'text-[#1e293b]'],
  ]
  return (
    <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {items.map(([label, value, tone]) => (
        <div key={label} className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5">
          <dt className="text-[11px] font-semibold text-[#64748b]">{label}</dt>
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
        <thead className="border-b border-[#f1f5f9] bg-[#f8fafc]">
          <tr>
            <th scope="col" className={thClass}>Tour</th>
            <th scope="col" className={thClass}>Thời gian dự kiến</th>
            <th scope="col" className={thClass}>Tuyến</th>
            {showCounts && <th scope="col" className={`${thClass} text-right`}>Đăng ký</th>}
            {showCounts && <th scope="col" className={`${thClass} text-right`}>Đã duyệt</th>}
            {showCounts && <th scope="col" className={`${thClass} text-right`}>Chờ duyệt</th>}
            <th scope="col" className={thClass}>Trạng thái</th>
            <th scope="col" className={`${thClass} sticky right-0 bg-[#f8fafc] text-right`}>Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {tours.map((tour) => {
            const action = rowAction(tour)
            return (
              <tr key={tour.id} className={rowClass}>
                <td className={`${tdClass} min-w-60`}>
                  <Link to={`/admin/tours/${tour.id}`} className="font-semibold text-[#0f172a] hover:text-[#2563eb] hover:underline">{tour.name}</Link>
                  <p className="text-xs text-[#94a3b8]">{tour.code}</p>
                </td>
                <td className={`${tdClass} text-[13px] whitespace-nowrap text-[#334155] tabular-nums`}>{formatSlot(tour.scheduledAt)}</td>
                <td className={`${tdClass} min-w-44 text-[13px] text-[#334155]`}>{tour.routeName}</td>
                {showCounts && <td className={`${tdClass} text-right tabular-nums`}>{tour.counts.total}</td>}
                {showCounts && <td className={`${tdClass} text-right tabular-nums`}>{tour.counts.approved}</td>}
                {showCounts && <td className={`${tdClass} text-right font-bold tabular-nums ${tour.counts.submitted ? 'text-[#a86a06]' : 'text-[#94a3b8]'}`}>{tour.counts.submitted}</td>}
                <td className={tdClass}><TourStateBadge state={tour.state} /></td>
                <td className={`${tdClass} sticky right-0 bg-white text-right`}>
                  <Link to={detailPath(tour)} className={buttonClass(action.kind, 'sm')}>{action.label}</Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </TableFrame>
      <ul className="divide-y divide-[#f1f5f9] md:hidden" aria-label={label}>
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
          <p className="font-bold text-[#1e293b]">{tour.name}</p>
          <p className="text-xs text-[#94a3b8]">{tour.code}</p>
        </div>
        <TourStateBadge state={tour.state} />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[#334155]"><CalendarClock size={14} className="text-[#94a3b8]" aria-hidden="true" />{formatSlot(tour.scheduledAt)}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#334155]"><Route size={14} className="text-[#94a3b8]" aria-hidden="true" />{tour.routeName}</p>
      <p className="mt-2 text-xs text-[#64748b]">{tour.counts.total} đăng ký, {tour.counts.approved} đã duyệt, <span className={tour.counts.submitted ? 'font-bold text-[#a86a06]' : ''}>{tour.counts.submitted} chờ duyệt</span></p>
      <Link to={detailPath(tour)} className={`${buttonClass(action.kind, 'sm')} mt-3 w-full`}>{action.label}<ChevronRight size={14} aria-hidden="true" /></Link>
    </div>
  )
}
