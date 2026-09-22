import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import type { AmrStatus, RouteStop } from '../../api/contracts/staff'
import { useStaffAmrs, useTour, useTours } from '../../features/staff/staff-hooks'
import { ErrorPanel, Field, LoadingPanel, PageHeader, PanelHead, panelClass, StaffPage } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { eventTypeLabel, HEAD_LABEL, statusLabel } from '../../features/staff/status'
import { REASON_SHORT } from '../../features/staff/reason'
import { formatTime } from '../../features/staff/formatters'
import { groupSummary, routeProgress } from '../../features/staff/attention'
import { useNow } from '../../features/staff/use-now'
import { OperationalTwin } from '../../features/staff/components/OperationalTwin'
import { TourTimeline } from '../../features/staff/components/TourTimeline'
import { OperationControls } from '../../features/staff/components/OperationControls'
import { RunStatus } from '../../features/staff/components/RunStatus'
import { TourStateBadges } from '../../features/staff/components/TourParts'

/**
 * Live Operations: Staff Dashboard/Twin for the running Tour.
 */
export default function LiveOperationsPage() {
  const { tourId } = useParams()
  const tours = useTours()
  const robots = useStaffAmrs()

  if (tours.isPending) return <StaffPage wide><LoadingPanel /></StaffPage>
  if (tours.isError) return <StaffPage wide><ErrorPanel error={tours.error} onRetry={tours.refetch} /></StaffPage>

  const running = tours.data.filter((tour) => tour.state === 'Running')
  if (!tourId) {
    if (running.length > 0) return <Navigate to={`/staff/live/${running[0].id}`} replace />
    const next = tours.data.find((tour) => tour.state === 'Ready')
    return (
      <StaffPage wide>
        <PageHeader
          eyebrow="Điều hành"
          title="Điều hành trực tiếp"
          description={
            next
              ? `Không có buổi nào đang chạy. Buổi kế tiếp: ${next.code} lúc ${formatTime(next.scheduledAt)}.`
              : 'Không có buổi nào đang chạy hoặc sẵn sàng.'
          }
          action={
            next ? (
              <Link to={`/staff/tours/${next.id}/start`} className={buttonClass('primary')}>
                Kiểm tra & bắt đầu {next.code}
              </Link>
            ) : (
              <Link to="/staff/tours" className={buttonClass('secondary')}>
                Buổi hôm nay
              </Link>
            )
          }
        />
        <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-xs">
          <OperationalTwin robots={robots.data ?? []} className="h-[clamp(380px,62vh,720px)]" />
        </div>
      </StaffPage>
    )
  }

  return <LiveTour tourId={tourId} robots={robots.data ?? []} />
}

function LiveTour({ tourId, robots }: { tourId: string; robots: AmrStatus[] }) {
  const detail = useTour(tourId)
  const now = useNow(1000)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)

  if (detail.isPending) return <StaffPage wide><LoadingPanel /></StaffPage>
  if (detail.isError) return <StaffPage wide><ErrorPanel error={detail.error} onRetry={detail.refetch} /></StaffPage>

  const tour = detail.data
  const robot = robots.find((item) => item.id === tour.robotId)
  const selectedStop = tour.stops.find((stop) => stop.id === selectedStopId) ?? null
  const groups = groupSummary(tour)
  const assist = tour.operationalStatus === 'NeedsAssistance'
  const { done, total } = routeProgress(tour)

  return (
    <StaffPage
      wide
      className="!bg-[#f8fafc] [--ops-radius:1rem] [--ops-border:#e2e8f0] [--ops-shadow:none] [&_h2]:text-sm [&_section>div:first-child]:border-b-0"
    >
      <PageHeader
        eyebrow={`Điều hành trực tiếp · ${tour.code}`}
        title={tour.name}
        description={`${tour.routeName} · ${groups.groups} đoàn, ${groups.students} học sinh đang xem · thuyết minh ${tour.language}`}
        action={
          <div className="flex shrink-0 flex-wrap items-center gap-2 md:max-w-[340px] md:self-center">
            <TourStateBadges tour={tour} />
            <Link to={`/staff/tours/${tour.id}`} className={buttonClass('secondary', 'sm')}>
              Chi tiết & nhật ký
            </Link>
          </div>
        }
      />

      {tour.state !== 'Running' && (
        <div
          role="status"
          className="mb-4 rounded-2xl border border-[#e2e8f0] bg-white px-5 py-3.5 text-sm text-[#475569] shadow-xs"
        >
          Buổi đã {statusLabel(tour.state).toLowerCase()}{tour.endReason ? `: ${tour.endReason}` : ''}. Live và AI của
          học sinh đã đóng.
        </div>
      )}
      {assist && (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-l-4 border-[#fca5a5] border-l-[#dc2626] bg-[#fef2f2] px-5 py-3.5 shadow-xs"
        >
          <ShieldAlert size={20} className="shrink-0 text-[#dc2626]" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-xs sm:text-sm text-[#334155]">
            <strong className="text-[#dc2626] font-bold">
              Cần hỗ trợ · {tour.reason ? REASON_SHORT[tour.reason] ?? tour.reason : ''}.
            </strong>{' '}
            {tour.reasonDetail} Lịch tự chuyển bước đã tạm dừng; chọn thao tác phục hồi ở bảng điều khiển bên dưới.
          </p>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2.08fr)_minmax(280px,1fr)]">
        <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-xs lg:col-start-1 lg:row-start-1">
          <OperationalTwin
            robots={robots}
            tour={tour}
            selectedStopId={selectedStopId}
            className="h-[clamp(390px,45vw,490px)] xl:h-[490px]"
          />
        </div>

        <section className={`${panelClass} lg:col-start-2 lg:row-start-1`} aria-label="Trạng thái phiên">
          <PanelHead
            title="Trạng thái phiên"
            action={
              <span className="font-mono text-xs text-[#64748b] bg-[#f1f5f9] px-2 py-0.5 rounded">
                {done}/{total} POI · rev {tour.revision}
              </span>
            }
          />
          <div className="px-4 pb-4">
            <RunStatus tour={tour} robot={robot} now={now} compact />
          </div>
        </section>

        <div className="grid min-w-0 items-start gap-5 md:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:col-start-1 lg:row-start-2">
          <section className={panelClass} aria-label="Lộ trình">
            <PanelHead
              title="Lộ trình"
              description="Chọn một POI để xem cấu hình và làm nổi trên bản đồ."
              action={<span className="font-mono text-xs font-bold text-[#2563eb]">{done} / {total} POI</span>}
            />
            <div className="px-4 pb-4">
              <TourTimeline
                tour={tour}
                selectedId={selectedStopId}
                onSelect={(id) => setSelectedStopId((value) => (value === id ? null : id))}
              />
              {selectedStop && <StopDetail stop={selectedStop} />}
            </div>
          </section>

          <section className={panelClass} aria-label="Nhật ký gần đây">
            <PanelHead
              title="Nhật ký phiên"
              description="Mới nhất ở trên"
              action={
                <Link to={`/staff/tours/${tour.id}`} className={buttonClass('ghost', 'sm')}>
                  Toàn bộ
                </Link>
              }
            />
            <ol className="max-h-[520px] space-y-2 overflow-y-auto px-4 pb-4">
              {[...tour.events]
                .reverse()
                .slice(0, 14)
                .map((event) => (
                  <li
                    key={event.id}
                    className={`flex gap-3 rounded-xl p-3 text-xs transition-opacity duration-300 starting:opacity-0 ${
                      event.type === 'AssistanceRequired' || event.type.endsWith('Failed')
                        ? 'bg-[#fef2f2] border border-[#fecaca]'
                        : 'bg-[#f8fafc] border border-[#f1f5f9]'
                    }`}
                  >
                    <span className="w-11 shrink-0 font-mono font-bold text-[#64748b] tabular-nums">
                      {formatTime(event.occurredAt)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`font-bold ${
                          event.type === 'AssistanceRequired' || event.type.endsWith('Failed')
                            ? 'text-[#dc2626]'
                            : 'text-[#0f172a]'
                        }`}
                      >
                        {eventTypeLabel(event.type)}
                      </span>
                      {event.detail && <span className="block text-[#64748b] mt-0.5">{event.detail}</span>}
                    </span>
                  </li>
                ))}
            </ol>
          </section>
        </div>

        <section className={`${panelClass} lg:col-start-2 lg:row-start-2`} aria-label="Điều khiển">
          <PanelHead title="Điều khiển vận hành" />
          <div className="px-4 pb-4">
            <OperationControls tour={tour} />
          </div>
        </section>
      </div>
    </StaffPage>
  )
}

function StopDetail({ stop }: { stop: RouteStop }) {
  return (
    <div className="mt-2 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4 transition-opacity duration-200 starting:opacity-0">
      <p className="text-sm font-bold text-[#0f172a]">{stop.name}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Trạng thái">{statusLabel(stop.status)}</Field>
        <Field label="Số lượt dừng">{stop.visits}</Field>
        <Field label="Thời gian dừng">{stop.dwellSeconds} giây</Field>
        <Field label="Góc quan sát">{stop.headSteps.map((preset) => HEAD_LABEL[preset] ?? preset).join(' → ')}</Field>
        <Field label="Tới lúc">{formatTime(stop.arrivedAt)}</Field>
        <Field label="Đóng lượt lúc">{formatTime(stop.closedAt)}</Field>
      </dl>
      <p className="mt-3 text-[11px] text-[#94a3b8]">
        Tuyến, tọa độ và góc quay do nhóm kỹ thuật cấu hình; Staff không đổi từ màn hình này.
      </p>
    </div>
  )
}
