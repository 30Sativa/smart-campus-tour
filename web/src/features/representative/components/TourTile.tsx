import { Link } from 'react-router'
import { CalendarClock, Clock3, Route as RouteIcon } from 'lucide-react'
import type { RepresentativeTour } from '../api/types'
import { formatShortDate, formatTime } from '../rep-format'
import { repButton } from '../rep-classes'
import { registrationClosesAt } from '../registration-deadline'
import { tourImage, type TourImage } from '../tour-image'
import { TourStateBadge } from './RepUi'

/** A catalog card: the Tour's sample image on top, its state on the image, then name, Route, times and the way in. */
export function TourTile({ tour, image = tourImage(tour) }: { tour: RepresentativeTour; image?: TourImage }) {
  const detail = `/dai-dien/buoi/${tour.id}`
  const closes = registrationClosesAt(tour).toISOString()
  return <article className="rep-tile">
    <Link to={detail} className="rep-tile-media" tabIndex={-1} aria-hidden="true">
      <img src={image.src} alt="" loading="lazy" decoding="async" />
      <span className="rep-tile-badge"><TourStateBadge state={tour.state} /></span>
    </Link>
    <div className="rep-tile-body">
      <h3><Link to={detail}>{tour.name}</Link></h3>
      <p className="rep-tile-route"><RouteIcon size={14} aria-hidden="true" />{tour.routeName} · {tour.stops.length} điểm dừng</p>
      {!tour.register.allowed && tour.register.reason && <p className="rep-hint">{tour.register.reason}</p>}
      <dl className="rep-tile-meta">
        <div><dt><CalendarClock size={14} aria-hidden="true" />Thời gian</dt><dd><time dateTime={tour.scheduledStartAt}>{formatTime(tour.scheduledStartAt)}, {formatShortDate(tour.scheduledStartAt)}</time></dd></div>
        <div><dt><Clock3 size={14} aria-hidden="true" />Hạn đăng ký</dt><dd><time dateTime={closes}>{formatTime(closes)}, {formatShortDate(closes)}</time></dd></div>
        {tour.capacity != null && tour.remainingSeats != null && <div className="rep-tile-seats"><dt>Chỗ</dt><dd>Còn {tour.remainingSeats}/{tour.capacity} chỗ</dd></div>}
      </dl>
      <Link to={detail} className={repButton('secondary', 'md', true)}>Xem chi tiết buổi</Link>
    </div>
  </article>
}
