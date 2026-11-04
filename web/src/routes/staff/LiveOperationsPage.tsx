import { useState } from 'react'
import { ArrowLeft, ArrowRight, CircleSlash, OctagonAlert } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import { LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { notify } from '../../components/ui/toast-store'
import { buttonClass } from '../../components/ui/ui-classes'
import { formatSlot } from '../../features/administration/admin-format'
import { useRequestId } from '../../features/administration/tours/hooks'
import { campusDay } from '../../features/administration/tours/tour-calendar'
import type { TourDetails } from '../../features/administration/tours/types'
import { EmptyPanel, ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { useNow } from '../../features/staff/use-now'
import { useDayTours, useNextStop, useOperationTour, useRunningTours } from '../../features/staff/operations/hooks'
import { checkInfo } from '../../features/staff/operations/operation-labels'
import { operationRefusal } from '../../features/staff/operations/operation-errors'
import { CommandCard, ExecutionPanel, RobotTelemetryPanel, RouteStopList, TourStateBadge } from '../../features/staff/operations/OperationParts'
import { StartCheckList } from '../../features/staff/operations/StartCheckList'

/**
 * Live operations of one Tour: the Tour's state, the robot command it waits on,
 * the robot's own telemetry, and the operations the server allows now. Without
 * an id it opens the running Tour, the one needing help first.
 */
export default function LiveOperationsPage() {
  const { tourId } = useParams()
  return tourId ? <TourConsole tourId={tourId} /> : <RunningPicker />
}

function RunningPicker() {
  const running = useRunningTours()
  const today = useDayTours(campusDay(new Date()))
  if (running.isError) return <StaffPage><ErrorPanel error={running.list.error} onRetry={() => void running.list.refetch()} /></StaffPage>
  if (running.isPending) return <StaffPage><LoadingPanel /></StaffPage>
  const first = running.tours.find(tour => tour.execution?.operationalStatus === 'NEEDS_ASSISTANCE') ?? running.tours[0]
  if (first) return <Navigate to={`/staff/live/${first.tour.id}`} replace />
  const ready = today.data?.data.filter(tour => tour.state === 'READY') ?? []
  return <StaffPage>
    <PageHeader eyebrow="Điều hành" title="Điều hành trực tiếp" description="Không có Tour nào đang chạy." />
    {ready.length ? <section className={panelClass} aria-label="Tour đã chốt hôm nay">
      <PanelHead title="Tour đã chốt hôm nay" description="Người vận hành kiểm tra điều kiện rồi bắt đầu." />
      <ul className="divide-y divide-[#f1f5f9]">{ready.map(tour => <li key={tour.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="min-w-0"><span className="block text-sm font-semibold text-[#0f172a]">{tour.name}</span><span className="block text-xs text-[#64748b]">{formatSlot(tour.scheduledStartAt)} · {tour.routeName}</span></span>
        <Link to={`/staff/tours/${tour.id}/start`} className={buttonClass('secondary', 'sm')}>Kiểm tra trước khi bắt đầu</Link>
      </li>)}</ul>
    </section> : <EmptyPanel>Hôm nay chưa có Tour nào đã chốt để bắt đầu.</EmptyPanel>}
  </StaffPage>
}

function TourConsole({ tourId }: { tourId: string }) {
  const tour = useOperationTour(tourId)
  const now = useNow(1000)
  if (tour.isPending) return <StaffPage wide><LoadingPanel /></StaffPage>
  if (tour.isError) return <StaffPage wide><ErrorPanel error={tour.error} onRetry={() => void tour.refetch()} /></StaffPage>
  const detail = tour.data
  const { tour: summary, reservation, operator } = detail
  const started = summary.state === 'RUNNING' || Boolean(detail.startedAt)

  return (
    <StaffPage wide>
      <Link to="/staff/tours" className={`${buttonClass('ghost', 'sm')} mb-3 -ml-2`}><ArrowLeft size={15} aria-hidden="true" />Buổi hôm nay</Link>
      <PageHeader eyebrow="Điều hành trực tiếp" title={summary.name}
        description={`${formatSlot(summary.scheduledStartAt)} · ${detail.routeRevision?.name ?? summary.routeName} · robot ${reservation?.robotCode ?? '-'} · người vận hành ${operator?.fullName ?? '-'}`}
        action={<><TourStateBadge state={summary.state} /><Link to={`/staff/manage/tours/${summary.id}`} className={buttonClass('secondary', 'sm')}>Thông tin Tour</Link></>} />

      {!started ? <div className={`${panelClass} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <p className="text-sm text-[#334155]">{summary.state === 'READY' ? 'Tour đã chốt nhưng chưa bắt đầu.' : summary.state === 'SCHEDULED' ? 'Tour chưa được chốt.' : 'Tour không chạy.'}</p>
        <Link to={summary.state === 'READY' ? `/staff/tours/${summary.id}/start` : `/staff/manage/tours/${summary.id}`} className={buttonClass('primary', 'sm')}>{summary.state === 'READY' ? 'Kiểm tra trước khi bắt đầu' : 'Mở trang chuẩn bị Tour'}</Link>
      </div> : <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.9fr)]">
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={panelClass} aria-label="Trạng thái Tour">
              <PanelHead title="Trạng thái Tour" description="Tour đang ở đâu trong luồng vận hành." />
              <div className="p-4"><ExecutionPanel detail={detail} now={now} /></div>
            </section>
            <section className={panelClass} aria-label="Lệnh robot">
              <PanelHead title="Lệnh robot của chặng" description="Vòng đời riêng của lệnh, khác trạng thái Tour." />
              <div className="p-4"><CommandCard command={detail.execution?.command} /></div>
            </section>
          </div>
          <section className={panelClass} aria-label="Tuyến của Tour">
            <PanelHead title="Tuyến" />
            <div className="p-4"><RouteStopList detail={detail} /></div>
          </section>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-4">
          {summary.state === 'RUNNING' && <Controls detail={detail} />}
          <section className={panelClass} aria-label="Telemetry robot">
            <PanelHead title="Robot" description="Robot tự báo qua kênh telemetry." />
            <div className="p-4"><RobotTelemetryPanel robotCode={reservation?.robotCode} /></div>
          </section>
        </aside>
      </div>}
    </StaffPage>
  )
}

/** Operations not yet implemented by the backend; listed so their absence is visible, never faked. */
const UNAVAILABLE = [
  { key: 'endEarly', label: 'Kết thúc sớm', always: true },
  { key: 'retryLeg', label: 'Thử lại chặng', always: false },
  { key: 'reconcile', label: 'Đối soát lệnh chưa rõ kết quả', always: false },
] as const

function Controls({ detail }: { detail: TourDetails }) {
  const { tour } = detail
  const next = useNextStop()
  const [confirming, setConfirming] = useState(false)
  const requestId = useRequestId(`next:${tour.id}:${tour.rowVersion}`)
  const gate = detail.allowedActions?.next
  const assist = detail.execution?.operationalStatus === 'NEEDS_ASSISTANCE'
  const refusal = next.isError ? operationRefusal(next.error, { operator: true }) : null
  const blocked = gate && !gate.allowed
    ? [gate.reason, ...gate.blockedBy.filter(id => checkInfo(id).group !== 'other').map(id => checkInfo(id).label)].filter(Boolean).join(' · ')
    : null

  return (
    <section className={panelClass} aria-label="Điều khiển Tour">
      <PanelHead title="Điều khiển" description="Máy chủ quyết định thao tác nào được phép." />
      <div className="space-y-3 p-4">
        <button type="button" className={`${buttonClass('primary', 'lg')} w-full`} disabled={!gate?.allowed || next.isPending} aria-describedby="next-reason"
          onClick={() => { next.reset(); setConfirming(true) }}><ArrowRight size={18} aria-hidden="true" />Đi tiếp</button>
        <p id="next-reason" className="text-[13px] leading-5 text-[#64748b]">{!gate ? 'Máy chủ chưa trả quyền thao tác cho Tour này.' : gate.allowed ? 'Robot rời điểm dừng hiện tại khi bạn xác nhận.' : `Chưa đi tiếp được: ${blocked}`}</p>
        {refusal?.checks && !confirming && <StartCheckList checks={refusal.checks} blockedBy={refusal.blockedBy} />}

        <div className="border-t border-[#f1f5f9] pt-3">
          <p className="mb-2 text-xs font-semibold text-[#64748b]">Chưa có trên hệ thống</p>
          <ul className="space-y-1.5">{UNAVAILABLE.filter(item => item.always || assist).map(item => <li key={item.key}>
            <button type="button" disabled className={`${buttonClass('secondary', 'sm')} w-full justify-start`} aria-describedby="unavailable-reason"><CircleSlash size={14} aria-hidden="true" />{item.label}</button>
          </li>)}</ul>
          <p id="unavailable-reason" className="mt-2 text-xs leading-5 text-[#64748b]">Máy chủ chưa có API cho các thao tác này, nên màn hình không gửi được yêu cầu.</p>
        </div>
        <p className="flex gap-2 rounded-lg bg-[#fff4f2] px-3 py-2 text-xs leading-5 font-semibold text-[#9d3428]"><OctagonAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />Trang web không phải nút dừng khẩn cấp. Khi nguy hiểm, bấm nút dừng khẩn cấp trên robot.</p>
      </div>
      <ConfirmationDialog open={confirming} title="Đi tiếp?" confirmLabel="Đi tiếp" withReason={false} busyLabel="Đang gửi…"
        description="Máy chủ đóng lượt dừng hiện tại rồi tạo lệnh di chuyển tới điểm kế tiếp. Ở điểm dừng cuối, robot về điểm kết thúc hoặc Tour kết thúc tại đó, tùy cấu hình tuyến."
        busy={next.isPending} error={refusal?.message ?? null}
        onCancel={() => { if (!next.isPending) setConfirming(false) }}
        onConfirm={() => {
          next.mutateAsync({ id: tour.id, requestId, rowVersion: tour.rowVersion }).then(() => {
            setConfirming(false)
            notify({ title: 'Đã gửi yêu cầu đi tiếp', detail: 'Theo dõi trạng thái lệnh robot của chặng mới.' })
          }, () => undefined)
        }} />
    </section>
  )
}
