import { Link, useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@tanstack/react-query'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { revisionTone } from '../../../features/administration/routes/route-messages'
import { versionedRoutesApi, type VersionedRoute } from '../../../features/administration/routes/versioned-api'
import { Note } from '../../../features/technical/TechnicalUi'
import { ApiError } from '../../../api/client'
import { notify } from '../../../components/ui/toast-store'

function submitMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Không gửi được tuyến. Kiểm tra kết nối rồi thử lại.'
  if (error.status === 400) return 'Tuyến chưa hợp lệ hoặc còn thiếu điều kiện để gửi kiểm chứng.'
  if (error.status === 409 && error.body.includes('TECHNICAL_CHECK_')) return 'Bản đồ của tuyến không còn kiểm tra kỹ thuật đạt nên chưa gửi được. Nhờ Kỹ thuật kiểm tra lại bản đồ rồi thử lại.'
  if (error.status === 409) return 'Phiên bản hoặc dữ liệu nguồn đã thay đổi. Tải lại và xem nội dung mới trước khi gửi lại.'
  if (error.status >= 500) return 'Máy chủ chưa xử lý được yêu cầu. Chưa xác nhận tuyến đã được gửi.'
  return 'Không gửi được tuyến. Kiểm tra quyền và dữ liệu rồi thử lại.'
}

/** What this revision is waiting for, in one sentence. */
function nextStep(route: VersionedRoute) {
  if (!route.isSubmitted) return 'Đây là bản nháp. Kiểm tra lại các điểm dừng rồi bấm Gửi kiểm chứng tuyến để Kỹ thuật chạy thử.'
  if (route.verificationStatus === 'PASS') return 'Kỹ thuật đã chạy thử toàn tuyến và ghi nhận đạt.'
  if (route.verificationStatus === 'FAIL') return 'Kỹ thuật ghi nhận chạy thử không đạt. Tạo phiên bản mới để chỉnh tuyến rồi gửi lại.'
  return 'Đã gửi kiểm chứng. Đang chờ Kỹ thuật chạy thử toàn tuyến trên robot và ghi kết quả.'
}

const formatDuration = (seconds: number) => seconds < 60 ? `${seconds} giây` : `${Math.floor(seconds / 60)} phút${seconds % 60 ? ` ${seconds % 60} giây` : ''}`

function RevisionChip({ submitted, status }: { submitted: boolean; status: string }) {
  const tone = revisionTone(submitted, status)
  return <span className={`inline-flex rounded-full border px-2 py-px text-[11px] font-bold whitespace-nowrap ${tone.chip}`}>{tone.label}</span>
}

export default function StaffManageRouteDetailsPage() {
  const { routeId } = useParams()
  const [searchParams] = useSearchParams()
  const revisionId = searchParams.get('revisionId') ?? undefined
  const client = useQueryClient()
  const route = useQuery({ queryKey: ['versioned-routes', routeId, revisionId], queryFn: () => versionedRoutesApi.get(routeId!, revisionId), enabled: Boolean(routeId) })
  const value = route.data
  const submitMutation = useMutation({ mutationFn: versionedRoutesApi.submit,
    onSuccess: (_, submitted) => {
      notify({ title: `Đã gửi kiểm chứng tuyến “${submitted.name}”`, detail: 'Chờ kỹ thuật chạy thử. Đây chưa phải kết quả kiểm chứng hay trạng thái READY.' })
      return client.invalidateQueries({ queryKey: ['versioned-routes'], refetchType: 'all' })
    } })
  if (route.isPending) return <AdminPage><p className="p-8">Đang tải tuyến…</p></AdminPage>
  if (route.error || !value) return <AdminPage><p role="alert" className="p-4 text-sm text-red-700">Không tải được tuyến.</p></AdminPage>
  const latestRevisionNumber = Math.max(...value.revisionHistory.map(revision => revision.revisionNumber), value.revisionNumber)
  const isCurrentRevision = value.revisionNumber === latestRevisionNumber && value.revisionHistory.some(revision => revision.revisionId === value.revisionId && revision.revisionNumber === latestRevisionNumber)
  const hasUnverifiedPoi = value.eligibilityIssues.some(issue => issue.startsWith('POI_VERIFICATION_REQUIRED:'))
  const canSubmit = isCurrentRevision && !value.isSubmitted && !hasUnverifiedPoi && !submitMutation.isPending
  const reload = async () => { submitMutation.reset(); await route.refetch() }
  return <AdminPage>
    <Link to="/staff/manage/routes" className="mb-3 inline-flex text-sm text-[#2d719e]">← Danh sách tuyến</Link>
    <PageHeader eyebrow={`Tuyến · Phiên bản ${value.revisionNumber}`} title={value.name} description={value.description ?? 'Chưa có mô tả.'} action={<div className="flex flex-wrap gap-2"><Link className={buttonClass('secondary')} to={`/staff/manage/routes/${value.routeId}/edit`}>Tạo phiên bản mới</Link>{!value.isSubmitted && isCurrentRevision && <button className={buttonClass('primary')} disabled={!canSubmit} onClick={() => void submitMutation.mutateAsync(value).catch(() => undefined)}>{submitMutation.isPending ? 'Đang gửi…' : 'Gửi kiểm chứng tuyến'}</button>}</div>} />
    <div className="mb-4 space-y-2">
      {!isCurrentRevision && <Notice tone="warn">Đây là phiên bản cũ, chỉ xem được. Hãy mở phiên bản mới nhất để gửi kiểm chứng.</Notice>}
      {isCurrentRevision && hasUnverifiedPoi && <Notice tone="warn">Chưa gửi kiểm chứng được vì có POI không còn kết quả đạt. Tạo phiên bản mới với các POI đã đạt.</Notice>}
      {isCurrentRevision && !hasUnverifiedPoi && <div role={submitMutation.isSuccess ? 'status' : undefined}><Note>{nextStep(value)}</Note></div>}
      {submitMutation.isError && <Notice tone="danger" action={submitMutation.error instanceof ApiError && submitMutation.error.status === 409 ? <button className={buttonClass('secondary', 'sm')} disabled={route.isFetching} onClick={() => void reload()}>Tải lại phiên bản</button> : undefined}>{submitMessage(submitMutation.error)}</Notice>}
      <Notice tone="warn">{value.durationStatus === 'INCOMPLETE_CONTENT_AUDIO_DATA' ? 'Chưa xếp lịch Tour được: hệ thống chưa có thời lượng nội dung/audio đã duyệt.' : 'Chưa xếp lịch Tour được: tuyến chưa đủ các điều kiện lập lịch.'}</Notice>
    </div>
    <section className={`${panelClass} p-4`} aria-label="Tổng quan tuyến">
      <dl className="grid gap-3 sm:grid-cols-4">
        <div><dt className="text-xs text-[#64748b]">Trạng thái</dt><dd className="mt-1"><RevisionChip submitted={value.isSubmitted} status={value.verificationStatus} /></dd></div>
        <div className="min-w-0"><dt className="text-xs text-[#64748b]">Bản đồ</dt><dd className="mt-0.5 break-words font-mono text-[13px]">{value.mapKey}</dd></div>
        <div><dt className="text-xs text-[#64748b]">Số điểm dừng</dt><dd className="mt-0.5">{value.stops.length}</dd></div>
        <div><dt className="text-xs text-[#64748b]">Tổng thời gian dừng</dt><dd className="mt-0.5">{formatDuration(value.dwellDurationSeconds)}</dd></div>
      </dl>
    </section>
    <section className={`${panelClass} mt-4 p-4`} aria-label="Các điểm dừng">
      <h2 className="font-semibold">Các điểm dừng</h2>
      <ol className="mt-2 divide-y divide-[#eef1f4]">{value.stops.map(stop => <li className="flex items-center gap-3 py-2.5" key={stop.poiRevisionId}>
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#173b5f] text-xs font-semibold text-white">{stop.stopOrder}</span>
        <span className="min-w-0 flex-1 break-words font-medium text-[#0f172a]">{stop.name}</span>
        <span className="shrink-0 text-[13px] text-[#64748b]">Dừng {formatDuration(stop.dwellSeconds)}</span>
      </li>)}</ol>
      <details className="mt-2 text-xs text-[#64748b]">
        <summary className="cursor-pointer">Thông tin kỹ thuật</summary>
        <p className="mt-2 break-all">Bản đồ {value.mapVersionId}</p>
        <ul className="mt-2 space-y-2">{value.stops.map(stop => <li key={stop.poiRevisionId} className="break-all"><span className="font-medium text-[#334155]">{stop.stopOrder}. {stop.name}</span>: tọa độ {stop.x}, {stop.y}, {stop.yaw}. POI revision {stop.poiRevisionId}. Kết quả kiểm chứng {stop.sourcePoiVerificationRecordId}.</li>)}</ul>
      </details>
    </section>
    <section className={`${panelClass} mt-4 p-4`} aria-label="Lịch sử phiên bản">
      <h2 className="font-semibold">Lịch sử phiên bản</h2>
      <ol className="mt-2 space-y-2">{value.revisionHistory.map(revision => <li key={revision.revisionId} className="flex flex-wrap items-center gap-2 text-sm">
        {revision.revisionId === value.revisionId ? <span className="font-medium">Phiên bản {revision.revisionNumber} (đang xem)</span> : <Link className="text-[#2d719e]" to={`/staff/manage/routes/${value.routeId}?revisionId=${revision.revisionId}`}>Phiên bản {revision.revisionNumber}</Link>}
        <RevisionChip submitted={revision.isSubmitted} status={revision.verificationStatus} />
      </li>)}</ol>
    </section>
  </AdminPage>
}
