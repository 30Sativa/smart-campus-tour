import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { PageHeader, Pagination, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, EmptyState, Notice, SkeletonRows } from '../../../features/administration/AdminUi'
import { routeAvailabilityError, staffRouteStatus } from '../../../features/administration/routes/route-messages'
import { ScheduleFitBadge } from '../../../features/administration/routes/ScheduleFitBadge'
import { versionedRoutesApi, type VersionedRoute } from '../../../features/administration/routes/versioned-api'
import { tourKeys } from '../../../features/administration/tours/hooks'
import { useMapVersions } from '../../../features/technical/technical-hooks'

/** Routes as cards: the stops as a small path, whether the route passed a run, and what still blocks scheduling. */
export default function StaffManageRouteCatalogPage() {
  const [page, setPage] = useState(1)
  const [active, setActive] = useState(true)
  const [outcome, setOutcome] = useState('')
  const client = useQueryClient()
  const routes = useQuery({ queryKey: ['versioned-routes', page, active], queryFn: () => versionedRoutesApi.list(page, active) })
  const maps = useMapVersions()
  const availability = useMutation({
    // Stopping a route happens on its detail page, with the scheduled Tours in view; here a stopped route only reopens.
    mutationFn: ({ route, requestId }: { route: VersionedRoute; requestId: string }) => versionedRoutesApi.setAvailability(route, requestId, true),
    onSuccess: async (_, { route }) => {
      setOutcome(`Đã mở lại tuyến ${route.name}.`)
      await Promise.all([client.invalidateQueries({ queryKey: ['versioned-routes'] }), client.invalidateQueries({ queryKey: tourKeys.all })])
    },
  })
  const pickFilter = (next: boolean) => { setActive(next); setPage(1); setOutcome('') }
  return <AdminPage>
    <PageHeader eyebrow="Nội dung tham quan" title="Danh mục tuyến" description="Xem lộ trình, các điểm tham quan và trạng thái kiểm chứng của từng tuyến."
      action={<Link to="/staff/manage/routes/new" className={buttonClass('primary')}><Plus size={15} aria-hidden="true" />Tạo tuyến</Link>} />
    <p className="mb-3 text-[13px] text-[#64748b]">Chỉ tuyến đã chạy thử đạt mới tạo được Tour.</p>
    {outcome && <div className="mb-3"><Notice tone="success">{outcome}</Notice></div>}
    {availability.isError && <div className="mb-3"><Notice tone="danger">{routeAvailabilityError(availability.error)}</Notice></div>}
    <section className={`${panelClass} overflow-hidden`} aria-label="Danh mục tuyến">
      <div className="border-b border-[#eef1f4] px-3 py-2">
        <div role="group" aria-label="Lọc theo tình trạng sử dụng" className="inline-flex gap-0.5 rounded-[10px] bg-[#eef2f6] p-[3px]">
          {([[true, 'Đang sử dụng'], [false, 'Ngừng sử dụng']] as const).map(([value, label]) => <button key={label} type="button" aria-pressed={active === value} onClick={() => pickFilter(value)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${active === value ? 'bg-white text-[#173b59] shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-[#475569]'}`}>{label}</button>)}
        </div>
      </div>
      {routes.isPending ? <SkeletonRows rows={4} /> : routes.error ? <AdminErrorPanel title="Không tải được danh mục tuyến." onRetry={() => void routes.refetch()} /> : !routes.data?.data.length ? <EmptyState title={active ? 'Chưa có tuyến nào' : 'Không có tuyến ngừng sử dụng'} action={active ? <Link to="/staff/manage/routes/new" className={buttonClass('primary')}>Tạo tuyến</Link> : undefined} /> :
        <div className="grid gap-3 p-3 md:grid-cols-2 2xl:grid-cols-3">{routes.data.data.map(route => {
          const tone = staffRouteStatus(route)
          const area = maps.data?.find(item => item.map.id === route.mapVersionId)?.map.areaName
          return <article key={route.routeId} className="grid content-start gap-3 rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-3 transition-colors hover:border-[#c9dcec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0"><Link to={`/staff/manage/routes/${route.routeId}`} className="block text-[15px] font-semibold text-[#173b59] hover:underline">{route.name}</Link><small className="block text-xs text-[#64748b]">{area && `${area} · `}{route.stops.length} điểm dừng</small></span>
              <span className="flex shrink-0 flex-col items-end gap-1"><span className={`rounded-full border px-2 py-px text-[11px] font-bold ${tone.chip}`}>{tone.label}</span><ScheduleFitBadge route={route} /></span>
            </span>
            <span className="flex items-center" aria-hidden="true">{route.stops.map((stop, i) => <span key={stop.poiRevisionId} className="flex flex-1 items-center last:flex-none">{i > 0 && <i className="h-0.5 flex-1 bg-[#c9dfee]" />}<span className="size-2.5 shrink-0 rounded-full bg-[#7db9db]" title={stop.name} /></span>)}</span>
            {route.eligibilityIssues.length > 0 && <small className="text-xs text-[#8a5a06]">{route.eligibilityIssues.length} điều kiện chưa đạt để lập lịch</small>}
            {!route.isActive && <span><button type="button" className={buttonClass('secondary', 'sm')} disabled={availability.isPending} onClick={() => { setOutcome(''); availability.mutate({ route, requestId: crypto.randomUUID() }) }}>Mở lại</button></span>}
          </article>
        })}</div>}
      {routes.isSuccess && <Pagination page={page} pageCount={Math.max(1, routes.data.pagination.totalPages)} total={routes.data.pagination.totalItems} pageSize={100} onPage={setPage} label="Phân trang tuyến" />}
    </section>
  </AdminPage>
}
