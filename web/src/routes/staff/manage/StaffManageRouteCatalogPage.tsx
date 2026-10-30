import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { PageHeader, Pagination, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, EmptyState, Notice, SkeletonRows } from '../../../features/administration/AdminUi'
import { versionedRoutesApi } from '../../../features/administration/routes/versioned-api'

/** A revision's state as words and colour: draft, submitted and waiting, passed, failed. */
function revisionTone(submitted: boolean, status: string) {
  if (!submitted) return { label: 'Bản nháp', chip: 'border-[#dbe6f4] bg-[#f6f9fd] text-[#5d7085]' }
  if (status === 'PASS') return { label: 'Đã kiểm chứng', chip: 'border-[#cde9dc] bg-[#effbf5] text-[#1f7a55]' }
  if (status === 'FAIL') return { label: 'Không đạt', chip: 'border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31]' }
  return { label: 'Chờ kiểm chứng', chip: 'border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06]' }
}

/** Routes as cards: the stops as a small path, every revision as a chip, and what still blocks scheduling. */
export default function StaffManageRouteCatalogPage() {
  const [page, setPage] = useState(1)
  const routes = useQuery({ queryKey: ['versioned-routes', page], queryFn: () => versionedRoutesApi.list(page) })
  return <AdminPage>
    <PageHeader eyebrow="Chuẩn bị Tour · Tuyến" title="Danh mục tuyến" description="Xem lộ trình, các điểm tham quan và trạng thái kiểm chứng của từng tuyến."
      action={<Link to="/staff/manage/routes/new" className={buttonClass('primary')}><Plus size={15} aria-hidden="true" />Tạo tuyến</Link>} />
    <div className="mb-3"><Notice tone="warn">Tuyến đã lưu hoặc đã chạy thử chưa đủ để lập lịch Tour. Chức năng lập lịch từ phiên bản tuyến mới chưa được hỗ trợ.</Notice></div>
    <section className={`${panelClass} overflow-hidden`} aria-label="Danh mục tuyến">
      {routes.isPending ? <SkeletonRows rows={4} /> : routes.error ? <AdminErrorPanel title="Không tải được danh mục tuyến." onRetry={() => void routes.refetch()} /> : !routes.data?.data.length ? <EmptyState title="Chưa có tuyến nào" action={<Link to="/staff/manage/routes/new" className={buttonClass('primary')}>Tạo tuyến</Link>} /> :
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
          </article>
        })}</div>}
      {routes.isSuccess && <Pagination page={page} pageCount={Math.max(1, routes.data.pagination.totalPages)} total={routes.data.pagination.totalItems} pageSize={100} onPage={setPage} label="Phân trang tuyến" />}
    </section>
  </AdminPage>
}
