import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { formatSlot } from '../admin-format'
import { TOUR_STATE_LABEL } from '../tours/tour-messages'
import { routeAvailabilityError } from './route-messages'
import { versionedRoutesApi, type RouteScheduledTour, type VersionedRoute } from './versioned-api'

/** Names the Tours that keep this route, so stopping it is a decision taken with them in view. */
export function DeactivateRouteDialog({ route, busy, error, onConfirm, onCancel }: { route: VersionedRoute; busy: boolean; error: string | null; onConfirm: (requestId: string) => void; onCancel: () => void }) {
  const [requestId] = useState(() => crypto.randomUUID())
  const tours = useQuery({ queryKey: ['versioned-routes', route.routeId, 'scheduled-tours'], queryFn: () => versionedRoutesApi.scheduledTours(route.routeId) })
  return <ConfirmationDialog open title={`Ngừng sử dụng tuyến ${route.name}?`} confirmLabel="Ngừng sử dụng" tone="danger" withReason={false} busy={busy} error={error}
    description="Tuyến sẽ không dùng được cho Tour mới. Các bản đã lưu, kết quả chạy thử và Tour đã lên lịch không thay đổi."
    onConfirm={() => onConfirm(requestId)} onCancel={onCancel}>
    {tours.isPending ? <p aria-busy="true" className="text-xs text-[#64748b]">Đang tải Tour đã lên lịch…</p>
      : tours.isError ? <p role="alert" className="text-xs text-[#b23e31]">{routeAvailabilityError(tours.error)}</p>
      : <ScheduledTours tours={tours.data} />}
  </ConfirmationDialog>
}

function ScheduledTours({ tours }: { tours: RouteScheduledTour[] }) {
  if (!tours.length) return <p className="text-xs text-[#64748b]">Không có Tour nào đã lên lịch trên tuyến này.</p>
  return <div className="text-sm">
    <p className="font-medium text-[#334155]">{tours.length} Tour đã lên lịch vẫn giữ tuyến này:</p>
    <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">{tours.map(tour => <li key={tour.id}><Link to={`/staff/manage/tours/${tour.id}`} className="text-[#2d719e] hover:underline">{tour.name}</Link> <span className="text-xs text-[#64748b]">· {formatSlot(tour.scheduledStartAt)} · {TOUR_STATE_LABEL[tour.state]}</span></li>)}</ul>
  </div>
}
