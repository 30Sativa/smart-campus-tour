import { Link, useParams } from 'react-router'
import { useRepTour, useRepRegistrations } from '../../features/representative/representative-hooks'
import { RepPage, RepPageHeader, Panel, InfoList, GatedAction, TourStateBadge, ErrorState, PageSkeleton, RegistrationStatusBadge, Callout } from '../../features/representative/components/RepUi'
import { RouteMap } from '../../features/representative/components/RouteMap'
import { formatDateTime, groupLabel, readRepError } from '../../features/representative/rep-format'
import { repButton } from '../../features/representative/rep-classes'
import { registrationClosesAt } from '../../features/representative/registration-deadline'

export default function RepTourDetailPage() {
  const { tourId = '' } = useParams()
  const query = useRepTour(tourId)
  const registrations = useRepRegistrations({ tourId, size: 1 })
  if (query.isPending) return <PageSkeleton />
  if (query.error || !query.data) return <RepPage><ErrorState title="Không xem được Tour" message={readRepError(query.error).message}
    onRetry={() => void query.refetch()} back={{ to: '/dai-dien/buoi', label: 'Danh sách buổi' }} /></RepPage>
  const tour = query.data
  const existing = registrations.data?.data.find(registration => registration.tourId === tourId)
  const noRegistration = registrations.isSuccess && registrations.data.pagination.totalItems === 0

  return <RepPage>
    <RepPageHeader back={{ to: '/dai-dien/buoi', label: 'Các buổi tham quan' }} title={tour.name}
      description={tour.description} badges={<TourStateBadge state={tour.state} />} />
    {tour.state === 'CANCELLED' && <Callout tone="warn" title="Buổi tham quan đã bị hủy" role="status">
      <p>{tour.cancelReason?.trim() || 'Nhà trường chưa cung cấp lý do hủy.'}</p>
    </Callout>}
    <div className="rep-detail">
      <div className="rep-stack">
        <Panel title="Lịch tham quan">
          <InfoList items={[
            { label: 'Thời gian dự kiến', value: formatDateTime(tour.scheduledStartAt) },
            { label: 'Hạn đăng ký', value: formatDateTime(registrationClosesAt(tour.scheduledStartAt).toISOString()) },
            { label: 'Tuyến tham quan', value: tour.routeName },
            ...(tour.capacity != null && tour.remainingSeats != null ? [{ label: 'Chỗ', value: `Còn ${tour.remainingSeats}/${tour.capacity} chỗ` }] : []),
          ]} />
        </Panel>
        <RouteMap tour={tour} />
      </div>
      <aside className="rep-aside" aria-labelledby="rep-tour-registration">
        <h2 id="rep-tour-registration">Đăng ký của bạn</h2>
        {registrations.isPending ? <p className="rep-hint" role="status" aria-busy="true">Đang kiểm tra đăng ký của bạn…</p>
          : registrations.error ? <ErrorState title="Không kiểm tra được đăng ký" message={readRepError(registrations.error).message} onRetry={() => void registrations.refetch()} />
            : existing ? <div className="rep-stack">
              <h3>{groupLabel(existing) ?? existing.schoolName}</h3>
              <RegistrationStatusBadge state={existing.state} />
              <p className="rep-hint">Bạn đã có đăng ký cho buổi tham quan này. Mở hồ sơ để xem thông tin và các thao tác hiện còn cho phép.</p>
              <Link to={`/dai-dien/dang-ky/${existing.id}`} className={repButton('primary')}>Xem đăng ký</Link>
            </div>
              : noRegistration ? <div className="rep-stack">
                <p className="rep-hint">Bạn chưa đăng ký buổi tham quan này.</p>
                <GatedAction gate={tour.register} label="Đăng ký đoàn" kind="primary" to={`/dai-dien/buoi/${tour.id}/dang-ky`} />
              </div>
                : <ErrorState title="Chưa xác định được đăng ký" message="Không thể xác nhận đăng ký hiện có. Tải lại trước khi tiếp tục." onRetry={() => void registrations.refetch()} />}
        <p className="rep-hint">Mỗi đại diện có một đăng ký cho mỗi buổi, tối đa 10 điểm xem. Cá nhân dùng email riêng; điểm xem chung dùng email người phụ trách.</p>
        <Link to={`/dai-dien/dang-ky?tourId=${tour.id}`} className="rep-text-link">Tra cứu đăng ký của buổi này</Link>
      </aside>
    </div>
  </RepPage>
}
