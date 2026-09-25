import { ArrowLeft, Clock, MapPin, Users } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useTour } from '../../features/staff/staff-hooks'
import { ErrorPanel, Field, LoadingPanel, PageHeader, PanelHead, panelClass, StaffPage } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { groupSummary, tourAction } from '../../features/staff/attention'
import { eventTypeLabel } from '../../features/staff/status'
import { formatDate, formatDuration, formatTime } from '../../features/staff/formatters'
import { TourTimeline } from '../../features/staff/components/TourTimeline'
import { RegistrationList, TourStateBadges } from '../../features/staff/components/TourParts'

const ACCENT_EVENTS = new Set([
  'AssistanceRequired',
  'LegFailed',
  'CommandFailed',
  'StreamLost',
  'TourEndedEarly',
  'TourCancelled',
])

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
                <span className="font-mono text-xs font-bold text-[#4d6410] bg-[#f2f7e4] px-2 py-0.5 rounded">
                  {tour.code}
                </span>
              </Field>
              <Field label="Tuyến">
                <span className="flex items-center gap-1">
                  <MapPin size={13} className="text-[#6b6e75]" />
                  {tour.routeName} ({tour.stops.length} POI)
                </span>
              </Field>
              <Field label="Ngôn ngữ">{tour.language}</Field>
              <Field label="Giờ dự kiến">
                <span className="flex items-center gap-1 font-mono font-bold">
                  <Clock size={13} className="text-[#6b6e75]" />
                  {formatTime(tour.scheduledAt)}
                </span>
              </Field>
              <Field label="Bắt đầu">{tour.startedAt ? formatTime(tour.startedAt) : '-'}</Field>
              <Field label="Kết thúc">{tour.endedAt ? formatTime(tour.endedAt) : '-'}</Field>
              <Field label="Thời lượng">
                {tour.startedAt && tour.endedAt ? formatDuration(tour.startedAt, tour.endedAt) : '-'}
              </Field>
              <Field label="Robot phục vụ">
                <span className="font-mono font-bold text-[#1c1c1c]">
                  {tour.robotName ?? <span className="font-sans text-xs text-[#8e9096]">Nhận khi bắt đầu</span>}
                </span>
              </Field>
              <Field label="Đoàn / Học sinh">
                <span className="flex items-center gap-1">
                  <Users size={13} className="text-[#6b6e75]" />
                  {groups.groups} đoàn ({groups.students} học sinh)
                </span>
              </Field>
            </dl>
            {tour.endReason && (
              <p
                className={`mx-5 mb-5 rounded-xl px-4 py-2.5 text-xs font-semibold ${
                  tour.state === 'Completed' ? 'bg-[#f2f7e4] text-[#5f7a12] border border-[#d5e8a6]' : 'bg-[#fffbeb] text-[#d97706] border border-[#fde68a]'
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
            {tour.events.length === 0 ? (
              <p className="p-5 text-xs text-[#8e9096]">Chưa có mốc nào được ghi nhận.</p>
            ) : (
              <ol className="space-y-3.5 p-5">
                {tour.events.map((event) => (
                  <li key={event.id} className="flex gap-4 text-xs">
                    <span className="w-12 shrink-0 pt-0.5 text-right font-mono font-bold text-[#6b6e75] tabular-nums">
                      {formatTime(event.occurredAt)}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${
                        ACCENT_EVENTS.has(event.type)
                          ? 'bg-[#dc2626]'
                          : event.actor
                          ? 'bg-[#1c1c1c]'
                          : 'bg-[#1c1c1c]'
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`font-bold ${
                          ACCENT_EVENTS.has(event.type) ? 'text-[#dc2626]' : 'text-[#1c1c1c]'
                        }`}
                      >
                        {eventTypeLabel(event.type)}
                      </span>
                      {event.detail && <span className="block text-[#6b6e75] mt-0.5">{event.detail}</span>}
                      {event.actor && (
                        <span className="block text-[11px] text-[#8e9096] mt-0.5">Thực hiện bởi: {event.actor}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
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
