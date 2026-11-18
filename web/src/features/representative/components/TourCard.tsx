import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import type { RepresentativeTour } from '../api/types'
import { formatDateTime } from '../rep-format'
import { repButton } from '../rep-classes'
import { registrationClosesAt } from '../registration-deadline'
import { TourStateBadge } from './RepUi'
import { tourImage, type TourImage } from '../tour-image'
import { TourCoverImg } from './TourCover'

/** A flat Tour record with its sample image. Detail resolves ownership before offering registration. */
export function TourCard({ tour, compact = false, image = tourImage(tour) }: { tour: RepresentativeTour; compact?: boolean; visualIndex?: number; image?: TourImage }) {
  const detail = `/dai-dien/buoi/${tour.id}`
  return <article className={`rep-list-row rep-tour-row rep-tour-row--media${compact ? ' rep-tour-row--compact' : ''}`}>
    <Link to={detail} className="rep-tour-thumb" tabIndex={-1} aria-hidden="true"><TourCoverImg tourId={tour.id} image={image} decorative loading="lazy" decoding="async" /></Link>
    <div className="rep-tour-summary">
      <h3><Link to={detail}>{tour.name}</Link></h3>
      <p>{tour.routeName}</p>
      {!compact && tour.description && <p className="rep-hint">{tour.description}</p>}
      {!tour.register.allowed && tour.register.reason && <p className="rep-hint">{tour.register.reason}</p>}
      {compact && <TourStateBadge state={tour.state} />}
    </div>
    <dl className="rep-tour-meta">
      <div><dt>Thời gian</dt><dd>{formatDateTime(tour.scheduledStartAt)}</dd></div>
      {tour.capacity != null && tour.remainingSeats != null && <div><dt>Chỗ</dt><dd>Còn {tour.remainingSeats}/{tour.capacity} chỗ</dd></div>}
      <div><dt>Hạn đăng ký</dt><dd>{formatDateTime(registrationClosesAt(tour).toISOString())}</dd></div>
    </dl>
    <div className="rep-stack">
      {!compact && <TourStateBadge state={tour.state} />}
      <Link to={detail} className={`${repButton('secondary', 'sm')}${compact ? ' rep-compact-tour-action' : ''}`} title={compact ? tour.name : undefined}>{compact ? <><ChevronRight size={16} aria-hidden="true" /><span className="rep-sr-only">Xem chi tiết buổi</span></> : 'Xem chi tiết buổi'}</Link>
    </div>
  </article>
}
