import { ArrowRight, CalendarDays, LifeBuoy } from 'lucide-react'
import { Link } from 'react-router'
import { KpiRow, KpiTile } from '../../components/ui/Charts'
import { LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { campusDate, campusDay, campusTime } from '../../features/administration/tours/tour-calendar'
import { tourError } from '../../features/administration/tours/tour-messages'
import { EmptyPanel, ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { useFleetConnection, useFleetTelemetry } from '../../features/staff/operations/fleet-telemetry'
import { useDayTours, useRunningTours } from '../../features/staff/operations/hooks'
import { nextStep } from '../../features/staff/operations/next-step'
import { STEP_LABEL, assistanceInfo, commandStateInfo } from '../../features/staff/operations/operation-labels'
import { ToneBadge, TourStateBadge } from '../../features/staff/operations/OperationParts'

const CONNECTION_TEXT = { connecting: 'Đang kết nối kênh telemetry…', connected: 'Kênh telemetry đang kết nối.', reconnecting: 'Đang kết nối lại kênh telemetry…', disconnected: 'Mất kết nối kênh telemetry, đang thử lại.' } as const

/**
 * Today at a glance, from real data only: the day's Tours, the running ones with
 * their execution and command state, and the robots' own telemetry. Counts are
 * of the rows the API returned for today.
 */
export default function OverviewPage() {
  const today = campusDay(new Date())
  const tours = useDayTours(today)
  const running = useRunningTours()
  const fleet = useFleetTelemetry()
  const connection = useFleetConnection(store => store.state)
  const list = tours.data?.data ?? []
  const known = tours.isSuccess
  const assistance = running.tours.filter(detail => detail.execution?.operationalStatus === 'NEEDS_ASSISTANCE')
  const upcoming = list.filter(tour => tour.state === 'READY' || tour.state === 'SCHEDULED')

  return (
    <StaffPage>
      <PageHeader eyebrow="Vận hành" title="Tổng quan vận hành" description={`Ngày ${campusDate(`${today}T05:00:00Z`)}. Số liệu đọc từ hệ thống, không có dữ liệu minh họa.`}
        action={<Link to="/staff/schedule" className={buttonClass('secondary')}><CalendarDays size={15} aria-hidden="true" />Xem lịch</Link>} />

      {assistance.length > 0 && <section aria-label="Tour cần hỗ trợ" className="mb-4 space-y-2">{assistance.map(detail => {
        const reason = assistanceInfo(detail.execution?.assistanceReason)
        return <div key={detail.tour.id} role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f5c8c2] bg-[#fff4f2] px-4 py-3 text-[13px] text-[#9d3428]">
          <span className="flex min-w-0 items-start gap-2"><LifeBuoy size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><span><span className="block font-bold">{detail.tour.name} cần hỗ trợ: {reason.label}</span><span className="block">{reason.hint}</span></span></span>
          <Link to={`/staff/live/${detail.tour.id}`} className={buttonClass('danger', 'sm')}>Mở điều hành</Link>
        </div>
      })}</section>}

      <KpiRow label="Tình hình hôm nay">
        <KpiTile label="Tour hôm nay" value={known ? list.length : '-'} />
        <KpiTile label="Đang diễn ra" value={running.list.isSuccess ? running.tours.length : '-'} />
        <KpiTile label="Cần hỗ trợ" value={running.list.isSuccess ? assistance.length : '-'} tone={assistance.length ? 'danger' : 'plain'} />
        <KpiTile label="Đã kết thúc hôm nay" value={known ? list.filter(tour => tour.state === 'COMPLETED').length : '-'} />
      </KpiRow>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className={panelClass} aria-label="Tour đang chạy">
          <PanelHead title="Đang chạy" description="Trạng thái Tour và lệnh robot của chặng hiện tại." />
          <div className="p-4">
            {running.isError ? <ErrorPanel error={running.list.error} onRetry={() => void running.list.refetch()} />
              : running.isPending ? <LoadingPanel />
              : running.tours.length === 0 ? <p className="text-sm text-[#64748b]">Không có Tour nào đang chạy.{upcoming[0] ? ` Tour kế tiếp hôm nay: ${upcoming[0].name} lúc ${campusTime(upcoming[0].scheduledStartAt)}.` : ''}</p>
              : <ul className="divide-y divide-[#f1f5f9]">{running.tours.map(detail => {
                const command = detail.execution?.command
                return <li key={detail.tour.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#0f172a]">{detail.tour.name}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {detail.execution?.currentStep && <ToneBadge tone="info">{STEP_LABEL[detail.execution.currentStep] ?? 'Bước khác'}</ToneBadge>}
                      {command && <ToneBadge tone={commandStateInfo(command.state).tone}>Lệnh: {commandStateInfo(command.state).label}</ToneBadge>}
                    </span>
                  </span>
                  <Link to={`/staff/live/${detail.tour.id}`} className={buttonClass('primary', 'sm')}>Mở điều hành<ArrowRight size={14} aria-hidden="true" /></Link>
                </li>
              })}</ul>}
          </div>
        </section>

        <section className={panelClass} aria-label="Robot">
          <PanelHead title="Robot" description="Robot tự báo qua kênh telemetry." action={<Link to="/staff/robot" className={buttonClass('ghost', 'sm')}>Robot & thiết bị</Link>} />
          <div className="space-y-2 p-4">
            {connection !== 'connected' && <p role="status" className="text-xs font-semibold text-[#7d5310]">{CONNECTION_TEXT[connection]}</p>}
            {!fleet ? <p className="text-sm text-[#64748b]">Chưa nhận được telemetry nào.</p>
              : fleet.robots.length === 0 ? <p className="text-sm text-[#64748b]">Chưa có robot nào gửi telemetry tới máy chủ.</p>
              : <ul className="divide-y divide-[#f1f5f9]">{fleet.robots.map(robot => <li key={robot.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="min-w-0"><span className="block font-semibold text-[#0f172a]">{robot.name}</span><span className="block font-mono text-[11px] text-[#64748b]">{robot.id}</span></span>
                <ToneBadge tone={robot.syncFresh ? 'ok' : 'warn'}>{robot.syncFresh ? 'Đang báo cáo' : 'Dữ liệu cũ'}</ToneBadge>
              </li>)}</ul>}
          </div>
        </section>
      </div>

      <section className={`${panelClass} mt-4`} aria-label="Tour hôm nay">
        <PanelHead title="Tour hôm nay" action={<Link to="/staff/tours" className={buttonClass('ghost', 'sm')}>Mở buổi hôm nay</Link>} />
        {tours.isPending ? <div className="p-4"><LoadingPanel /></div>
          : tours.isError ? <div className="p-4"><ErrorPanel error={new Error(tourError(tours.error))} onRetry={() => void tours.refetch()} /></div>
          : list.length === 0 ? <div className="p-4"><EmptyPanel>Hôm nay không có Tour nào.</EmptyPanel></div>
          : <ul className="divide-y divide-[#f1f5f9]">{list.map(tour => {
            const step = nextStep(tour)
            return <li key={tour.id} className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[60px_minmax(0,1fr)_auto_auto]">
              <time className="text-sm font-bold tabular-nums text-[#0f172a]" dateTime={tour.scheduledStartAt}>{campusTime(tour.scheduledStartAt)}</time>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#0f172a]">{tour.name}</span><span className="block truncate text-xs text-[#64748b]">{tour.routeName} · {tour.registrationCount} đoàn</span></span>
              <span className="col-start-2 sm:col-start-auto"><TourStateBadge state={tour.state} /></span>
              <Link to={step.to} className={`${buttonClass('secondary', 'sm')} col-start-2 justify-self-start sm:col-start-auto`}>{step.label}</Link>
            </li>
          })}</ul>}
      </section>
    </StaffPage>
  )
}
