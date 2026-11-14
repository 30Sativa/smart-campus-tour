import { useEffect } from 'react'
import { Link } from 'react-router'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { formatDateTime } from '../../components/ui/date-time'
import { ApiError } from '../../api/client'
import type { MapRetirementImpact, MapVersion } from './api/technical'
import { mapVersionLabel } from './poi-labels'
import { errorText } from './technical-format'
import { useMapRetirementImpact, useRetireMap } from './technical-hooks'

const linkClass = 'font-semibold text-[#1d4ed8] underline'

/** The refusals that a fresh look at the impact explains, so the dialog reloads it after one of them. */
const BLOCKED_CODES = new Set(['MAP_VERSION_ROBOT_ASSIGNED', 'MAP_VERSION_HAS_PENDING_REVIEWS', 'MAP_VERSION_HAS_UPCOMING_TOURS', 'MAP_VERSION_STALE'])

function refusalCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.body) return null
  try {
    const code = (JSON.parse(error.body) as { errors?: { code?: unknown } }).errors?.code
    return typeof code === 'string' ? code : null
  } catch { return null }
}

const isRetirementBlocked = (impact: MapRetirementImpact) =>
  impact.assignedRobots.length + impact.pendingPois.length + impact.pendingRoutes.length + impact.upcomingTours.length > 0

/**
 * "Ngừng sử dụng" for one map version (ADR-0041). The reason is required, the routes on the version are listed, and
 * anything that blocks retirement is shown with a link to where it is resolved. Nothing is cancelled or deleted.
 */
export function RetireMapDialog({ map, onClose }: { map: MapVersion; onClose: () => void }) {
  const impact = useMapRetirementImpact(map.id)
  const retire = useRetireMap()
  const { refetch } = impact
  const code = refusalCode(retire.error)
  useEffect(() => { if (code && BLOCKED_CODES.has(code)) void refetch() }, [code, refetch])
  const blocked = impact.data ? isRetirementBlocked(impact.data) : false
  const close = () => { retire.reset(); onClose() }
  return (
    <ConfirmationDialog open tone="danger" title={`Ngừng sử dụng ${mapVersionLabel(map)}?`} confirmLabel="Ngừng sử dụng"
      requireReason reasonLabel="Lý do ngừng sử dụng" reasonPlaceholder="Ví dụ: bản đồ quét lại, tải nhầm tệp…" busy={retire.isPending}
      confirmDisabled={impact.isPending || impact.isError || blocked}
      error={retire.error ? errorText(retire.error) : null}
      description="Phiên bản này sẽ không còn trong các danh sách chọn và không nhận việc mới. POI, tuyến, kết quả kiểm tra và Tour cũ vẫn giữ nguyên, có thể mở lại bất cứ lúc nào."
      onConfirm={reason => retire.mutate({ map, reason }, { onSuccess: onClose })} onCancel={close}>
      {impact.isPending ? <p role="status" aria-busy="true" className="text-xs text-[#64748b]">Đang kiểm tra những gì dùng phiên bản này…</p>
        : impact.isError ? <div role="alert" className="space-y-2 text-xs text-[#b23e31]"><p>{errorText(impact.error)}</p><button type="button" className="font-semibold underline" onClick={() => void refetch()}>Thử lại</button></div>
        : <RetirementImpact impact={impact.data} />}
    </ConfirmationDialog>
  )
}

function RetirementImpact({ impact }: { impact: MapRetirementImpact }) {
  const blocked = isRetirementBlocked(impact)
  return (
    <div className="space-y-3 text-sm">
      <section aria-label="Tuyến dùng phiên bản này">
        <p className="font-medium text-[#334155]">{impact.routes.length ? `${impact.routes.length} tuyến dùng phiên bản này, vẫn giữ nguyên:` : 'Không có tuyến nào dùng phiên bản này.'}</p>
        {impact.routes.length > 0 && <ul className="mt-1 list-inside list-disc text-[#475569]">{impact.routes.map(route =>
          <li key={route.routeId}>{route.name}{route.isActive ? '' : ' (đã ngừng sử dụng)'}</li>)}</ul>}
      </section>
      {blocked && <section role="alert" aria-label="Chưa ngừng được" className="rounded-lg border border-[#f5c8c2] bg-[#fff6f4] p-3 text-[#7a2a20]">
        <p className="font-semibold">Chưa ngừng được vì:</p>
        {impact.assignedRobots.length > 0 && <div className="mt-2">
          <p>Robot đang được gán phiên bản này. Đổi hoặc bỏ gán bản đồ trước:</p>
          <ul className="mt-1 list-inside list-disc">{impact.assignedRobots.map(robot =>
            <li key={robot.robotId}><Link className={linkClass} to={`/technical/robots?robot=${robot.robotId}`}>{robot.robotCode}</Link></li>)}</ul>
        </div>}
        {impact.pendingPois.length > 0 && <div className="mt-2">
          <p>POI đã gửi, đang chờ Kỹ thuật kiểm chứng:</p>
          <ul className="mt-1 list-inside list-disc">{impact.pendingPois.map(poi =>
            <li key={poi.proposalId}><Link className={linkClass} to="/technical/poi-import">{poi.name} · phiên bản {poi.revisionNumber}</Link></li>)}</ul>
        </div>}
        {impact.pendingRoutes.length > 0 && <div className="mt-2">
          <p>Tuyến đã gửi, đang chờ chạy thử:</p>
          <ul className="mt-1 list-inside list-disc">{impact.pendingRoutes.map(route =>
            <li key={route.revisionId}><Link className={linkClass} to="/technical/confirmations">{route.name} · phiên bản {route.revisionNumber}</Link></li>)}</ul>
        </div>}
        {impact.upcomingTours.length > 0 && <div className="mt-2">
          <p>Tour đã lên lịch hoặc sẵn sàng. Staff cần huỷ hoặc đổi tuyến các Tour này trước:</p>
          <ul className="mt-1 list-inside list-disc">{impact.upcomingTours.map(tour =>
            <li key={tour.tourId}><Link className={linkClass} to={`/staff/manage/tours/${tour.tourId}`}>{tour.name}</Link> · {formatDateTime(tour.scheduledStartAt)}</li>)}</ul>
        </div>}
      </section>}
    </div>
  )
}
