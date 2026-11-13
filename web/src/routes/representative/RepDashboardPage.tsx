import { Link } from 'react-router'
import { CalendarDays, ClipboardList, Hourglass } from 'lucide-react'
import { useRepRegistrations, useRepTours } from '../../features/representative/representative-hooks'
import { RepPage, RepSection, ErrorState, EmptyState, PageSkeleton } from '../../features/representative/components/RepUi'
import { TourCard } from '../../features/representative/components/TourCard'
import { tourImages } from '../../features/representative/tour-image'
import { RegistrationCard } from '../../features/representative/components/RegistrationCard'
import { RepAttention, RepHero, RepOverviewHeader } from '../../features/representative/components/DashboardParts'
import { isReviewExpired, readRepError } from '../../features/representative/rep-format'
import { nextUpcomingRegistration, useUpcomingRepRegistrations } from '../../features/representative/upcoming-registrations'
import { groupRecentActivity } from '../../features/representative/recent-activity'

export default function RepDashboardPage() {
  const tours = useRepTours({ size: 3, sort: 'scheduledStartAt' })
  const registrations = useRepRegistrations({ size: 5, sort: '-updatedAt' })
  const pending = useRepRegistrations({ state: 'SUBMITTED', size: 1 })
  const upcoming = useUpcomingRepRegistrations()
  const error = tours.error ?? registrations.error ?? pending.error
  if (error) return <RepPage><ErrorState title="Không tải được tổng quan" message={readRepError(error).message}
    onRetry={() => { void tours.refetch(); void registrations.refetch(); void pending.refetch() }} /></RepPage>
  if (!tours.data || !registrations.data || !pending.data) return <PageSkeleton />

  const recent = registrations.data.data
  const images = tourImages(tours.data.data)

  const recent = groupRecentActivity(registrations.data.data)
  const next = upcoming.isSuccess ? nextUpcomingRegistration(upcoming.data) : null
  const needsFix = upcoming.data?.find(registration => registration.state === 'REJECTED' && registration.tourState === 'SCHEDULED' && !isReviewExpired(registration)) ?? null

  return <RepPage>
    <RepOverviewHeader />
    {needsFix && <RepAttention registration={needsFix} />}
    <dl className="rep-compact-summary" aria-label="Tổng quan đăng ký">
      <div><dt><CalendarDays size={16} aria-hidden="true" />Buổi nhận đăng ký</dt><dd className="num">{tours.data.pagination.totalItems}</dd><p className="rep-hint">Các buổi đang nhận đăng ký đoàn</p></div>
      <div><dt><ClipboardList size={16} aria-hidden="true" />Đăng ký của tôi</dt><dd className="num">{registrations.data.pagination.totalItems}</dd><p className="rep-hint">Tất cả hồ sơ đăng ký của bạn</p></div>
      <div><dt><Hourglass size={16} aria-hidden="true" />Chờ duyệt</dt><dd className="num">{pending.data.pagination.totalItems}</dd><p className="rep-hint">Đang chờ Đại học FPT xét duyệt</p></div>
    </dl>
    <RepHero next={next} loading={upcoming.isPending} error={upcoming.error ? readRepError(upcoming.error).message : undefined} onRetry={() => void upcoming.refetch()} />
    <div className="rep-overview-grid">
      <RepSection className="rep-card" title="Hoạt động gần đây" action={<Link to="/dai-dien/dang-ky" className="rep-text-link">Đăng ký của tôi</Link>}>
        {recent.length ? <div className="rep-reg-list">{recent.map(item => item.kind === 'registration'
          ? <RegistrationCard key={item.registration.id} registration={item.registration} />
          : <article key={item.key} className="rep-closed rep-activity-group"><div><h3>{item.label}</h3><p className="rep-reg-sub">{item.registrations.map(r => r.tourName).join(', ')}</p></div><Link to={item.to} className="rep-text-link">Xem các đăng ký đã hủy</Link></article>)}</div>
          : <EmptyState variant="empty" title="Bạn chưa có đăng ký nào." />}
      </RepSection>
      <RepSection className="rep-card" title="Buổi đang nhận đăng ký" action={<Link to="/dai-dien/buoi" className="rep-text-link">Xem tất cả buổi</Link>}>
        {tours.data.data.length ? <div className="rep-tour-list">{tours.data.data.map(tour => <TourCard key={tour.id} tour={tour} image={images.get(tour.id)} compact />)}</div>
          : <EmptyState title="Chưa có buổi nhận đăng ký" description="Quay lại khi trường có lịch tham quan mới." />}
        {tours.data.data.length ? <div className="rep-tour-list">{tours.data.data.map(tour => <TourCard key={tour.id} tour={tour} compact />)}</div>
          : <EmptyState variant="empty" title="Hiện chưa có buổi nhận đăng ký." />}
      </RepSection>
    </div>
  </RepPage>
}
