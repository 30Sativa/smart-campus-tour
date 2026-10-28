import { Link, useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { versionedRoutesApi } from '../../../features/administration/routes/versioned-api'

export default function StaffManageRouteDetailsPage() {
  const { routeId } = useParams()
  const [searchParams] = useSearchParams()
  const revisionId = searchParams.get('revisionId') ?? undefined
  const client = useQueryClient()
  const route = useQuery({ queryKey: ['versioned-routes', routeId, revisionId], queryFn: () => versionedRoutesApi.get(routeId!, revisionId), enabled: Boolean(routeId) })
  const value = route.data
  const submit = async () => {
    if (!value) return
    await versionedRoutesApi.submit(value)
    await Promise.all([client.invalidateQueries({ queryKey: ['versioned-routes'] }), client.invalidateQueries({ queryKey: ['versioned-routes', routeId] })])
  }
  if (route.isPending) return <AdminPage><p className="p-8">Đang tải revision tuyến…</p></AdminPage>
  if (route.error || !value) return <AdminPage><p role="alert" className="p-4 text-sm text-red-700">Không tải được revision tuyến.</p></AdminPage>
  return <AdminPage>
    <Link to="/staff/manage/routes" className="mb-3 inline-flex text-sm text-[#2d719e]">← Danh sách tuyến versioned</Link>
    <PageHeader eyebrow={`Route revision ${value.revisionNumber}`} title={value.name} description={value.description ?? 'Tuyến versioned'} action={<div className="flex gap-2"><Link className={buttonClass('secondary')} to={`/staff/manage/routes/${value.routeId}/edit`}>Tạo revision mới</Link>{!value.isSubmitted && <button className={buttonClass('primary')} onClick={() => void submit()}>Gửi kiểm chứng tuyến</button>}</div>} />
    <div className="mb-4"><Notice tone="warn">{value.durationStatus === 'INCOMPLETE_CONTENT_AUDIO_DATA' ? 'Thiếu nguồn thời lượng nội dung/audio đã được duyệt. Test-run không hoàn thành duration và tuyến chưa đủ điều kiện lập lịch.' : 'Tuyến chưa đủ điều kiện lập lịch cho đến khi mọi gate mục tiêu được hỗ trợ.'}</Notice></div>
    <section className={`${panelClass} p-4`}><dl className="grid gap-3 sm:grid-cols-3"><div><dt className="text-xs text-[#64748b]">Map version</dt><dd>{value.mapKey} · {value.mapVersionId}</dd></div><div><dt className="text-xs text-[#64748b]">Trạng thái test</dt><dd>{value.verificationStatus}</dd></div><div><dt className="text-xs text-[#64748b]">Tổng dwell</dt><dd>{value.dwellDurationSeconds}s</dd></div></dl>
      <ol className="mt-4 divide-y">{value.stops.map(stop => <li className="py-3" key={stop.poiRevisionId}><b>{stop.stopOrder}. {stop.name}</b><p className="text-xs text-[#64748b]">PoiRevisionId {stop.poiRevisionId} · verification {stop.sourcePoiVerificationRecordId} · {stop.x}, {stop.y}, {stop.yaw} · dwell {stop.dwellSeconds}s</p></li>)}</ol>
    </section>
    <section className={`${panelClass} mt-4 p-4`}><h2 className="font-semibold">Lịch sử revision</h2><ol className="mt-2 space-y-2">{value.revisionHistory.map(revision => <li key={revision.revisionId}><Link className="text-[#2d719e]" to={`/staff/manage/routes/${value.routeId}?revisionId=${revision.revisionId}`}>r{revision.revisionNumber}</Link> · {revision.isSubmitted ? 'đã gửi' : 'nháp'} · {revision.verificationStatus} · map {revision.mapVersionId}</li>)}</ol></section>
    {route.error && <p role="alert" className="mt-3 text-sm text-red-700">Không thể tải revision.</p>}
  </AdminPage>
}
