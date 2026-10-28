import { Link, useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@tanstack/react-query'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { versionedRoutesApi } from '../../../features/administration/routes/versioned-api'
import { ApiError } from '../../../api/client'

function submitMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Không gửi được revision. Kiểm tra kết nối rồi thử lại.'
  if (error.status === 400) return 'Revision chưa hợp lệ hoặc còn thiếu điều kiện để gửi kiểm chứng.'
  if (error.status === 409) return 'Revision hoặc dữ liệu nguồn đã thay đổi. Tải lại và xem snapshot mới trước khi gửi lại.'
  if (error.status >= 500) return 'Máy chủ chưa xử lý được yêu cầu. Chưa xác nhận revision đã được gửi.'
  return 'Không gửi được revision. Kiểm tra quyền và dữ liệu rồi thử lại.'
}

export default function StaffManageRouteDetailsPage() {
  const { routeId } = useParams()
  const [searchParams] = useSearchParams()
  const revisionId = searchParams.get('revisionId') ?? undefined
  const client = useQueryClient()
  const route = useQuery({ queryKey: ['versioned-routes', routeId, revisionId], queryFn: () => versionedRoutesApi.get(routeId!, revisionId), enabled: Boolean(routeId) })
  const value = route.data
  const submitMutation = useMutation({ mutationFn: versionedRoutesApi.submit,
    onSuccess: () => client.invalidateQueries({ queryKey: ['versioned-routes'], refetchType: 'all' }) })
  if (route.isPending) return <AdminPage><p className="p-8">Đang tải revision tuyến…</p></AdminPage>
  if (route.error || !value) return <AdminPage><p role="alert" className="p-4 text-sm text-red-700">Không tải được revision tuyến.</p></AdminPage>
  const latestRevisionNumber = Math.max(...value.revisionHistory.map(revision => revision.revisionNumber), value.revisionNumber)
  const isCurrentRevision = value.revisionNumber === latestRevisionNumber && value.revisionHistory.some(revision => revision.revisionId === value.revisionId && revision.revisionNumber === latestRevisionNumber)
  const hasUnverifiedPoi = value.eligibilityIssues.some(issue => issue.startsWith('POI_VERIFICATION_REQUIRED:'))
  const canSubmit = isCurrentRevision && !value.isSubmitted && !hasUnverifiedPoi && !submitMutation.isPending
  const reload = async () => { submitMutation.reset(); await route.refetch() }
  return <AdminPage>
    <Link to="/staff/manage/routes" className="mb-3 inline-flex text-sm text-[#2d719e]">← Danh sách tuyến versioned</Link>
    <PageHeader eyebrow={`Route revision ${value.revisionNumber}`} title={value.name} description={value.description ?? 'Tuyến versioned'} action={<div className="flex gap-2"><Link className={buttonClass('secondary')} to={`/staff/manage/routes/${value.routeId}/edit`}>Tạo revision mới</Link>{!value.isSubmitted && isCurrentRevision && <button className={buttonClass('primary')} disabled={!canSubmit} onClick={() => void submitMutation.mutateAsync(value).catch(() => undefined)}>{submitMutation.isPending ? 'Đang gửi…' : 'Gửi kiểm chứng tuyến'}</button>}</div>} />
    {!isCurrentRevision && <div className="mb-4"><Notice tone="warn">Đây là revision lịch sử, chỉ xem được. Hãy mở revision hiện hành để gửi kiểm chứng.</Notice></div>}
    {isCurrentRevision && hasUnverifiedPoi && <div className="mb-4"><Notice tone="warn">Revision chưa đủ điều kiện gửi kiểm chứng vì POI nguồn chưa có xác nhận PASS còn hiệu lực.</Notice></div>}
    {submitMutation.isSuccess && <p role="status" className="mb-3 text-sm text-emerald-700">Yêu cầu gửi kiểm chứng đã được backend ghi nhận. Đây chưa phải kết quả kiểm chứng vật lý hoặc trạng thái READY.</p>}
    {submitMutation.isError && <div className="mb-4"><Notice tone="danger" action={submitMutation.error instanceof ApiError && submitMutation.error.status === 409 ? <button className={buttonClass('secondary', 'sm')} disabled={route.isFetching} onClick={() => void reload()}>Tải lại revision</button> : undefined}>{submitMessage(submitMutation.error)}</Notice></div>}
    <div className="mb-4"><Notice tone="warn">{value.durationStatus === 'INCOMPLETE_CONTENT_AUDIO_DATA' ? 'Thiếu nguồn thời lượng nội dung/audio đã được duyệt. Test-run không hoàn thành duration và tuyến chưa đủ điều kiện lập lịch.' : 'Tuyến chưa đủ điều kiện lập lịch cho đến khi mọi gate mục tiêu được hỗ trợ.'}</Notice></div>
    <section className={`${panelClass} p-4`}><dl className="grid gap-3 sm:grid-cols-3"><div><dt className="text-xs text-[#64748b]">Map version</dt><dd>{value.mapKey} · {value.mapVersionId}</dd></div><div><dt className="text-xs text-[#64748b]">Trạng thái test</dt><dd>{value.verificationStatus}</dd></div><div><dt className="text-xs text-[#64748b]">Tổng dwell</dt><dd>{value.dwellDurationSeconds}s</dd></div></dl>
      <ol className="mt-4 divide-y">{value.stops.map(stop => <li className="py-3" key={stop.poiRevisionId}><b>{stop.stopOrder}. {stop.name}</b><p className="text-xs text-[#64748b]">PoiRevisionId {stop.poiRevisionId} · verification {stop.sourcePoiVerificationRecordId} · {stop.x}, {stop.y}, {stop.yaw} · dwell {stop.dwellSeconds}s</p></li>)}</ol>
    </section>
    <section className={`${panelClass} mt-4 p-4`}><h2 className="font-semibold">Lịch sử revision</h2><ol className="mt-2 space-y-2">{value.revisionHistory.map(revision => <li key={revision.revisionId}><Link className="text-[#2d719e]" to={`/staff/manage/routes/${value.routeId}?revisionId=${revision.revisionId}`}>r{revision.revisionNumber}</Link> · {revision.isSubmitted ? 'đã gửi' : 'nháp'} · {revision.verificationStatus} · map {revision.mapVersionId}</li>)}</ol></section>
    {route.error && <p role="alert" className="mt-3 text-sm text-red-700">Không thể tải revision.</p>}
  </AdminPage>
}
