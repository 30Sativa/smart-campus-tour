import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { PageHeader, Pagination, panelClass } from '../../../components/ui/ConsolePrimitives'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, EmptyState, Notice, SkeletonRows } from '../../../features/administration/AdminUi'
import { formatSlot } from '../../../features/administration/admin-format'
import { revisionTone, routeAvailabilityError } from '../../../features/administration/routes/route-messages'
import { versionedRoutesApi, type RouteScheduledTour, type VersionedRoute } from '../../../features/administration/routes/versioned-api'
import { tourKeys } from '../../../features/administration/tours/hooks'
import { TOUR_STATE_LABEL } from '../../../features/administration/tours/tour-messages'

/** Routes as cards: the stops as a small path, every revision as a chip, and what still blocks scheduling. */
export default function StaffManageRouteCatalogPage() {
  const [page, setPage] = useState(1)
  const [active, setActive] = useState(true)
  const [deactivating, setDeactivating] = useState<VersionedRoute | null>(null)
  const [outcome, setOutcome] = useState('')
  const client = useQueryClient()
  const routes = useQuery({ queryKey: ['versioned-routes', page, active], queryFn: () => versionedRoutesApi.list(page, active) })
  const availability = useMutation({
    // A retry after a lost reply reuses this id, so the server does not count it twice.
    mutationFn: ({ route, requestId, open }: { route: VersionedRoute; requestId: string; open: boolean }) => versionedRoutesApi.setAvailability(route, requestId, open),
    onSuccess: async (result, { route }) => {
      setDeactivating(null)
      setOutcome(result.isActive ? `Đã mở lại tuyến ${route.name}.` : `Đã ngừng sử dụng tuyến ${route.name}.${result.scheduledTours.length ? ` ${result.scheduledTours.length} Tour đã lên lịch vẫn giữ tuyến này.` : ''}`)
      await Promise.all([client.invalidateQueries({ queryKey: ['versioned-routes'] }), client.invalidateQueries({ queryKey: tourKeys.all })])
    },
  })
  const pickFilter = (next: boolean) => { setActive(next); setPage(1); setOutcome('') }
  return <AdminPage>
    <PageHeader eyebrow="Chuẩn bị Tour · Tuyến" title="Danh mục tuyến" description="Xem lộ trình, các điểm tham quan và trạng thái kiểm chứng của từng tuyến."
      action={<Link to="/staff/manage/routes/new" className={buttonClass('primary')}><Plus size={15} aria-hidden="true" />Tạo tuyến</Link>} />
    <div className="mb-3"><Notice tone="warn">Tuyến đã lưu hoặc đã chạy thử chưa đủ để lập lịch Tour. Chức năng lập lịch từ phiên bản tuyến mới chưa được hỗ trợ.</Notice></div>
    {outcome && <div className="mb-3"><Notice tone="success">{outcome}</Notice></div>}
    {availability.isError && !deactivating && <div className="mb-3"><Notice tone="danger">{routeAvailabilityError(availability.error)}</Notice></div>}
    <section className={`${panelClass} overflow-hidden`} aria-label="Danh mục tuyến">
      <div className="border-b border-[#eef1f4] px-3 py-2">
        <div role="group" aria-label="Lọc theo tình trạng sử dụng" className="inline-flex gap-0.5 rounded-[10px] bg-[#eef2f6] p-[3px]">
          {([[true, 'Đang sử dụng'], [false, 'Ngừng sử dụng']] as const).map(([value, label]) => <button key={label} type="button" aria-pressed={active === value} onClick={() => pickFilter(value)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${active === value ? 'bg-white text-[#173b59] shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-[#475569]'}`}>{label}</button>)}
        </div>
      </div>
      {routes.isPending ? <SkeletonRows rows={4} /> : routes.error ? <AdminErrorPanel title="Không tải được danh mục tuyến." onRetry={() => void routes.refetch()} /> : !routes.data?.data.length ? <EmptyState title={active ? 'Chưa có tuyến nào' : 'Không có tuyến ngừng sử dụng'} action={active ? <Link to="/staff/manage/routes/new" className={buttonClass('primary')}>Tạo tuyến</Link> : undefined} /> :
        <div className="grid gap-3 p-3 md:grid-cols-2 2xl:grid-cols-3">{routes.data.data.map(route => {
          const tone = revisionTone(route.isSubmitted, route.verificationStatus)
          return <article key={route.routeId} className="grid content-start gap-3 rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-3 transition-colors hover:border-[#c9dcec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0"><Link to={`/staff/manage/routes/${route.routeId}`} className="block text-[15px] font-semibold text-[#173b59] hover:underline">{route.name}</Link><small className="block text-xs text-[#64748b]">{route.mapKey} · {route.stops.length} điểm · phiên bản {route.revisionNumber}</small></span>
              <span className={`shrink-0 rounded-full border px-2 py-px text-[11px] font-bold ${tone.chip}`}>{tone.label}</span>
            </span>
            <span className="flex items-center" aria-hidden="true">{route.stops.map((stop, i) => <span key={stop.poiRevisionId} className="flex flex-1 items-center last:flex-none">{i > 0 && <i className="h-0.5 flex-1 bg-[#c9dfee]" />}<span className="size-2.5 shrink-0 rounded-full bg-[#7db9db]" title={stop.name} /></span>)}</span>
            <details className="text-xs text-[#64748b]">
              <summary className="cursor-pointer font-medium">Lịch sử phiên bản ({route.revisionHistory.length})</summary>
              <ul className="mt-2 space-y-2">{route.revisionHistory.map(rev => <li key={rev.revisionId}>Phiên bản {rev.revisionNumber} · {revisionTone(rev.isSubmitted, rev.verificationStatus).label}</li>)}</ul>
            </details>
            {route.eligibilityIssues.length > 0 && <small className="text-xs text-[#8a5a06]">{route.eligibilityIssues.length} điều kiện chưa đạt để lập lịch</small>}
            <span>{route.isActive
              ? <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => { availability.reset(); setOutcome(''); setDeactivating(route) }}>Ngừng sử dụng</button>
              : <button type="button" className={buttonClass('secondary', 'sm')} disabled={availability.isPending} onClick={() => { setOutcome(''); availability.mutate({ route, requestId: crypto.randomUUID(), open: true }) }}>Mở lại</button>}</span>
          </article>
        })}</div>}
      {routes.isSuccess && <Pagination page={page} pageCount={Math.max(1, routes.data.pagination.totalPages)} total={routes.data.pagination.totalItems} pageSize={100} onPage={setPage} label="Phân trang tuyến" />}
    </section>
    {deactivating && <DeactivateRouteDialog route={deactivating} busy={availability.isPending} error={availability.isError ? routeAvailabilityError(availability.error) : null}
      onConfirm={requestId => availability.mutate({ route: deactivating, requestId, open: false })} onCancel={() => { availability.reset(); setDeactivating(null) }} />}
  </AdminPage>
}

/** Names the Tours that keep this route, so stopping it is a decision taken with them in view. */
function DeactivateRouteDialog({ route, busy, error, onConfirm, onCancel }: { route: VersionedRoute; busy: boolean; error: string | null; onConfirm: (requestId: string) => void; onCancel: () => void }) {
  const [requestId] = useState(() => crypto.randomUUID())
  const tours = useQuery({ queryKey: ['versioned-routes', route.routeId, 'scheduled-tours'], queryFn: () => versionedRoutesApi.scheduledTours(route.routeId) })
  return <ConfirmationDialog open title={`Ngừng sử dụng tuyến ${route.name}?`} confirmLabel="Ngừng sử dụng" tone="danger" withReason={false} busy={busy} error={error}
    description="Tuyến sẽ không dùng được cho Tour mới. Phiên bản, kết quả chạy thử và Tour đã lên lịch không thay đổi."
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
