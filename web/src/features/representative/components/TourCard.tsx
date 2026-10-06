import { ArrowUpRight, Clock3, MapPin } from 'lucide-react'
import { Link } from 'react-router'
import type { RepresentativeTour } from '../api/types'
import { dayMonth, formatTime } from '../rep-format'
import { TourStateBadge } from './RepUi'

const TOUR_IMAGES = [
  '/images/representative-campus.png',
  '/images/home-3d/journey-smartbus.png',
  '/images/home-3d/closing-smartbus.png',
]

/** A visual Tour card; its action still follows the server-provided gate. */
export function TourCard({ tour, compact = false, visualIndex = 0 }: { tour: RepresentativeTour; compact?: boolean; visualIndex?: number }) {
  const date = dayMonth(tour.scheduledStartAt)
  const detail = `/dai-dien/buoi/${tour.id}`
  const canRegister = tour.register.allowed
  const action = canRegister ? { to: `${detail}/dang-ky`, label: 'Đăng ký đoàn', tone: 'lime' }
    : { to: detail, label: 'Xem chi tiết buổi', tone: 'soft' }

  return (
    <article className={`rep-tour-card ${tour.state !== 'SCHEDULED' ? 'is-closed' : ''}`}>
      <Link to={detail} className="rep-tour-image-link" aria-label={`Xem chi tiết ${tour.name}`}>
        <img src={TOUR_IMAGES[visualIndex % TOUR_IMAGES.length]} alt="" loading="lazy" />
        <span className="rep-tour-image-shade" />
        <span className="rep-tour-image-date"><Clock3 size={13} aria-hidden="true" />{formatTime(tour.scheduledStartAt)} · {date.weekday}, {date.day} {date.month}</span>
      </Link>
      <div className="rep-tour-content">
        <div className="rep-tour-status"><TourStateBadge state={tour.state} /></div>
        <h3><Link to={detail}>{tour.name}</Link></h3>
        <p className="rep-tour-description">{tour.description || `Khám phá ${tour.routeName} cùng CampusTour.`}</p>
        <div className="rep-tour-meta"><MapPin size={14} aria-hidden="true" /><span>{tour.routeName} · {tour.stops.length} điểm</span></div>
        <Link to={action.to} className={`rep-tour-action rep-tour-action-${action.tone}`}>{action.label}<ArrowUpRight size={16} aria-hidden="true" /></Link>
        {!compact && !canRegister && tour.register.reason && <p className="rep-tour-reason">{tour.register.reason}</p>}
      </div>
    </article>
  )
}
