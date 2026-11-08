import { Link } from 'react-router'
import type { RepresentativeTour } from '../api/types'
import { formatDateTime } from '../rep-format'
import { repButton } from '../rep-classes'
import { registrationClosesAt } from '../registration-deadline'
import { TourStateBadge } from './RepUi'

/** A flat catalog record. Detail resolves ownership before offering registration. */
export function TourCard({ tour, compact = false }: { tour: RepresentativeTour; compact?: boolean; visualIndex?: number }) {
  const detail = `/dai-dien/buoi/${tour.id}`
  return <article className="rep-list-row rep-tour-row">
    <div className="rep-tour-summary">
      <h3><Link to={detail}>{tour.name}</Link></h3>
      <p>{tour.routeName}</p>
      {!compact && tour.description && <p className="rep-hint">{tour.description}</p>}
      {!tour.register.allowed && tour.register.reason && <p className="rep-hint">{tour.register.reason}</p>}
    </div>
    <dl className="rep-tour-meta">
      <div><dt>Thời gian</dt><dd>{formatDateTime(tour.scheduledStartAt)}</dd></div>
      {tour.capacity != null && tour.remainingSeats != null && <div><dt>Chỗ</dt><dd>Còn {tour.remainingSeats}/{tour.capacity} chỗ</dd></div>}
      <div><dt>Hạn đăng ký</dt><dd>{formatDateTime(registrationClosesAt(tour.scheduledStartAt).toISOString())}</dd></div>
    </dl>
    <div className="rep-stack">
      <TourStateBadge state={tour.state} />
      <Link to={detail} className={repButton('secondary', 'sm')}>Xem chi tiết buổi</Link>
    </div>
  </article>
}
