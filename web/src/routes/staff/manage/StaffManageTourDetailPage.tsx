import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { notify } from '../../../components/ui/toast-store'
import { AdminErrorPanel, AdminPage, Notice, SkeletonRows } from '../../../features/administration/AdminUi'
import { formatSlot, formatStamp } from '../../../features/administration/admin-format'
import { passedAt } from '../../../features/administration/routes/route-messages'
import { mapAreaName } from '../../../features/administration/map-labels'
import { useMapVersions } from '../../../features/technical/technical-hooks'
import { newRequestId, useCancelTour, useTour } from '../../../features/administration/tours/hooks'
import { campusShortDate } from '../../../features/administration/tours/tour-calendar'
import { overdueStartLabel } from '../../../features/administration/tours/overdue-start'
import { isRegistrationClosed, openSeatsLabel, tourError, tourStateLabel } from '../../../features/administration/tours/tour-messages'
import { TourReadyPanel } from '../../../features/administration/tours/TourReadyPanel'
import { TourSeatsAndOperatorPanel } from '../../../features/administration/tours/TourSeatsAndOperatorPanel'
import { TourStepper } from '../../../features/staff/operations/TourStepper'

const HEAD_LABEL = { FRONT: 'trước', LEFT: 'trái', RIGHT: 'phải' }

/**
 * A live Tour: what it is, its Route snapshot, and the actions the server
 * permits (edit, cancel, READY and Reopen), each following `permissions`.
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
    <PageHeader eyebrow={`Tour · ${tourStateLabel(tour, now)}`} title={tour.name} description={tour.description ?? 'Chưa có mô tả.'} action={<div className="flex flex-wrap gap-2">
      {permissions.canEditMetadata && <Link to={`/staff/manage/tours/${tour.id}/edit`} className={buttonClass('primary')}>Sửa</Link>}
      {permissions.canCancel && <button type="button" className={buttonClass('danger')} onClick={() => { cancel.reset(); setConfirming(true) }}>Hủy Tour</button>}
    </div>} />
    {tour.state === 'SCHEDULED' && <div className="mb-3"><Notice tone="info">{isRegistrationClosed(tour, now) ? 'Đã đóng đăng ký, Đại diện trường không thêm đoàn mới được nữa. Duyệt nốt đơn còn chờ ở mục Đăng ký đoàn, rồi chốt Tour khi đủ điều kiện.' : 'Đại diện trường đang thấy Tour này và có thể đăng ký đoàn. Duyệt đơn ở mục Đăng ký đoàn, rồi chốt Tour khi đủ điều kiện.'}</Notice></div>}
    {overdue && <div className="mb-3"><Notice tone="warn">{overdue}. Hệ thống tự huỷ Tour không được Start trong khung giờ.</Notice></div>}
    <TourReadyPanel detail={data} />

    <section className={`${panelClass} p-4`} aria-label="Thông tin Tour">
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Item label="Thời gian dự kiến" value={formatSlot(tour.scheduledStartAt)} />
        <Item label="Trạng thái" value={tourStateLabel(tour, now)} />
        {tour.isShortNotice && <Item label="Loại Tour" value="Tour nhanh" />}
        <Item label="Đăng ký / lời mời" value={`${tour.registrationCount} đoàn · ${tour.invitationCount} lời mời`} />
        {openSeatsLabel(tour) && <Item label="Chỗ" value={openSeatsLabel(tour)!} />}
        <Item label="Tạo lúc" value={formatStamp(tour.createdAt)} />
        {reservation && <Item label="Robot" value={reservation.robotCode} />}
        {reservation && <Item label={reservation.releasedAt ? 'Đã trả chỗ robot' : 'Giữ chỗ robot'} value={`${formatStamp(reservation.startsAt)} tới ${formatStamp(reservation.endsAt)}`} />}
        {operator && <Item label="Người vận hành" value={operator.fullName} />}
        {data.fallbackVideoUrl && <Item label="Video dự phòng" value={data.fallbackVideoUrl} />}
        {data.startedAt && <Item label="Bắt đầu" value={formatStamp(data.startedAt)} />}
        {data.endedAt && <Item label="Kết thúc" value={formatStamp(data.endedAt)} />}
        {data.endReason && <Item label="Lý do kết thúc" value={data.endReason} />}
      </dl>
    </section>

    {/* A READY Tour has no edit page, and its Operator can still change. */}
    {tour.state === 'READY' && <TourSeatsAndOperatorPanel key={tour.rowVersion} detail={data} />}

    {routeRevision && <section className={`${panelClass} mt-3 p-4`} aria-label="Tuyến của Tour">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Tuyến: {routeRevision.name}</h2>
        <Link to={`/staff/manage/routes/${routeRevision.routeId}?revisionId=${routeRevision.revisionId}`} className="text-sm text-[#2d719e]">Mở tuyến</Link>
      </div>
      <p className="mt-1 text-sm text-[#64748b]">{routePassedAt && `Tuyến đã chạy thử đạt ngày ${campusShortDate(routePassedAt)} · `}{routeRevision.stops.length} điểm dừng</p>
      <ol className="mt-3 divide-y divide-[#e2e8f0]">{routeRevision.stops.map(stop => <li key={stop.poiRevisionId} className="py-2.5 text-sm">
        <span className="font-medium">{stop.stopOrder}. {stop.name}</span>
        <span className="block text-xs text-[#64748b]">Dừng {stop.dwellSeconds}s</span>
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
        <span className="block text-xs text-[#64748b]">Dừng {stop.dwellSeconds}s · nhìn {stop.headSteps.map(h => `${HEAD_LABEL[h.preset]} ${h.holdSeconds}s`).join(', ')}</span>
      </li>)}</ol>
    </section>}

    <ConfirmationDialog open={confirming} title="Hủy Tour?" tone="danger" confirmLabel="Hủy Tour" requireReason reasonLabel="Lý do hủy"
      description="Tour chuyển sang Đã hủy, lời mời của các đoàn bị thu hồi và đại diện các đoàn nhận email thông báo kèm lý do. Thao tác không hoàn tác được."
      busy={cancel.isPending} error={cancel.isError ? tourError(cancel.error) : null}
      onCancel={() => { if (!cancel.isPending) setConfirming(false) }} onConfirm={reason => void confirmCancel(reason)} />
  </AdminPage>
}

function Item({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[#64748b]">{label}</dt><dd className="mt-0.5 font-medium break-words">{value}</dd></div>
}
