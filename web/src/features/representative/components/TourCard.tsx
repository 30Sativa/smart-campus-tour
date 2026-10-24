import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import type { RepresentativeTour } from '../api/types'
import { dayMonth, formatTime } from '../rep-format'
import { TOUR_IMAGES, repButton } from '../rep-classes'
import { TourStateBadge } from './RepUi'

/** A Tour card in the landing style; its action still follows the server-provided gate. */
export function TourCard({ tour, compact = false, visualIndex = 0 }: { tour: RepresentativeTour; compact?: boolean; visualIndex?: number }) {
  const date = dayMonth(tour.scheduledStartAt)
  const detail = `/dai-dien/buoi/${tour.id}`
  const canRegister = tour.register.allowed
  const stops = [...tour.stops].sort((a, b) => a.order - b.order)

  return (
    <article className={`rep-tour-card ${tour.state !== 'SCHEDULED' ? 'is-closed' : ''}`}>
      <Link to={detail} className="rep-tour-media" aria-label={`Xem chi tiết ${tour.name}`}>
        <img src={TOUR_IMAGES[visualIndex % TOUR_IMAGES.length]} alt="" loading="lazy" />
        <span className="rep-tour-state"><TourStateBadge state={tour.state} /></span>
        <span className="rep-tour-when"><b className="num">{formatTime(tour.scheduledStartAt)}</b><span>{date.weekday}<br />{date.day} {date.month.toLowerCase()}</span></span>
      </Link>
      <div className="rep-tour-body">
        <h3><Link to={detail}>{tour.name}</Link></h3>
        {!compact && <p className="rep-tour-desc">{tour.description || `Khám phá ${tour.routeName} cùng CampusTour.`}</p>}
        {stops.length > 0 && <p className="rep-route" aria-label={`${tour.routeName}: ${stops.map((s) => s.name).join(', ')}`}>{stops.map((stop) => <span key={stop.order}>{stop.name}</span>)}</p>}
      </div>
      <div className="rep-tour-foot">
        <p>{tour.routeName} · {tour.stops.length} điểm</p>
        {canRegister
          ? <Link to={`${detail}/dang-ky`} className={repButton('primary', 'sm')}>Đăng ký đoàn<ArrowRight size={15} className="rep-arrow" aria-hidden="true" /></Link>
          : <Link to={detail} className={repButton('secondary', 'sm')}>Xem chi tiết buổi</Link>}
      </div>
      {!compact && !canRegister && tour.register.reason && <p className="rep-hint" style={{ padding: '0 20px 16px' }}>{tour.register.reason}</p>}
    </article>
  )
}
