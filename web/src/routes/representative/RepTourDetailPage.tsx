import { Link, useParams } from 'react-router'
import { useRepTour, useRepRegistrations } from '../../features/representative/representative-hooks'
import { RepPage, RepPageHeader, Panel, InfoList, GatedAction, TourStateBadge, ErrorState, PageSkeleton } from '../../features/representative/components/RepUi'
import { RegistrationCard } from '../../features/representative/components/RegistrationCard'
import { formatDateTime, readRepError } from '../../features/representative/rep-format'

export default function RepTourDetailPage() {
  const { tourId = '' } = useParams()
  const query = useRepTour(tourId)
  const registrations = useRepRegistrations({ tourId, size: 5 })
  if (query.isPending) return <PageSkeleton />
  if (!query.data) return <RepPage><ErrorState title="Không xem được Tour" message={readRepError(query.error).message} back={{ to: '/dai-dien/buoi', label: 'Danh sách buổi' }} /></RepPage>
  const tour = query.data
  return <RepPage>
    <RepPageHeader back={{ to: '/dai-dien/buoi', label: 'Các buổi tham quan' }} title={tour.name} description={tour.description}
      badges={<TourStateBadge state={tour.state} />} action={<GatedAction gate={tour.register} label="Đăng ký đoàn" kind="primary" to={`/dai-dien/buoi/${tour.id}/dang-ky`} />} />
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]"><Panel title="Thông tin buổi">
      <InfoList items={[{ label: 'Thời gian dự kiến', value: formatDateTime(tour.scheduledStartAt) }, { label: 'Tuyến tham quan', value: tour.routeName }]} />
      <ol className="mt-6 space-y-4">{tour.stops.map(stop => <li key={stop.order}><b>{stop.order}. {stop.name}</b>{stop.description && <p className="text-sm text-slate-500">{stop.description}</p>}</li>)}</ol>
    </Panel><Panel title="Đăng ký đoàn">
      <p className="text-sm text-slate-600">Mỗi đoàn có tên và danh sách lời mời riêng. Cá nhân dùng email của mình; điểm xem chung dùng email người phụ trách.</p>
    </Panel></div>
    <Panel className="mt-6" title="Đoàn của tôi trong buổi này" action={<Link to={`/dai-dien/dang-ky?tourId=${tour.id}`}>Xem tất cả ({registrations.data?.pagination.totalItems ?? '-'})</Link>}>
      {registrations.error ? <ErrorState title="Không tải được đăng ký" message={readRepError(registrations.error).message} onRetry={() => void registrations.refetch()} />
        : <div className="space-y-3">{registrations.data?.data.map(r => <RegistrationCard key={r.id} registration={r} />)}</div>}
      {registrations.data?.pagination.totalItems === 0 && <p className="text-sm text-slate-500">Bạn chưa đăng ký đoàn nào trong buổi này.</p>}
    </Panel>
  </RepPage>
}
