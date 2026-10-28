import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import type { AmrStatus, RouteStop } from '../../api/contracts/staff'
import { useStaffAmrs, useTour, useTours } from '../../features/staff/staff-hooks'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { Field, LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { eventTypeLabel, HEAD_LABEL, statusLabel } from '../../features/staff/status'
import { REASON_SHORT } from '../../features/staff/reason'
import { formatTime } from '../../features/staff/formatters'
import { groupSummary, routeProgress } from '../../features/staff/attention'
import { useNow } from '../../features/staff/use-now'
import { OperationalTwin } from '../../features/staff/components/OperationalTwin'
import { RouteSchematic } from '../../features/staff/components/RouteSchematic'
import { TourTimeline } from '../../features/staff/components/TourTimeline'
import { OperationControls } from '../../features/staff/components/OperationControls'
import { LiveStatusStrip } from '../../features/staff/components/LiveStatusStrip'
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
  const [tab, setTab] = useState<'route' | 'log'>('route')

  if (detail.isPending) return <StaffPage wide><LoadingPanel /></StaffPage>
  if (detail.isError) return <StaffPage wide><ErrorPanel error={detail.error} onRetry={detail.refetch} /></StaffPage>

  const tour = detail.data
  const robot = robots.find((item) => item.id === tour.robotId)
  const selectedStop = tour.stops.find((stop) => stop.id === selectedStopId) ?? null
  const groups = groupSummary(tour)
  const assist = tour.operationalStatus === 'NeedsAssistance'
  const { done, total } = routeProgress(tour)
  const select = (id: string) => {
    setSelectedStopId((value) => (value === id ? null : id))
    setTab('route')
  }
  const events = [...tour.events].reverse().slice(0, 14)

  return (
    <StaffPage wide className="!py-5 lg:!py-6">
      {/* One line: which session, its state, and the way to its full record. */}
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="min-w-0 text-[21px] leading-tight font-bold tracking-[-0.025em] text-[#173b59]">
          <span className="text-[#2d719e]">{tour.code}</span> {tour.name}
        </h1>
        <TourStateBadges tour={tour} />
        <p className="min-w-0 flex-1 basis-64 truncate text-[12.5px] text-[#64748b]">
          {tour.routeName}, {groups.groups} đoàn, {groups.students} học sinh đang xem
        </p>
        <Link to={`/staff/tours/${tour.id}`} className={buttonClass('secondary', 'sm')}>Chi tiết & nhật ký</Link>
      </header>

      {tour.state !== 'Running' && (
        <div role="status" className="mb-3 rounded-xl border border-[#e2e8f0] bg-white px-4 py-2.5 text-[13px] text-[#475569]">
          Buổi đã {statusLabel(tour.state).toLowerCase()}{tour.endReason ? `: ${tour.endReason}` : ''}. Live và AI của học sinh đã đóng.
        </div>
      )}
      {assist && (
        <div role="alert" className="mb-3 flex items-center gap-3 rounded-xl border border-[#fca5a5] bg-[#fef2f2] px-4 py-2.5">
          <ShieldAlert size={18} className="shrink-0 text-[#dc2626]" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[13px] text-[#334155]">
            <strong className="font-bold text-[#dc2626]">Cần hỗ trợ · {tour.reason ? REASON_SHORT[tour.reason] ?? tour.reason : ''}.</strong>{' '}
            {tour.reasonDetail} Lịch tự chuyển bước đã tạm dừng; chọn thao tác phục hồi ở bảng điều khiển bên phải.
          </p>
        </div>
      )}

      <LiveStatusStrip tour={tour} robot={robot} now={now} />

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Controls first in reading order on small screens, a sticky column on wide ones. */}
        <section className={`${panelClass} lg:sticky lg:top-3 lg:col-start-2 lg:row-span-2 lg:row-start-1`} aria-label="Điều khiển">
          <PanelHead title="Điều khiển vận hành" action={<span className="font-mono text-xs text-[#64748b]">{done}/{total} POI · rev {tour.revision}</span>} />
          <div className="p-4">
            <OperationControls tour={tour} />
          </div>
        </section>

        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <RouteSchematic tour={tour} robot={robot} selectedStopId={selectedStopId} onSelect={select} compact />
        </div>

        <section className={`${panelClass} min-w-0 lg:col-start-1 lg:row-start-2`} aria-label="Lộ trình và nhật ký">
          <div role="tablist" aria-label="Lộ trình và nhật ký" className="flex items-center gap-1 border-b border-[#f1f5f9] px-3">
            {([['route', `Lộ trình · ${done}/${total} POI`], ['log', `Nhật ký · ${tour.events.length}`]] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" id={`live-tab-${key}`} aria-selected={tab === key} aria-controls={`live-panel-${key}`} onClick={() => setTab(key)}
                className={`-mb-px min-h-10 border-b-2 px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${tab === key ? 'border-[#2d719e] text-[#173b59]' : 'border-transparent text-[#64748b] hover:text-[#0f172a]'}`}>
                {label}
              </button>
            ))}
            <Link to={`/staff/tours/${tour.id}`} className={`${buttonClass('ghost', 'sm')} ml-auto`}>Toàn bộ</Link>
          </div>
          {tab === 'route' ? (
            <div role="tabpanel" id="live-panel-route" aria-labelledby="live-tab-route" className="grid max-h-[380px] gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <TourTimeline tour={tour} selectedId={selectedStopId} onSelect={select} />
              {selectedStop ? <StopDetail stop={selectedStop} /> : <p className="self-start rounded-xl bg-[#f8fafc] p-4 text-[13px] text-[#64748b]">Chọn một POI trên sơ đồ hoặc trong lộ trình để xem thời gian dừng, góc quan sát và giờ tới.</p>}
            </div>
          ) : (
            <ol role="tabpanel" id="live-panel-log" aria-labelledby="live-tab-log" className="max-h-[380px] space-y-1.5 overflow-y-auto p-3">
              {events.map((event) => {
                const bad = event.type === 'AssistanceRequired' || event.type.endsWith('Failed')
                return (
                  <li key={event.id} className={`flex gap-3 rounded-lg px-3 py-2 text-xs ${bad ? 'border border-[#fecaca] bg-[#fef2f2]' : 'bg-[#f8fafc]'}`}>
                    <span className="w-11 shrink-0 font-mono font-bold text-[#64748b] tabular-nums">{formatTime(event.occurredAt)}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`font-bold ${bad ? 'text-[#dc2626]' : 'text-[#0f172a]'}`}>{eventTypeLabel(event.type)}</span>
                      {event.detail && <span className="ml-1.5 text-[#64748b]">{event.detail}</span>}
                    </span>
                  </li>
                )
              })}
              {events.length === 0 && <li className="px-3 py-2 text-[13px] text-[#64748b]">Chưa có sự kiện.</li>}
            </ol>
          )}
        </section>
      </div>
    </StaffPage>
  )
}

function StopDetail({ stop }: { stop: RouteStop }) {
  return (
    <div className="self-start rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4 transition-opacity duration-200 starting:opacity-0">
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
