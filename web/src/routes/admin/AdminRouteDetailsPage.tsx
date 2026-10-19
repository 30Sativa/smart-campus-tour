import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { AdminErrorPanel, AdminPage, Notice, SkeletonRows } from '../../features/administration/AdminUi'
import { useRoute, useRouteAction } from '../../features/administration/routes/hooks'
import { routeError, routeIssue } from '../../features/administration/routes/route-messages'

const HEAD_LABEL = { FRONT: 'Nhìn trước', LEFT: 'Nhìn trái', RIGHT: 'Nhìn phải' }
export default function AdminRouteDetailsPage() {
  const { routeId } = useParams()
  const navigate = useNavigate()
  const detail = useRoute(routeId)
  const mutation = useRouteAction()
  const [action, setAction] = useState<'activate' | 'deactivate' | 'delete' | null>(null)
  const [success, setSuccess] = useState('')
  const route = detail.data
  if (detail.isError) return <AdminPage><AdminErrorPanel title={routeError(detail.error)} onRetry={() => void detail.refetch()} /></AdminPage>
  if (!route) return <AdminPage><SkeletonRows rows={5} /></AdminPage>
  const confirm = async () => {
    if (!action) return
    try {
      await mutation.mutateAsync({ route, action })
      setAction(null)
      if (action === 'delete') navigate('/admin/routes')
      else setSuccess(action === 'activate' ? 'Đã cho phép chọn tuyến cho Tour mới.' : 'Đã vô hiệu hóa tuyến cho lựa chọn mới. Tour hiện có giữ nguyên hành trình.')
    } catch { /* The dialog retains the mutation error and submitted version. */ }
  }
  return <AdminPage>
    <Link to="/admin/routes" className="mb-4 inline-block text-sm text-[#2d719e]">← Danh sách tuyến</Link>
    <PageHeader eyebrow="Chi tiết tuyến" title={route.name} description={route.description ?? 'Cấu hình hành trình tham quan.'} action={<div className="flex flex-wrap gap-2">
      <Link to={`/admin/routes/new?copyFrom=${route.id}`} className={buttonClass('secondary')}>Sao chép thành tuyến mới</Link>
      {route.usage.canEditMetadataAndAvailability && <Link to={`/admin/routes/${route.id}/edit`} className={buttonClass('primary')}>Chỉnh sửa</Link>}
    </div>} />
    {success && <div className="mb-4" role="status"><Notice tone="success">{success}</Notice></div>}
    <div className="mb-4"><Notice tone="warn">{route.isActive ? 'Khả dụng cho lựa chọn mới.' : 'Không khả dụng cho lựa chọn mới.'} Cấu hình {route.configurationIssues.length ? 'còn lỗi dữ liệu' : 'hợp lệ về dữ liệu'}. Hệ thống chưa lưu xác nhận kiểm chứng vật lý; cần kiểm tra đường đi và điều kiện thực tế trước vận hành.</Notice></div>
    {route.usage.hasReferences && <div className="mb-4"><Notice tone="info">Cấu hình đã được tham chiếu nên bị khóa, kể cả Tour chưa chạy hoặc đã kết thúc. Sao chép tuyến để đổi hành trình.{route.usage.hasReadyOrRunningTours && ' Tour đã chốt hoặc đang chạy cũng khóa nội dung và trạng thái.'}</Notice></div>}
    {route.availabilityIssues.length > 0 && <ul className="mb-4 list-inside list-disc text-sm text-[#92400e]">{route.availabilityIssues.map(code => <li key={code}>{routeIssue(code)}</li>)}</ul>}
    <section className={`${panelClass} p-5`} aria-label="Cấu hình tuyến">
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div><dt className="text-[#64748b]">Map / frame</dt><dd>{route.mapKey} / {route.mapFrame}</dd></div>
        <div><dt className="text-[#64748b]">Bắt đầu (m, rad)</dt><dd>{route.startX}, {route.startY}, {route.startYaw}</dd></div>
        <div><dt className="text-[#64748b]">Kết thúc</dt><dd>{route.endMode === 'LAST_POI' ? 'Tại POI cuối' : `${route.endX}, ${route.endY}, ${route.endYaw} (m, rad)`}</dd></div>
      </dl>
      <ol className="mt-6 divide-y divide-[#e2e8f0]" aria-label="Điểm dừng theo thứ tự">{route.stops.map(stop => <li key={stop.id} className="py-4">
        <p className="font-semibold">{stop.stopOrder}. {stop.poiName}</p><p className="mt-1 text-sm text-[#64748b]">Dừng {stop.dwellSeconds} giây · {stop.headSteps.map(step => `${HEAD_LABEL[step.preset] ?? 'Góc nhìn cần kiểm tra'} ${step.holdSeconds}s`).join(', ')}</p>
      </li>)}</ol>
    </section>
    <div className="mt-5 flex flex-wrap gap-3">
      <button type="button" className={buttonClass('secondary')} disabled={!route.usage.canEditMetadataAndAvailability || mutation.isPending || (!route.isActive && route.availabilityIssues.length > 0)} onClick={() => { mutation.reset(); setAction(route.isActive ? 'deactivate' : 'activate') }}>{route.isActive ? 'Vô hiệu hóa' : 'Cho phép sử dụng'}</button>
      <button type="button" className={buttonClass('danger')} disabled={!route.usage.canDelete || mutation.isPending} onClick={() => { mutation.reset(); setAction('delete') }}>Xóa tuyến chưa dùng</button>
      <button type="button" className={buttonClass('ghost')} onClick={() => { setSuccess(''); void detail.refetch() }}>Tải lại</button>
    </div>
    <ConfirmationDialog open={action !== null} title={action === 'delete' ? 'Xóa tuyến?' : action === 'activate' ? 'Cho phép sử dụng tuyến?' : 'Vô hiệu hóa tuyến?'}
      description={action === 'delete' ? 'Chỉ xóa tuyến chưa được tham chiếu. Dữ liệu cấu hình tuyến sẽ bị xóa.' : 'Thao tác chỉ đổi khả dụng cho lựa chọn mới. Đây không phải xác nhận an toàn cho robot.'}
      confirmLabel="Xác nhận" withReason={false} tone={action === 'delete' ? 'danger' : 'default'} busy={mutation.isPending}
      error={mutation.isError ? routeError(mutation.error) : null} onCancel={() => { if (!mutation.isPending) setAction(null) }} onConfirm={() => void confirm()} />
  </AdminPage>
}
