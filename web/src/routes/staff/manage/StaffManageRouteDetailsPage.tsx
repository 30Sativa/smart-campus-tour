import { Link, useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@tanstack/react-query'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { passedAt, scheduleFitLabel, staffRouteStatus } from '../../../features/administration/routes/route-messages'
import { campusShortDate, campusShortStamp } from '../../../features/administration/tours/tour-calendar'
import { ScheduleFitBadge } from '../../../features/administration/routes/ScheduleFitBadge'
import { versionedRoutesApi, type VersionedRoute } from '../../../features/administration/routes/versioned-api'
import { Note } from '../../../features/technical/TechnicalUi'
import { ApiError } from '../../../api/client'
import { notify } from '../../../components/ui/toast-store'

function submitMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Không gửi được tuyến. Kiểm tra kết nối rồi thử lại.'
  if (error.status === 400) return 'Tuyến chưa hợp lệ hoặc còn thiếu điều kiện để gửi kiểm chứng.'
  if (error.status === 409 && error.body.includes('TECHNICAL_CHECK_')) return 'Bản đồ của tuyến không còn kiểm tra kỹ thuật đạt nên chưa gửi được. Nhờ Kỹ thuật kiểm tra lại bản đồ rồi thử lại.'
  if (error.status === 409) return 'Tuyến hoặc dữ liệu nguồn đã thay đổi. Tải lại và xem nội dung mới trước khi gửi lại.'
  if (error.status >= 500) return 'Máy chủ chưa xử lý được yêu cầu. Chưa xác nhận tuyến đã được gửi.'
  return 'Không gửi được tuyến. Kiểm tra quyền và dữ liệu rồi thử lại.'
}

/** What this revision is waiting for, in one sentence. */
function nextStep(route: VersionedRoute) {
  if (!route.isSubmitted) return 'Đây là bản nháp. Kiểm tra lại các điểm dừng rồi bấm Gửi kiểm chứng tuyến để Kỹ thuật chạy thử.'
  if (route.verificationStatus === 'PASS') return 'Kỹ thuật đã chạy thử toàn tuyến và ghi nhận đạt.'
  if (route.verificationStatus === 'FAIL') return 'Kỹ thuật ghi nhận chạy thử không đạt. Sửa tuyến rồi gửi lại.'
  return 'Đã gửi kiểm chứng. Đang chờ Kỹ thuật chạy thử toàn tuyến trên robot và ghi kết quả.'
}

/**
 * Whether Staff can start a Tour from this revision, in the order Tour create checks it
 * (ADR-0037 availability, ADR-0034 effective PASS, ADR-0035 measurement basis). Guidance only:
 * create still checks the map, robot and slot. `durationStatus` is not used, because the server
 * always reports it as incomplete and it no longer decides scheduling.
 */
function tourReadiness(route: VersionedRoute): { tone: 'warn' | 'success'; text: string } {
  if (!route.isActive) return { tone: 'warn', text: 'Tuyến đang ngừng sử dụng nên chưa tạo được Tour mới. Mở lại tuyến để dùng.' }
  if (route.verificationStatus !== 'PASS') return { tone: 'warn', text: 'Chưa tạo được Tour: tuyến cần một lần chạy thử toàn tuyến đạt.' }
  const effective = route.testRuns.find(run => run.id === route.effectiveTestRunId)
  if (effective && !effective.measurementBasis) return { tone: 'warn', text: 'Chưa tạo được Tour: lần chạy thử đạt được đo theo định nghĩa cũ. Nhờ Kỹ thuật chạy thử lại toàn tuyến.' }
  if (route.scheduleFit === 'TOO_LONG_FOR_SHIFT') return { tone: 'warn', text: `Chưa tạo được Tour: ${scheduleFitLabel(route)!.detail} Sửa tuyến cho ngắn hơn rồi chạy thử lại.` }
  return { tone: 'success', text: 'Dùng được để tạo Tour. Khi tạo, hệ thống còn kiểm tra bản đồ, robot và ca.' }
}

const formatDuration =(seconds: number) => seconds < 60 ? `${seconds} giây` : `${Math.floor(seconds / 60)} phút${seconds % 60 ? ` ${seconds % 60} giây` : ''}`

/** The one line under the title: the route's state, with the day of the run that passed it. */
function statusLine(route: VersionedRoute) {
  const { label } = staffRouteStatus(route)
  const passed = label === 'Đã chạy thử đạt' ? passedAt(route) : undefined
  return passed ? `${label} ngày ${campusShortDate(passed)}` : label
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
  const readiness = isCurrentRevision ? tourReadiness(value) : null
  const hasUnverifiedPoi = value.eligibilityIssues.some(issue => issue.startsWith('POI_VERIFICATION_REQUIRED:'))
  const canSubmit = isCurrentRevision && !value.isSubmitted && !hasUnverifiedPoi && !submitMutation.isPending
  const reload = async () => { submitMutation.reset(); await route.refetch() }
  const viewedAt = value.revisionHistory.find(revision => revision.revisionId === value.revisionId)?.createdAt
  const status = staffRouteStatus(value)
  return <AdminPage>
    <Link to="/staff/manage/routes" className="mb-3 inline-flex text-sm text-[#2d719e]">← Danh sách tuyến</Link>
    <PageHeader eyebrow="Tuyến" title={value.name} description={statusLine(value)} action={<div className="flex max-w-sm flex-col items-end gap-1.5"><div className="flex flex-wrap justify-end gap-2"><Link className={buttonClass('secondary')} to={`/staff/manage/routes/${value.routeId}/edit`}>Sửa tuyến</Link>{!value.isSubmitted && isCurrentRevision && <button className={buttonClass('primary')} disabled={!canSubmit} onClick={() => void submitMutation.mutateAsync(value).catch(() => undefined)}>{submitMutation.isPending ? 'Đang gửi…' : 'Gửi kiểm chứng tuyến'}</button>}</div><p className="text-right text-xs text-[#64748b]">Lưu sẽ tạo bản mới; bản mới cần gửi kiểm chứng và chạy thử lại. Tour đã tạo vẫn dùng bản cũ.</p></div>} />
    <div className="mb-4 space-y-2">
      {!isCurrentRevision && <Notice tone="warn">{viewedAt ? `Đây là bản lưu ${campusShortStamp(viewedAt)}, chỉ xem được.` : 'Đây là bản lưu cũ, chỉ xem được.'}</Notice>}
      {isCurrentRevision && hasUnverifiedPoi && <Notice tone="warn">Chưa gửi kiểm chứng được vì có POI không còn kết quả đạt. Sửa tuyến để chỉ dùng các POI đã đạt.</Notice>}
      {isCurrentRevision && !hasUnverifiedPoi && <div role={submitMutation.isSuccess ? 'status' : undefined}><Note>{nextStep(value)}</Note></div>}
      {submitMutation.isError && <Notice tone="danger" action={submitMutation.error instanceof ApiError && submitMutation.error.status === 409 ? <button className={buttonClass('secondary', 'sm')} disabled={route.isFetching} onClick={() => void reload()}>Tải lại tuyến</button> : undefined}>{submitMessage(submitMutation.error)}</Notice>}
      {readiness && <Notice tone={readiness.tone} action={readiness.tone === 'success' ? <Link to="/staff/manage/tours/new" className={buttonClass('secondary', 'sm')}>Tạo Tour</Link> : undefined}>{readiness.text}</Notice>}
    </div>
    <section className={`${panelClass} p-4`} aria-label="Tổng quan tuyến">
      <dl className="grid gap-3 sm:grid-cols-4">
        <div className="min-w-0 sm:col-span-4"><dt className="text-xs text-[#64748b]">Mô tả</dt><dd className="mt-0.5 break-words">{value.description ?? 'Chưa có mô tả.'}</dd></div>
        <div><dt className="text-xs text-[#64748b]">Trạng thái</dt><dd className="mt-1 flex flex-wrap gap-1"><span className={`inline-flex rounded-full border px-2 py-px text-[11px] font-bold whitespace-nowrap ${status.chip}`}>{status.label}</span><ScheduleFitBadge route={value} /></dd></div>
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
    <details className={`${panelClass} mt-4 p-4`} aria-label="Lịch sử thay đổi">
      <summary className="cursor-pointer font-semibold">Lịch sử thay đổi</summary>
      <ol className="mt-2 space-y-2">{value.revisionHistory.map(revision => {
        const viewing = revision.revisionId === value.revisionId
        const text = `Bản lưu ${campusShortStamp(revision.createdAt)} · ${staffRouteStatus(viewing ? value : revision).label}`
        return <li key={revision.revisionId} className="text-sm">
          {viewing ? <span className="font-medium">{text} (đang xem)</span> : <Link className="text-[#2d719e]" to={`/staff/manage/routes/${value.routeId}?revisionId=${revision.revisionId}`}>{text}</Link>}
        </li>
      })}</ol>
    </details>
  </AdminPage>
}
