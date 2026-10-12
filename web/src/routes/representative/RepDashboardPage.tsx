import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { useRepRegistrations, useRepTours } from '../../features/representative/representative-hooks'
import { RepPage, RepSection, ErrorState, EmptyState, PageSkeleton } from '../../features/representative/components/RepUi'
import { TourCard } from '../../features/representative/components/TourCard'
import { RegistrationCard } from '../../features/representative/components/RegistrationCard'
import { RepAttention, RepClosing, RepHero } from '../../features/representative/components/DashboardParts'
import { readRepError } from '../../features/representative/rep-format'

export default function RepDashboardPage() {
  const tours = useRepTours({ size: 3 })
  const registrations = useRepRegistrations({ size: 5 })
  const pending = useRepRegistrations({ state: 'SUBMITTED', size: 1 })
  if (tours.isPending || registrations.isPending || pending.isPending) return <PageSkeleton />
  const error = tours.error ?? registrations.error ?? pending.error
  if (error) return <RepPage><ErrorState title="Không tải được tổng quan" message={readRepError(error).message} onRetry={() => { void tours.refetch(); void registrations.refetch(); void pending.refetch() }} /></RepPage>

  const recent = registrations.data?.data ?? []
  // The next visit: the soonest Tour not yet run (scheduled or list locked) with a group that is waiting or approved.
  const next = [...recent]
    .filter((r) => (r.state === 'SUBMITTED' || r.state === 'APPROVED') && (r.tourState === 'SCHEDULED' || r.tourState === 'READY'))
    .sort((a, b) => new Date(a.tourScheduledStartAt).getTime() - new Date(b.tourScheduledStartAt).getTime())[0] ?? null
  const needsFix = recent.find((r) => r.state === 'REJECTED' && r.tourState === 'SCHEDULED') ?? null

  return <>
    <RepPage>
      <RepHero next={next} />
      {needsFix && <RepAttention registration={needsFix} />}
      <div className="rep-stats" style={{ marginTop: 'clamp(40px, 5vw, 64px)' }}>
        <div className="rep-stat"><b className="rep-stat-value num">{tours.data?.pagination.totalItems}</b><span className="rep-stat-label">Buổi nhận đăng ký<small>Các buổi đang nhận đăng ký đoàn</small></span></div>
        <div className="rep-stat"><b className="rep-stat-value num">{registrations.data?.pagination.totalItems}</b><span className="rep-stat-label">Đăng ký của tôi<small>Mọi đoàn bạn đã gửi</small></span></div>
        <div className="rep-stat"><b className="rep-stat-value num">{pending.data?.pagination.totalItems}</b><span className="rep-stat-label">Chờ duyệt<small>Đang đợi Admin xem danh sách</small></span></div>
      </div>
      <RepSection kicker="01 / Buổi tham quan" title="Buổi đang nhận đăng ký" action={<Link to="/dai-dien/buoi" className="rep-text-link">Xem tất cả buổi<ArrowRight size={16} aria-hidden="true" /></Link>}>
        {tours.data?.data.length ? <div className="rep-tour-grid">{tours.data.data.map((tour, index) => <TourCard key={tour.id} tour={tour} compact visualIndex={index} />)}</div>
          : <EmptyState title="Chưa có buổi nhận đăng ký" description="Quay lại khi trường có lịch tham quan mới." />}
      </RepSection>
      <RepSection kicker="02 / Đăng ký" title="Hoạt động gần đây" action={<Link to="/dai-dien/dang-ky" className="rep-text-link">Đăng ký của tôi<ArrowRight size={16} aria-hidden="true" /></Link>}>
        {recent.length ? <div className="rep-reg-list">{recent.map((r) => <RegistrationCard key={r.id} registration={r} />)}</div>
          : <EmptyState title="Bạn chưa có đăng ký nào" description="Chọn một buổi tham quan để đăng ký đoàn đầu tiên." />}
      </RepSection>
    </RepPage>
    <RepClosing />
  </>
}
