import { Link } from 'react-router'
import type { RepresentativeTour } from '../../../api/contracts/representative'
import { buttonClass } from '../../staff/ui-classes'
import { cardHover, panelBase } from '../rep-classes'
import { dayMonth, formatTime } from '../rep-format'
import { RegistrationStatusBadge, TourStateBadge } from './RepUi'

/**
 * One Tour as a horizontal card: date, what it is, and the one thing the
 * representative can do with it. A Tour takes a new registration only while
 * Scheduled (flow review §4.1); otherwise the card says why and still opens.
 */
export function TourCard({ tour, compact = false }: { tour: RepresentativeTour; compact?: boolean }) {
  const d = dayMonth(tour.scheduledAt)
  const detail = `/dai-dien/buoi/${tour.id}`
  const hasActive = Boolean(tour.myRegistrationId) && tour.myRegistrationState !== 'Cancelled'
  const canRegister = tour.register.allowed

  return (
    <article className={`${panelBase} ${cardHover} grid gap-4 p-4 sm:grid-cols-[84px_minmax(0,1fr)] sm:p-5 lg:grid-cols-[84px_minmax(0,1fr)_220px] lg:items-center`}>
      <div className="flex items-center gap-3 sm:block sm:rounded-xl sm:border sm:border-[#e3ebf7] sm:bg-[#f5f9ff] sm:py-3 sm:text-center">
        <p className="text-xs font-medium text-[#64748b]">{d.weekday}</p>
        <p className="text-[28px] leading-none font-bold tracking-tight text-[#0f172a] tabular-nums sm:mt-1">{d.day}</p>
        <p className="text-xs text-[#64748b] sm:mt-1">{d.month}</p>
      </div>

      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <TourStateBadge state={tour.state} />
          {tour.myRegistrationState && <RegistrationStatusBadge state={tour.myRegistrationState} />}
        </div>
        <h3 className="text-[17px] leading-snug font-semibold text-[#0f172a]">
          <Link to={detail} className="rounded hover:text-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]">{tour.name}</Link>
        </h3>
        <p className="mt-1 text-sm text-[#475569]">
          Bắt đầu <span className="font-semibold text-[#0f172a] tabular-nums">{formatTime(tour.scheduledAt)}</span>
          <span className="mx-2 text-[#cbd5e1]" aria-hidden="true">|</span>
          {tour.routeName}, {tour.stops.length} điểm tham quan
        </p>
        {!compact && tour.description && <p className="mt-2 line-clamp-2 max-w-[70ch] text-sm leading-relaxed text-[#64748b]">{tour.description}</p>}
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
        {canRegister ? (
          <>
            <Link to={`${detail}/dang-ky`} className={buttonClass('primary')}>{tour.myRegistrationState === 'Cancelled' ? 'Đăng ký lại' : 'Đăng ký tour'}</Link>
            <Link to={detail} className={buttonClass('ghost', 'sm')}>Xem chi tiết</Link>
          </>
        ) : hasActive ? (
          <Link to={`/dai-dien/dang-ky/${tour.myRegistrationId}`} className={buttonClass('secondary')}>Xem đăng ký</Link>
        ) : (
          <>
            <Link to={detail} className={buttonClass('secondary')}>Xem chi tiết</Link>
            {tour.register.reason && <p className="text-[13px] leading-snug text-[#64748b] lg:text-center">{tour.register.reason}</p>}
          </>
        )}
      </div>
    </article>
  )
}
