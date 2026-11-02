import { useState } from 'react'
import { ArrowRight, Bot, ChevronDown, CircleAlert, Clock, FileText, Flag, MapPin, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import type { AmrStatus, RouteStop, TourEvent } from '../../api/contracts/staff'
import { useStaffAmrs, useTour, useTours } from '../../features/staff/staff-hooks'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { Field, LoadingPanel, PageHeader } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { eventTypeLabel, HEAD_LABEL, statusLabel, stepLabel } from '../../features/staff/status'
import { REASON_SHORT } from '../../features/staff/reason'
import { formatStopwatch, formatTime } from '../../features/staff/formatters'
import { groupSummary, POSE_DISCONNECTED_SECONDS, routeProgress } from '../../features/staff/attention'
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

const card = 'ct-panel min-w-0 rounded-[15px] bg-white shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]'
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2'

function LiveTour({ tourId, robots }: { tourId: string; robots: AmrStatus[] }) {
  const detail = useTour(tourId)
  const now = useNow(1000)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [tab, setTab] = useState<'route' | 'log' | 'stats'>('route')

  if (detail.isPending) return <StaffPage wide><LoadingPanel /></StaffPage>
  if (detail.isError) return <StaffPage wide><ErrorPanel error={detail.error} onRetry={detail.refetch} /></StaffPage>

  const tour = detail.data
  const robot = robots.find((item) => item.id === tour.robotId)
  const selectedStop = tour.stops.find((stop) => stop.id === selectedStopId) ?? null
  const groups = groupSummary(tour)
  const assist = tour.operationalStatus === 'NeedsAssistance'
  const { done, total, current } = routeProgress(tour)
  const progress = tour.progress
  const age = robot?.poseAgeSeconds
  const lost = Boolean(robot) && (robot!.connectionState !== 'Live' || (age ?? 0) > POSE_DISCONNECTED_SECONDS)
  const target = progress?.step === 'ReturningToEnd' ? tour.endPoint.name : current?.name ?? '-'
  const select = (id: string) => {
    setSelectedStopId((value) => (value === id ? null : id))
    setTab('route')
  }
  const events = [...tour.events].reverse()
  const bad = (type: string) => type === 'AssistanceRequired' || type.endsWith('Failed')
  const metrics: Array<[LucideIcon, string, string, boolean?]> = [
    [Bot, 'Robot', tour.robotName ?? robot?.name ?? '-'],
    [Clock, 'Dữ liệu vị trí', !robot ? 'Chưa có dữ liệu' : lost ? 'Mất kết nối' : `${age ?? '-'} giây trước`, lost],
    [MapPin, 'Chặng hiện tại', progress?.legId ?? '-'],
    [FileText, 'Lệnh đang chờ', progress?.pendingCommand?.label ?? 'Không có'],
    [Flag, 'Tiến độ', `${done} / ${total} POI đã qua`],
    [Timer, 'Thời gian chạy', formatStopwatch(tour.startedAt, now)],
  ]
  const tech: Array<[string, string, boolean?]> = [
    ['Nguồn dữ liệu', robot?.source === 'Physical' ? 'Robot thật' : robot?.source === 'Gazebo' ? 'Gazebo' : 'Mô phỏng'],
    ['Phiên bản quan sát', `rev ${tour.revision}`],
    ['Đích chặng', target],
    ['Trạng thái chặng', assist && tour.reason === 'NavigationFailed' ? 'Thất bại' : stepLabel(progress?.step), assist && tour.reason === 'NavigationFailed'],
    ['Lệnh đang chờ', progress?.pendingCommand?.label ?? 'Không có'],
  ]

  return (
    <StaffPage wide className="!py-4 lg:!py-5">
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="min-w-0 text-[22px] leading-tight font-bold text-[#2d3748]">{tour.code} · {tour.name}</h1>
        <TourStateBadges tour={tour} showReason={false} />
        <span className="ml-auto text-sm text-[#718096]">{groups.groups} đoàn đã duyệt · {groups.students} học sinh</span>
        <Link to={`/staff/tours/${tour.id}`} className={buttonClass('secondary', 'sm')}>Chi tiết tour<ArrowRight size={14} aria-hidden="true" /></Link>
      </header>

      <dl aria-label="Trạng thái phiên" className={`${card} mb-4 grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6`}>
        {metrics.map(([Icon, label, value, warn], index) => (
          <div key={label} className={`flex min-w-0 items-center gap-3 px-4 py-3.5 ${index > 0 ? '2xl:border-l 2xl:border-[#e2e8f0]' : ''}`}>
            <Icon size={20} aria-hidden="true" className="shrink-0 text-[#718096]" />
            <div className="min-w-0">
              <dt className="text-xs text-[#718096]">{label}</dt>
              <dd className={`m-0 truncate font-mono text-sm font-semibold tabular-nums ${warn ? 'text-[#c53030]' : 'text-[#2d3748]'}`}>{value}</dd>
            </div>
          </div>
        ))}
      </dl>

      {tour.state !== 'Running' && (
        <div role="status" className={`${card} mb-4 px-4 py-3 text-[13px] text-[#718096]`}>
          Buổi đã {statusLabel(tour.state).toLowerCase()}{tour.endReason ? `: ${tour.endReason}` : ''}. Live và AI của học sinh đã đóng.
        </div>
      )}
      {assist && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[15px] border border-[#f5c8c2] bg-[#fff4f2] px-5 py-3.5">
          <span className="flex items-center gap-2.5">
            <CircleAlert size={20} className="shrink-0 text-[#c53030]" aria-hidden="true" />
            <strong className="text-[15px] font-bold text-[#c53030]">{tour.reason ? REASON_SHORT[tour.reason] ?? tour.reason : 'Cần hỗ trợ'}</strong>
          </span>
          <span aria-hidden="true" className="hidden h-5 w-px bg-[#f0b4ab] sm:block" />
          <p className="min-w-0 flex-1 text-sm text-[#2d3748]">{tour.reasonDetail ?? 'Robot cần hỗ trợ.'} Lịch tự chuyển bước đã tạm dừng.</p>
        </div>
      )}

      <div className="grid items-start gap-4 min-[1280px]:grid-cols-[minmax(0,1fr)_360px] min-[1700px]:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          <OperationalTwin
            robots={robots}
            tour={tour}
            selectedStopId={selectedStopId}
            title="Bản đồ vận hành"
            className="h-[clamp(340px,52vh,700px)] rounded-[15px]"
          />

          <section className={card} aria-label="Lộ trình và nhật ký">
            <div className="flex flex-wrap items-center gap-x-2 border-b border-[#e2e8f0] px-4">
              <div role="tablist" aria-label="Lộ trình và nhật ký" className="flex gap-1">
                {([['route', 'Lộ trình'], ['log', `Nhật ký (${tour.events.length})`], ['stats', 'Thông số']] as const).map(([key, label]) => (
                  <button key={key} type="button" role="tab" id={`live-tab-${key}`} aria-selected={tab === key} aria-controls={`live-panel-${key}`} onClick={() => setTab(key)}
                    className={`-mb-px min-h-12 border-b-2 px-3 text-sm font-semibold transition-colors ${focus} ${tab === key ? 'border-[#93b8f5] text-[#2d3748]' : 'border-transparent text-[#718096] hover:text-[#2d3748]'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-sm font-semibold text-[#2d3748]">{done} / {total} POI đã qua</span>
            </div>

            {tab === 'route' && (
              <div role="tabpanel" id="live-panel-route" aria-labelledby="live-tab-route" className="grid gap-5 p-4 md:grid-cols-2 md:divide-x md:divide-[#e2e8f0]">
                <div className="max-h-[360px] overflow-y-auto pr-1">
                  <TourTimeline tour={tour} selectedId={selectedStopId} onSelect={select} />
                </div>
                <div className="min-w-0 md:pl-5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-[#2d3748]">Nhật ký gần đây</h2>
                    <button type="button" onClick={() => setTab('log')} className={`rounded-md text-xs font-semibold text-[#2d3748] hover:underline ${focus}`}>Xem toàn bộ nhật ký</button>
                  </div>
                  <ol aria-label="Nhật ký gần đây" className="space-y-1.5">
                    {events.slice(0, 4).map((event) => <EventRow key={event.id} event={event} bad={bad(event.type)} />)}
                    {events.length === 0 && <li className="text-[13px] text-[#718096]">Chưa có sự kiện.</li>}
                  </ol>
                </div>
              </div>
            )}
            {tab === 'log' && (
              <ol role="tabpanel" id="live-panel-log" aria-labelledby="live-tab-log" className="max-h-[420px] space-y-1.5 overflow-y-auto p-4">
                {events.map((event) => <EventRow key={event.id} event={event} bad={bad(event.type)} />)}
                {events.length === 0 && <li className="text-[13px] text-[#718096]">Chưa có sự kiện.</li>}
              </ol>
            )}
            {tab === 'stats' && (
              <div role="tabpanel" id="live-panel-stats" aria-labelledby="live-tab-stats" className="grid gap-4 p-4 md:grid-cols-2">
                <LiveStatusStrip tour={tour} robot={robot} now={now} variant="panel" />
                {selectedStop ? <StopDetail stop={selectedStop} /> : <p className="self-start rounded-xl bg-[#f8fafc] p-4 text-[13px] text-[#718096]">Chọn một POI trong lộ trình để xem thời gian dừng, góc quan sát và giờ tới; bản đồ sẽ đánh dấu POI đó.</p>}
              </div>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 min-[1280px]:sticky min-[1280px]:top-4" aria-label="Điều khiển và thông số">
          <section className={`${card} p-4`} aria-label="Điều khiển">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-bold text-[#2d3748]">Thao tác phiên</h2>
              {assist && progress?.legId && <span className="text-xs text-[#718096]">Đang xử lý lỗi tại chặng <span className="font-mono">{progress.legId}</span></span>}
            </div>
            <OperationControls tour={tour} />
          </section>

          <section className={`${card} p-4`} aria-label="Chi tiết kỹ thuật">
            <h2 className="mb-2 text-[15px] font-bold text-[#2d3748]">Chi tiết kỹ thuật</h2>
            <dl className="divide-y divide-[#f1f5f9] text-[13px]">
              {tech.map(([label, value, warn]) => (
                <div key={label} className="flex gap-3 py-2">
                  <dt className="w-36 shrink-0 text-[#718096]">{label}</dt>
                  <dd className={`m-0 min-w-0 truncate font-semibold ${warn ? 'text-[#c53030]' : 'text-[#2d3748]'}`}>{value}</dd>
                </div>
              ))}
            </dl>
            <details className="group mt-2 rounded-xl border border-[#e2e8f0]">
              <summary className={`flex cursor-pointer list-none items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-[#2d3748] [&::-webkit-details-marker]:hidden ${focus}`}>
                Xem thông số bổ sung<ChevronDown size={16} aria-hidden="true" className="text-[#718096] transition-transform group-open:rotate-180" />
              </summary>
              <dl className="divide-y divide-[#f1f5f9] border-t border-[#e2e8f0] px-3.5 py-1 text-[13px]">
                {([
                  ['Bước hiện tại', stepLabel(progress?.step)],
                  ['Lượt dừng', progress?.visitId ?? '-'],
                  ['Thuyết minh', progress?.narration === 'Playing' ? 'Đang phát' : progress?.narration === 'Stopped' ? 'Đã dừng' : 'Chưa phát'],
                  ['Ngôn ngữ', tour.language],
                  ['Bắt đầu lúc', formatTime(tour.startedAt)],
                ] as const).map(([label, value]) => (
                  <div key={label} className="flex gap-3 py-2"><dt className="w-32 shrink-0 text-[#718096]">{label}</dt><dd className="m-0 min-w-0 truncate font-mono text-[#2d3748]">{value}</dd></div>
                ))}
              </dl>
            </details>
          </section>
        </aside>
      </div>
    </StaffPage>
  )
}

function EventRow({ event, bad }: { event: TourEvent; bad: boolean }) {
  return (
    <li className={`flex gap-3 rounded-xl px-3 py-2.5 ${bad ? 'bg-[#fff4f2]' : 'bg-[#f8fafc]'}`}>
      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${bad ? 'bg-[#c53030]' : 'bg-[#cbd5e1]'}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <b className={`text-[13px] font-semibold ${bad ? 'text-[#c53030]' : 'text-[#2d3748]'}`}>{eventTypeLabel(event.type)}</b>
          <span className="shrink-0 font-mono text-[11px] text-[#a0aec0] tabular-nums">{formatTime(event.occurredAt)}</span>
        </span>
        {event.detail && <span className="mt-0.5 block text-xs leading-5 text-[#718096]">{event.detail}</span>}
      </span>
    </li>
  )
}

function StopDetail({ stop }: { stop: RouteStop }) {
  return (
    <div className="self-start rounded-xl border border-[#e2e8f0] bg-white p-4 transition-opacity duration-200 starting:opacity-0">
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
