import { ArrowLeft, Clock, MapPin, Users } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useTour } from '../../features/staff/staff-hooks'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { Field, LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { groupSummary, tourAction } from '../../features/staff/attention'
import { formatDate, formatDuration, formatTime } from '../../features/staff/formatters'
import { TourTimeline } from '../../features/staff/components/TourTimeline'
import { TourEventLog } from '../../features/staff/components/TourEventLog'
import { RegistrationList, TourStateBadges } from '../../features/staff/components/TourParts'

/**
 * Session detail & log: the session, its groups, the route and how far it got,
 * and every logged step with reason.
 */
export default function TourDetailPage() {
  const { tourId = '' } = useParams()
  const detail = useTour(tourId)

  if (detail.isPending) return <StaffPage><LoadingPanel /></StaffPage>
  if (detail.isError) return <StaffPage><ErrorPanel error={detail.error} onRetry={detail.refetch} /></StaffPage>

  const tour = detail.data
  const action = tourAction(tour)
  const groups = groupSummary(tour)
  const interventions = tour.events.filter((event) => event.actor && event.actor !== 'Admin').length

  return (
    <StaffPage>
      <Link to="/staff/tours" className={`${buttonClass('ghost', 'sm')} mb-3 -ml-2`}>
        <ArrowLeft size={15} aria-hidden="true" />
        Buổi hôm nay
      </Link>
      <PageHeader
        eyebrow={`Chi tiết & nhật ký · ${tour.code}`}
        title={tour.name}
        description={`${formatDate(tour.scheduledAt)} · ${formatTime(tour.scheduledAt)} · ${tour.routeName}`}
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <TourStateBadges tour={tour} size="md" />
            {action.to !== `/staff/tours/${tour.id}` && (
              <Link to={action.to} className={buttonClass(action.kind === 'primary' ? 'primary' : 'secondary', 'md')}>
                {action.label}
              </Link>
            )}
          </div>
        }
      />

      {tour.state === 'Scheduled' && tour.readyBlockers.length > 0 && (
        <div className="mb-5 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4 text-xs font-medium text-[#b45309] flex items-center gap-2 shadow-xs">
          <strong className="font-bold">Chưa sẵn sàng:</strong>
          <span>{tour.readyBlockers.join(' · ')}. Admin chốt buổi khi đủ điều kiện.</span>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
        <div className="space-y-5">
          {/* Card: Thông tin buổi */}
          <section className={panelClass} aria-label="Thông tin buổi">
            <PanelHead title="Thông tin buổi tham quan" />
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 p-5 sm:grid-cols-3">
              <Field label="Mã buổi">
                <span className="font-mono text-xs font-bold text-[#2563eb] bg-[#eff6ff] px-2 py-0.5 rounded">
                  {tour.code}
                </span>
              </Field>
              <Field label="Tuyến">
                <span className="flex items-center gap-1">
                  <MapPin size={13} className="text-[#64748b]" />
                  {tour.routeName} ({tour.stops.length} POI)
                </span>
              </Field>
              <Field label="Ngôn ngữ">{tour.language}</Field>
              <Field label="Giờ dự kiến">
                <span className="flex items-center gap-1 font-mono font-bold">
                  <Clock size={13} className="text-[#64748b]" />
                  {formatTime(tour.scheduledAt)}
                </span>
              </Field>
              <Field label="Bắt đầu">{tour.startedAt ? formatTime(tour.startedAt) : '-'}</Field>
              <Field label="Kết thúc">{tour.endedAt ? formatTime(tour.endedAt) : '-'}</Field>
              <Field label="Thời lượng">
                {tour.startedAt && tour.endedAt ? formatDuration(tour.startedAt, tour.endedAt) : '-'}
              </Field>
              <Field label="Robot phục vụ">
                <span className="font-mono font-bold text-[#0f172a]">
                  {tour.robotName ?? <span className="font-sans text-xs text-[#94a3b8]">Nhận khi bắt đầu</span>}
                </span>
              </Field>
              <Field label="Đoàn / Học sinh">
                <span className="flex items-center gap-1">
                  <Users size={13} className="text-[#64748b]" />
                  {groups.groups} đoàn ({groups.students} học sinh)
                </span>
              </Field>
            </dl>
            {tour.endReason && (
              <p
                className={`mx-5 mb-5 rounded-xl px-4 py-2.5 text-xs font-semibold ${
                  tour.state === 'Completed' ? 'bg-[#ecfdf5] text-[#16a34a] border border-[#a7f3d0]' : 'bg-[#fffbeb] text-[#d97706] border border-[#fde68a]'
                }`}
              >
                Lý do kết thúc: {tour.endReason}
              </p>
            )}
          </section>

          {/* Card: Nhật ký phiên */}
          <section className={panelClass} aria-label="Nhật ký phiên">
            <PanelHead
              title="Nhật ký phiên"
              description={`${tour.events.length} mốc · ${interventions} thao tác của nhân viên`}
            />
            <TourEventLog events={tour.events} />
          </section>
        </div>

        <aside className="space-y-5">
          <section className={panelClass} aria-label="Lộ trình">
            <PanelHead title="Lộ trình & tiến độ" />
            <div className="p-5">
              <TourTimeline tour={tour} />
            </div>
          </section>
          <section className={panelClass} aria-label="Đoàn đăng ký">
            <PanelHead title="Đoàn đăng ký" description="Admin duyệt và gửi thông tin tham gia; Staff theo dõi." />
            <div className="p-5">
              <RegistrationList registrations={tour.registrations} />
            </div>
          </section>
        </aside>
      </div>
    </StaffPage>
  )
}
