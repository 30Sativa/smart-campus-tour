import { Link } from 'react-router'
import { useRepRegistrations, useRepTours } from '../../features/representative/representative-hooks'
import { RepPage, RepPageHeader, Panel, ErrorState, EmptyState, PageSkeleton } from '../../features/representative/components/RepUi'
import { TourCard } from '../../features/representative/components/TourCard'
import { RegistrationCard } from '../../features/representative/components/RegistrationCard'
import { readRepError } from '../../features/representative/rep-format'
import { buttonClass } from '../../components/ui/ui-classes'

export default function RepDashboardPage() {
  const tours = useRepTours({ size: 3 })
  const registrations = useRepRegistrations({ size: 5 })
  const pending = useRepRegistrations({ state: 'SUBMITTED', size: 1 })
  if (tours.isPending || registrations.isPending || pending.isPending) return <PageSkeleton />
  const error = tours.error ?? registrations.error ?? pending.error
  if (error) return <RepPage><ErrorState title="Không tải được tổng quan" message={readRepError(error).message} onRetry={() => { void tours.refetch(); void registrations.refetch(); void pending.refetch() }} /></RepPage>
  return <RepPage>
    <RepPageHeader title="Tổng quan đại diện" description="Chuẩn bị đoàn, gửi danh sách lời mời và theo dõi đăng ký của bạn."
      action={<Link className={buttonClass('primary')} to="/dai-dien/buoi">Xem buổi tham quan</Link>} />
    <div className="rep-catalog-metrics">
      <div className="rep-catalog-metric"><span>Buổi nhận đăng ký</span><strong>{tours.data?.pagination.totalItems}</strong></div>
      <div className="rep-catalog-metric"><span>Đăng ký của tôi</span><strong>{registrations.data?.pagination.totalItems}</strong></div>
      <div className="rep-catalog-metric"><span>Chờ duyệt</span><strong>{pending.data?.pagination.totalItems}</strong></div>
    </div>
    <Panel title="Buổi đang nhận đăng ký" className="mt-6" action={<Link to="/dai-dien/buoi">Xem tất cả</Link>}>
      {tours.data?.data.length ? <div className="grid gap-5 md:grid-cols-3">{tours.data.data.map((tour, index) => <TourCard key={tour.id} tour={tour} compact visualIndex={index} />)}</div>
        : <EmptyState title="Chưa có buổi nhận đăng ký" />}
    </Panel>
    <Panel title="Hoạt động gần đây" className="mt-6" action={<Link to="/dai-dien/dang-ky">Đăng ký của tôi</Link>}>
      <div className="space-y-3">{registrations.data?.data.map(r => <RegistrationCard key={r.id} registration={r} />)}</div>
      {!registrations.data?.data.length && <EmptyState title="Bạn chưa có đăng ký nào" />}
    </Panel>
  </RepPage>
}
