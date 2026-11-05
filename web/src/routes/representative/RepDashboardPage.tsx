import { Link } from 'react-router'
import { CalendarDays, ClipboardList, Hourglass } from 'lucide-react'
import { useRepRegistrations, useRepTours } from '../../features/representative/representative-hooks'
import { RepPage, RepSection, ErrorState, EmptyState, PageSkeleton } from '../../features/representative/components/RepUi'
import { TourCard } from '../../features/representative/components/TourCard'
import { RegistrationCard } from '../../features/representative/components/RegistrationCard'
import { RepAttention, RepHero, RepOverviewHeader } from '../../features/representative/components/DashboardParts'
import { readRepError } from '../../features/representative/rep-format'
import { nextUpcomingRegistration, useUpcomingRepRegistrations } from '../../features/representative/upcoming-registrations'

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
  const next = upcoming.isSuccess ? nextUpcomingRegistration(upcoming.data) : null
  const needsFix = upcoming.data?.find(registration => registration.state === 'REJECTED' && registration.tourState === 'SCHEDULED') ?? null

  return <RepPage>
    <RepOverviewHeader />
    {needsFix && <RepAttention registration={needsFix} />}
    <dl className="rep-compact-summary" aria-label="Tổng quan đăng ký">
      <div><dt><CalendarDays size={16} aria-hidden="true" />Buổi nhận đăng ký</dt><dd className="num">{tours.data.pagination.totalItems}</dd><p className="rep-hint">Các buổi đang nhận đăng ký đoàn</p></div>
      <div><dt><ClipboardList size={16} aria-hidden="true" />Đăng ký của tôi</dt><dd className="num">{registrations.data.pagination.totalItems}</dd><p className="rep-hint">Tất cả hồ sơ đăng ký của bạn</p></div>
      <div><dt><Hourglass size={16} aria-hidden="true" />Chờ duyệt</dt><dd className="num">{pending.data.pagination.totalItems}</dd><p className="rep-hint">Đang chờ nhà trường xét duyệt</p></div>
    </dl>
    <RepHero next={next} loading={upcoming.isPending} error={upcoming.error ? readRepError(upcoming.error).message : undefined} onRetry={() => void upcoming.refetch()} />
    <div className="rep-overview-grid">
      <RepSection className="rep-card" title="Hoạt động gần đây" action={<Link to="/dai-dien/dang-ky" className="rep-text-link">Đăng ký của tôi</Link>}>
        {recent.length ? <div className="rep-reg-list">{recent.map(registration => <RegistrationCard key={registration.id} registration={registration} />)}</div>
          : <EmptyState title="Bạn chưa có đăng ký nào" description="Chọn một buổi tham quan để đăng ký." />}
      </RepSection>
      <RepSection className="rep-card" title="Buổi đang nhận đăng ký" action={<Link to="/dai-dien/buoi" className="rep-text-link">Xem tất cả buổi</Link>}>
        {tours.data.data.length ? <div className="rep-tour-list">{tours.data.data.map(tour => <TourCard key={tour.id} tour={tour} compact />)}</div>
          : <EmptyState title="Chưa có buổi nhận đăng ký" description="Quay lại khi trường có lịch tham quan mới." />}
      </RepSection>
    </div>
  </RepPage>
}
