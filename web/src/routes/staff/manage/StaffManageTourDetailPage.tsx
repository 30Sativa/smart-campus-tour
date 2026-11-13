import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { formatDate, formatDateTime, formatDuration, formatTime } from '../../../components/ui/date-time'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { notify } from '../../../components/ui/toast-store'
import { AdminErrorPanel, AdminPage, Notice, SkeletonRows } from '../../../features/administration/AdminUi'
import { passedAt } from '../../../features/administration/routes/route-messages'
import { NewerRevisionNotice } from '../../../features/administration/routes/NewerRevisionNotice'
import { mapAreaName } from '../../../features/administration/map-labels'
import { useMapVersions } from '../../../features/technical/technical-hooks'
import { newRequestId, useCancelTour, useTour } from '../../../features/administration/tours/hooks'
import { overdueStartLabel } from '../../../features/administration/tours/overdue-start'
import { isRegistrationClosed, openSeatsLabel, tourError, tourStateLabel } from '../../../features/administration/tours/tour-messages'
import { TourReadyPanel } from '../../../features/administration/tours/TourReadyPanel'
import { TourSeatsAndOperatorPanel } from '../../../features/administration/tours/TourSeatsAndOperatorPanel'
import { QuickTourShare } from '../../../features/administration/tours/QuickTourShare'
import { TourStepper } from '../../../features/staff/operations/TourStepper'

const HEAD_LABEL = { FRONT: 'trước', LEFT: 'trái', RIGHT: 'phải' }
const slotText = (value: string) => `${formatDate(value, { weekday: 'short' })} ${formatTime(value)}`

/**
 * A live Tour: what it is, its Route snapshot, and the actions the server
 * permits (edit, cancel, READY and Reopen), each following `permissions`.
 * The next step (Chốt Tour or the pre-start check) leads; Cancel sits alone at the bottom.
 */
export default function StaffManageTourDetailPage() {
  const { tourId = '' } = useParams()
  const detail = useTour(tourId)
  const cancel = useCancelTour()
  const maps = useMapVersions()
  const [confirming, setConfirming] = useState(false)
  const [requestId, setRequestId] = useState(newRequestId)
  const [now] = useState(() => Date.now())
  const data = detail.data
  if (detail.isError) return <AdminPage><AdminErrorPanel title={tourError(detail.error)} onRetry={() => void detail.refetch()} /></AdminPage>
  if (!data) return <AdminPage><SkeletonRows rows={5} label="Đang tải Tour" /></AdminPage>
  const { tour, route, routeRevision, operator, reservation, permissions } = data
  const routePassedAt = routeRevision && passedAt(routeRevision)
  const overdue = overdueStartLabel(tour, reservation, now)

  const confirmCancel = async (reason: string) => {
    try {
      await cancel.mutateAsync({ id: tour.id, requestId, rowVersion: tour.rowVersion, reason: reason.trim() })
      setConfirming(false)
      setRequestId(newRequestId())
      notify({ tone: 'info', title: `Đã hủy Tour “${tour.name}”`, detail: 'Lời mời của các đoàn đã bị thu hồi; danh sách đăng ký được giữ lại.' })
    } catch { /* The dialog shows the error and keeps the reason. */ }
  }

  return <AdminPage>
    <TourStepper detail={data} page="prepare" />
    <PageHeader eyebrow={`Tour · ${tourStateLabel(tour, now)}`} title={tour.name} description={tour.description ?? 'Chưa có mô tả.'}
      action={permissions.canEditMetadata ? <Link to={`/staff/manage/tours/${tour.id}/edit`} className={buttonClass('secondary')}>Sửa</Link> : undefined} />
    <TourReadyPanel detail={data} />
    {tour.isShortNotice && tour.state === 'SCHEDULED' && <QuickTourShare tour={tour} />}
    {tour.state === 'SCHEDULED' && <div className="mb-3"><Notice tone="info">{isRegistrationClosed(tour, now) ? 'Đã đóng đăng ký, Đại diện trường không thêm đoàn mới được nữa. Duyệt nốt đơn còn chờ ở mục Đăng ký đoàn, rồi chốt Tour khi đủ điều kiện.' : 'Đại diện trường đang thấy Tour này và có thể đăng ký đoàn. Duyệt đơn ở mục Đăng ký đoàn, rồi chốt Tour khi đủ điều kiện.'}</Notice></div>}
    {overdue && <div className="mb-3"><Notice tone="warn">{overdue}. Hệ thống tự huỷ Tour không được bắt đầu trong khung giờ.</Notice></div>}

    <section className={`${panelClass} p-4`} aria-label="Thông tin Tour">
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Item label={tour.isShortNotice ? 'Hạn bắt đầu' : 'Thời gian dự kiến'} value={slotText(tour.scheduledStartAt)} />
        <Item label="Trạng thái" value={tourStateLabel(tour, now)} />
        {tour.isShortNotice && <Item label="Loại Tour" value="Tour nhanh" />}
        <Item label="Đăng ký / lời mời" value={<Link to={`/staff/manage/registrations?tourId=${tour.id}`} className="text-[#2563eb] underline-offset-2 hover:underline">{tour.registrationCount} đoàn · {tour.invitationCount} lời mời</Link>} />
        {openSeatsLabel(tour) && <Item label="Chỗ" value={openSeatsLabel(tour)!} />}
        <Item label="Tạo lúc" value={formatDateTime(tour.createdAt)} />
        {reservation && <Item label="Robot" value={reservation.robotCode} />}
        {reservation && <Item label={reservation.releasedAt ? 'Đã trả chỗ robot' : 'Giữ chỗ robot'} value={`${formatDateTime(reservation.startsAt)} tới ${formatDateTime(reservation.endsAt)}`} />}
        {operator && <Item label="Người vận hành" value={operator.fullName} />}
        {data.fallbackVideoUrl && <Item label="Video dự phòng" value={data.fallbackVideoUrl} />}
        {data.startedAt && <Item label="Bắt đầu" value={formatDateTime(data.startedAt)} />}
        {data.endedAt && <Item label="Kết thúc" value={formatDateTime(data.endedAt)} />}
        {data.endReason && <Item label="Lý do kết thúc" value={data.endReason} />}
      </dl>
    </section>

    {/* A READY Tour has no edit page, and its Operator can still change. */}
    {tour.state === 'READY' && <TourSeatsAndOperatorPanel key={tour.rowVersion} detail={data} />}

    {routeRevision && <section className={`${panelClass} mt-3 p-4`} aria-label="Tuyến của Tour">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Tuyến: {routeRevision.name}</h2>
        <Link to={`/staff/manage/routes/${routeRevision.routeId}?revisionId=${routeRevision.revisionId}`} className="text-sm text-[#2d719e]">Xem bản Tour đang dùng</Link>
      </div>
      {(tour.state === 'SCHEDULED' || tour.state === 'READY') && <NewerRevisionNotice routeId={routeRevision.routeId} revisionId={routeRevision.revisionId} />}
      <p className="mt-1 text-sm text-muted">{routePassedAt && `Tuyến đã chạy thử đạt ngày ${formatDate(routePassedAt)} · `}{routeRevision.stops.length} điểm dừng</p>
      <ol className="mt-3 divide-y divide-[#e2e8f0]">{routeRevision.stops.map(stop => <li key={stop.poiRevisionId} className="py-2.5 text-sm">
        <span className="font-medium">{stop.stopOrder}. {stop.name}</span>
        <span className="block text-xs text-muted">Dừng {formatDuration(stop.dwellSeconds)}</span>
      </li>)}</ol>
    </section>}

    {route && <section className={`${panelClass} mt-3 p-4`} aria-label="Tuyến của Tour">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Tuyến: {route.name}</h2>
        <Link to={`/staff/manage/routes/${route.id}`} className="text-sm text-[#2d719e]">Mở tuyến</Link>
      </div>
      <p className="mt-1 text-sm text-[#64748b]">{mapAreaName(maps.data, { mapKey: route.mapKey }) ?? '-'} · {route.stops.length} điểm dừng</p>
      <ol className="mt-3 divide-y divide-[#e2e8f0]">{route.stops.map(stop => <li key={stop.id} className="py-2.5 text-sm">
        <span className="font-medium">{stop.stopOrder}. {stop.poiName}</span>
        <span className="block text-xs text-muted">Dừng {formatDuration(stop.dwellSeconds)} · nhìn {stop.headSteps.map(h => `${HEAD_LABEL[h.preset]} ${formatDuration(h.holdSeconds)}`).join(', ')}</span>
      </li>)}</ol>
    </section>}

    {permissions.canCancel && <section className="mt-6 rounded-2xl border border-[#f3c7c0] bg-[#fff7f5] p-4" aria-labelledby="danger-zone">
      <h2 id="danger-zone" className="text-[15px] font-semibold text-[#9d3428]">Vùng nguy hiểm</h2>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] leading-5 text-[#334155]">Hủy Tour thu hồi lời mời của các đoàn và trả robot. Không hoàn tác được.</p>
        <button type="button" className={buttonClass('danger', 'sm')} onClick={() => { cancel.reset(); setConfirming(true) }}>Hủy Tour</button>
      </div>
    </section>}

    <ConfirmationDialog open={confirming} title="Hủy Tour?" tone="danger" confirmLabel="Hủy Tour" requireReason reasonLabel="Lý do hủy"
      description="Tour chuyển sang Đã hủy, lời mời của các đoàn bị thu hồi và đại diện các đoàn nhận email thông báo kèm lý do. Thao tác không hoàn tác được."
      busy={cancel.isPending} error={cancel.isError ? tourError(cancel.error) : null}
      onCancel={() => { if (!cancel.isPending) setConfirming(false) }} onConfirm={reason => void confirmCancel(reason)} />
  </AdminPage>
}

function Item({ label, value }: { label: string; value: ReactNode }) {
  return <div><dt className="text-muted">{label}</dt><dd className="mt-0.5 font-medium break-words">{value}</dd></div>
}
