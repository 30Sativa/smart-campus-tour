import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useRepTour, useRepRegistrations } from '../../features/representative/representative-hooks'
import { RepPage, Panel, InfoList, GatedAction, TourStateBadge, ErrorState, PageSkeleton } from '../../features/representative/components/RepUi'
import { RegistrationCard } from '../../features/representative/components/RegistrationCard'
import { RouteMap } from '../../features/representative/components/RouteMap'
import { dayMonth, formatDateTime, formatTime, readRepError } from '../../features/representative/rep-format'
import { TOUR_IMAGES } from '../../features/representative/rep-classes'

export default function RepTourDetailPage() {
  const { tourId = '' } = useParams()
  const query = useRepTour(tourId)
  const registrations = useRepRegistrations({ tourId, size: 5 })
  if (query.isPending) return <PageSkeleton />
  if (!query.data) return <RepPage><ErrorState title="Không xem được Tour" message={readRepError(query.error).message} back={{ to: '/dai-dien/buoi', label: 'Danh sách buổi' }} /></RepPage>
  const tour = query.data
  const date = dayMonth(tour.scheduledStartAt)
  const stops = [...tour.stops].sort((a, b) => a.order - b.order)
  return <RepPage>
    <Link to="/dai-dien/buoi" className="rep-back"><ArrowLeft size={16} aria-hidden="true" />Các buổi tham quan</Link>
    <div className="rep-detail">
      <div style={{ minWidth: 0 }}>
        <div className="rep-cover">
          <img src={TOUR_IMAGES[0]} alt="" />
          <div className="rep-cover-copy">
            <small>{date.weekday.toUpperCase()} · {formatTime(tour.scheduledStartAt)}</small>
            <h1>{tour.name}</h1>
            <div className="rep-badges"><TourStateBadge state={tour.state} /></div>
          </div>
        </div>
        {tour.description && <p className="rep-lead" style={{ marginTop: 22 }}>{tour.description}</p>}
        <RouteMap tour={tour} />
        <section className="rep-section" style={{ marginTop: 40 }} aria-labelledby="rep-stops-title">
          <span className="rep-kicker" id="rep-stops-title">Các điểm dừng</span>
          <ol className="rep-stops">{stops.map(stop => <li key={stop.order}><b className="num">{String(stop.order).padStart(2, '0')}</b><div><h3>{stop.name}</h3>{stop.description && <p>{stop.description}</p>}</div></li>)}</ol>
        </section>
      </div>
      <aside className="rep-aside" aria-label="Đăng ký đoàn">
        <h2>Đăng ký đoàn</h2>
        <InfoList columns={1} items={[{ label: 'Thời gian dự kiến', value: formatDateTime(tour.scheduledStartAt) }, { label: 'Tuyến tham quan', value: `${tour.routeName} · ${tour.stops.length} điểm` }]} />
        <GatedAction gate={tour.register} label="Đăng ký đoàn" kind="primary" to={`/dai-dien/buoi/${tour.id}/dang-ky`} />
        <p className="rep-hint">Mỗi đoàn có tên và danh sách lời mời riêng. Cá nhân dùng email của mình; điểm xem chung dùng email người phụ trách.</p>
      </aside>
    </div>
    <div className="rep-section">
      <Panel title="Đoàn của tôi trong buổi này" action={<Link to={`/dai-dien/dang-ky?tourId=${tour.id}`}>Xem tất cả ({registrations.data?.pagination.totalItems ?? '-'})</Link>}>
        {registrations.error ? <ErrorState title="Không tải được đăng ký" message={readRepError(registrations.error).message} onRetry={() => void registrations.refetch()} />
          : <div className="rep-reg-list">{registrations.data?.data.map(r => <RegistrationCard key={r.id} registration={r} />)}</div>}
        {registrations.data?.pagination.totalItems === 0 && <p className="rep-hint">Bạn chưa đăng ký đoàn nào trong buổi này.</p>}
      </Panel>
    </div>
  </RepPage>
}
