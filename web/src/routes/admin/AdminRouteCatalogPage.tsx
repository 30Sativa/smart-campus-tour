import { useState } from 'react'
import { CircleCheck, MapPin, TriangleAlert } from 'lucide-react'
import { PageHeader, PanelHead, panelClass } from '../../features/staff/StaffUi'
import { AdminErrorPanel, AdminPage, EmptyState, SkeletonRows } from '../../features/administration/AdminUi'
import { useAdminRoutes } from '../../features/administration/admin-hooks'
import { RoutePreview } from '../../features/administration/components/RoutePreview'

/**
 * Prepared routes, read-only (scope §3.1: no route editor in V1). Admin
 * looks here to choose a route for a Tour; the technical team owns the POIs,
 * poses, dwell, angles and narration.
 */
export default function AdminRouteCatalogPage() {
  const routes = useAdminRoutes()
  const [selected, setSelected] = useState<string | null>(null)
  const list = routes.data ?? []
  const current = list.find((route) => route.id === selected) ?? list[0] ?? null

  return (
    <AdminPage>
      <PageHeader eyebrow="Tuyến" title="Danh mục tuyến" description="Các tuyến nhóm kỹ thuật đã chuẩn bị. Chỉ xem: không sửa POI, tọa độ, góc quay hay thuyết minh trên web. Tuyến đang dùng cho Tour đã chốt hoặc đang chạy thì khóa." />
      {routes.isError ? (
        <AdminErrorPanel title="Không thể tải danh mục tuyến." onRetry={() => void routes.refetch()} />
      ) : routes.isLoading ? (
        <SkeletonRows rows={4} label="Đang tải danh mục tuyến" />
      ) : list.length === 0 ? (
        <div className={panelClass}><EmptyState title="Chưa có tuyến nào được chuẩn bị." description="Nhóm kỹ thuật cần cấu hình tuyến trước khi tạo Tour." /></div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <ul className="space-y-2" aria-label="Các tuyến">
            {list.map((route) => {
              const active = current?.id === route.id
              return (
                <li key={route.id}>
                  <button type="button" onClick={() => setSelected(route.id)} aria-pressed={active} className={`w-full rounded-2xl border bg-white p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9cc93a] ${active ? 'border-[#9cc93a] shadow-[0_0_0_3px_rgba(91,145,237,0.12)]' : 'border-[#e3e3dc] hover:border-[#cfe19c]'}`}>
                    <p className="font-bold text-[#1c1c1c]">{route.name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6b6e75]">
                      <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" />{route.stops.length} POI</span>
                      {route.valid ? <span className="inline-flex items-center gap-1 text-[#4d6410]"><CircleCheck size={12} aria-hidden="true" />Dùng được</span> : <span className="inline-flex items-center gap-1 font-bold text-[#92400e]"><TriangleAlert size={12} aria-hidden="true" />Chưa dùng được</span>}
                      {route.usedBy.length > 0 && <span>Đang dùng: {route.usedBy.join(', ')}</span>}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
          {current && (
            <section className={panelClass} aria-label={`Chi tiết ${current.name}`}>
              <PanelHead title="Chi tiết tuyến" description="Chỉ xem." />
              <div className="p-5"><RoutePreview route={current} /></div>
            </section>
          )}
        </div>
      )}
    </AdminPage>
  )
}
