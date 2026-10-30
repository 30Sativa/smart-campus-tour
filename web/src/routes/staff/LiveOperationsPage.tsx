import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import type { AmrStatus, RouteStop } from '../../api/contracts/staff'
import { useStaffAmrs, useTour, useTours } from '../../features/staff/staff-hooks'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { Field, LoadingPanel, PageHeader } from '../../components/ui/ConsolePrimitives'
import { buttonClass, cardClass } from '../../components/ui/ui-classes'
import { eventTypeLabel, HEAD_LABEL, statusLabel } from '../../features/staff/status'
import { REASON_SHORT } from '../../features/staff/reason'
import { formatTime } from '../../features/staff/formatters'
import { groupSummary, routeProgress } from '../../features/staff/attention'
import { useNow } from '../../features/staff/use-now'
import { OperationalTwin } from '../../features/staff/components/OperationalTwin'
import { TourTimeline } from '../../features/staff/components/TourTimeline'
import { OperationControls } from '../../features/staff/components/OperationControls'
import { LiveStatusStrip } from '../../features/staff/components/LiveStatusStrip'
import { TourStateBadges } from '../../features/staff/components/TourParts'

/**
 * Live Operations: Staff Dashboard/Twin for the running Tour.
 *
 * Layout (laptop and up):
 *   header   - code, name, state badges, link to the full record
 *   alert    - only while the Tour needs assistance
 *   ┌────────────────────────────┬──────────────┐
 *   │ Digital Twin 3D (~2/3)     │ Controls     │  sticky side column:
 *   │                            │ Telemetry    │  the buttons stay in reach
 *   ├────────────────────────────┤ (branch      │  while the map keeps the
 *   │ Route · Log (tabs)         │  requests)   │  width
 *   └────────────────────────────┴──────────────┘
 * Phones and tablets: twin, controls, telemetry, then route and log.
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
        <OperationalTwin robots={robots.data ?? []} className="h-[clamp(380px,64vh,780px)] shadow-[0_10px_28px_-16px_rgba(23,59,89,0.3)]" />
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
    <StaffPage wide className="!py-4 lg:!py-6">
      {/* One line: which session, its state, and the way to its full record. */}
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="min-w-0 text-[20px] leading-tight font-bold tracking-[-0.025em] text-[#173b59]">
          <span className="text-[#2d719e]">{tour.code}</span> {tour.name}
        </h1>
        <TourStateBadges tour={tour} />
        <p className="min-w-0 flex-1 basis-64 truncate text-[12.5px] text-[#64748b]">
          {tour.routeName}, {groups.groups} đoàn, {groups.students} học sinh đang xem
        </p>
        <Link to={`/staff/tours/${tour.id}`} className={buttonClass('secondary', 'sm')}>Chi tiết & nhật ký</Link>
      </header>

      {tour.state !== 'Running' && (
        <div role="status" className={`${cardClass} mb-4 px-4 py-2.5 text-[13px] text-[#475569]`}>
          Buổi đã {statusLabel(tour.state).toLowerCase()}{tour.endReason ? `: ${tour.endReason}` : ''}. Live và AI của học sinh đã đóng.
        </div>
      )}
      {assist && (
        <div role="alert" className="mb-4 flex items-center gap-3 rounded-2xl border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 shadow-[0_10px_24px_-16px_rgba(220,38,38,0.5)]">
          <ShieldAlert size={18} className="shrink-0 text-[#dc2626]" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[13px] text-[#334155]">
            <strong className="font-bold text-[#dc2626]">Cần hỗ trợ · {tour.reason ? REASON_SHORT[tour.reason] ?? tour.reason : ''}.</strong>{' '}
            {tour.reasonDetail} Lịch tự chuyển bước đã tạm dừng; chọn thao tác phục hồi ở bảng điều khiển.
          </p>
        </div>
      )}

      <div className="grid items-start gap-4 min-[1440px]:grid-cols-[minmax(0,1fr)_340px] min-[1800px]:grid-cols-[minmax(0,1fr)_380px]">
        {/* 1. Digital Twin: the largest area, the reason this page exists. */}
        <div className="min-w-0 min-[1440px]:col-start-1 min-[1440px]:row-start-1">
          <OperationalTwin
            robots={robots}
            tour={tour}
            selectedStopId={selectedStopId}
            title={`Digital Twin · ${tour.code}`}
            className="h-[clamp(340px,55vh,720px)] min-[1440px]:h-[clamp(440px,64vh,820px)] shadow-[0_10px_28px_-16px_rgba(23,59,89,0.3)]"
          />
        </div>

        {/* 2. Side column, sticky on wide screens: controls first (closest to reach), then telemetry. */}
        <aside className="flex min-w-0 flex-col gap-4 min-[1440px]:sticky min-[1440px]:top-20 min-[1440px]:col-start-2 min-[1440px]:row-span-2 min-[1440px]:row-start-1" aria-label="Điều khiển và thông số">
          <section className={`${cardClass} p-4`} aria-label="Điều khiển">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#0f172a]">Điều khiển vận hành</h2>
              <span className="font-mono text-xs text-[#64748b]">{done}/{total} POI · rev {tour.revision}</span>
            </div>
            <OperationControls tour={tour} />
          </section>
          <LiveStatusStrip tour={tour} robot={robot} now={now} variant="panel" />
          {/* Branch requests go here as one more card once the backend exposes BranchRequests. */}
        </aside>

        {/* 3. Route and log, under the twin so they never cover it. */}
        <section className={`${cardClass} min-w-0 overflow-hidden min-[1440px]:col-start-1 min-[1440px]:row-start-2`} aria-label="Lộ trình và nhật ký">
          <div role="tablist" aria-label="Lộ trình và nhật ký" className="flex items-center gap-1 border-b border-[#eef2f6] bg-[#fafbfc] px-3">
            {([['route', `Lộ trình · ${done}/${total} POI`], ['log', `Nhật ký · ${tour.events.length}`]] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" id={`live-tab-${key}`} aria-selected={tab === key} aria-controls={`live-panel-${key}`} onClick={() => setTab(key)}
                className={`-mb-px min-h-11 border-b-2 px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${tab === key ? 'border-[#2d719e] text-[#173b59]' : 'border-transparent text-[#64748b] hover:text-[#0f172a]'}`}>
                {label}
              </button>
            ))}
            <Link to={`/staff/tours/${tour.id}`} className={`${buttonClass('ghost', 'sm')} ml-auto`}>Toàn bộ</Link>
          </div>
          {tab === 'route' ? (
            <div role="tabpanel" id="live-panel-route" aria-labelledby="live-tab-route" className="grid max-h-[380px] gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <TourTimeline tour={tour} selectedId={selectedStopId} onSelect={select} />
              {selectedStop ? <StopDetail stop={selectedStop} /> : <p className="self-start rounded-xl bg-[#f8fafc] p-4 text-[13px] text-[#64748b]">Chọn một POI trong lộ trình để xem thời gian dừng, góc quan sát và giờ tới; bản đồ sẽ đánh dấu POI đó.</p>}
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
