import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { versionedRoutesApi } from '../../../features/administration/routes/versioned-api'

export default function StaffManageRouteCatalogPage() {
  const routes = useQuery({ queryKey: ['versioned-routes'], queryFn: () => versionedRoutesApi.list() })
  return <AdminPage>
    <PageHeader eyebrow="Chuẩn bị Tour · Tuyến" title="Danh sách tuyến versioned" description="Các tuyến mới luôn tham chiếu revision POI và map version chính xác."
      action={<Link to="/staff/manage/routes/new" className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo tuyến</Link>} />
    <div className="mb-4"><Notice tone="warn">Tour/Scheduling vẫn đang dùng luồng đọc legacy và chưa nhận route revision mới. Không thể lập lịch hoặc READY chỉ từ việc tuyến đã lưu hay có test-run.</Notice></div>
    <section className={`${panelClass} overflow-hidden`} aria-label="Danh sách tuyến versioned">
      {routes.isPending ? <p className="p-6">Đang tải…</p> : routes.error ? <p className="p-4 text-sm text-red-700" role="alert">Không tải được tuyến versioned.</p> : !routes.data?.data.length ? <p className="p-6 text-center text-sm text-[#64748b]">Chưa có tuyến versioned.</p> :
        <ul className="divide-y divide-[#e2e8f0]">{routes.data.data.map(route => <li key={route.routeId}><Link to={`/staff/manage/routes/${route.routeId}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-[#f8fafc]"><span><b>{route.name}</b><small className="mt-1 block text-[#64748b]">{route.mapKey} · {route.stops.length} POI · revision {route.revisionNumber}</small></span><span className="rounded-full border px-3 py-1 text-xs">{route.isSubmitted ? `Đã gửi · ${route.verificationStatus}` : 'Bản nháp'}</span></Link></li>)}</ul>}
    </section>
  </AdminPage>
}
