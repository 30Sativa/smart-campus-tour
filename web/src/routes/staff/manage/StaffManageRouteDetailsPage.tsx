import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { passedAt, routeAvailabilityError, scheduleFitLabel, staffRouteStatus } from '../../../features/administration/routes/route-messages'
import { campusShortDate, campusShortStamp } from '../../../features/administration/tours/tour-calendar'
import { ScheduleFitBadge } from '../../../features/administration/routes/ScheduleFitBadge'
import { versionedRoutesApi, type VersionedRoute } from '../../../features/administration/routes/versioned-api'
import { DeactivateRouteDialog } from '../../../features/administration/routes/DeactivateRouteDialog'
import { RouteMap } from '../../../features/administration/routes/RouteMap'
import { tourKeys } from '../../../features/administration/tours/hooks'
import { mapAreaName } from '../../../features/administration/map-labels'
import { useMapVersions } from '../../../features/technical/technical-hooks'
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

type RouteNotice = { tone: 'info' | 'warn' | 'ok'; text: string; createTour?: boolean; reopen?: boolean }

/**
 * The one thing this revision waits for, and who does it, in the order Tour create checks it
 * (ADR-0037 availability, ADR-0034 effective PASS, ADR-0035 measurement basis). Guidance only:
 * create still checks the map, robot and slot. `durationStatus` is not used, because the server
 * always reports it as incomplete and it no longer decides scheduling.
 */
function routeNotice(route: VersionedRoute, hasUnverifiedPoi: boolean): RouteNotice {
  if (!route.isActive) return { tone: 'warn', text: 'Tuyến đang ngừng sử dụng nên chưa tạo được Tour mới. Mở lại tuyến để dùng.', reopen: true }
  if (!route.isSubmitted) return hasUnverifiedPoi
    ? { tone: 'warn', text: 'Chưa gửi kiểm chứng được vì có POI không còn kết quả đạt. Staff sửa tuyến để chỉ dùng các POI đã đạt.' }
    : { tone: 'info', text: 'Đây là bản nháp. Staff kiểm tra lại các điểm dừng rồi bấm Gửi kiểm chứng tuyến để Kỹ thuật chạy thử.' }
  if (route.verificationStatus === 'FAIL') return { tone: 'warn', text: 'Kỹ thuật ghi nhận chạy thử không đạt. Staff sửa tuyến rồi gửi kiểm chứng lại.' }
  if (route.verificationStatus !== 'PASS') return { tone: 'info', text: 'Đã gửi kiểm chứng. Đang chờ Kỹ thuật chạy thử toàn tuyến trên robot và ghi kết quả.' }
  const effective = route.testRuns.find(run => run.id === route.effectiveTestRunId)
  if ((effective && !effective.measurementBasis) || route.scheduleFit === 'UNKNOWN')
    return { tone: 'warn', text: 'Cần chạy thử lại: lần chạy thử đạt được đo theo định nghĩa cũ. Kỹ thuật cần chạy thử lại toàn tuyến trước khi tạo được Tour.' }
  if (route.scheduleFit === 'TOO_LONG_FOR_SHIFT') return { tone: 'warn', text: `Chưa tạo được Tour: ${scheduleFitLabel(route)!.detail} Staff sửa tuyến cho ngắn hơn rồi gửi chạy thử lại.` }
  return { tone: 'ok', text: 'Dùng được để tạo Tour. Khi tạo, hệ thống còn kiểm tra bản đồ, robot và ca.', createTour: true }
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
  const maps = useMapVersions()
  const [deactivating, setDeactivating] = useState<VersionedRoute | null>(null)
  const availability = useMutation({
    // A retry after a lost reply reuses this id, so the server does not count it twice.
    mutationFn: ({ target, requestId, open }: { target: VersionedRoute; requestId: string; open: boolean }) => versionedRoutesApi.setAvailability(target, requestId, open),
    onSuccess: async (result, { target }) => {
      setDeactivating(null)
      notify({ title: result.isActive ? `Đã mở lại tuyến ${target.name}.` : `Đã ngừng sử dụng tuyến ${target.name}.`,
        detail: !result.isActive && result.scheduledTours.length ? `${result.scheduledTours.length} Tour đã lên lịch vẫn giữ tuyến này.` : undefined })
      await Promise.all([client.invalidateQueries({ queryKey: ['versioned-routes'], refetchType: 'all' }), client.invalidateQueries({ queryKey: tourKeys.all })])
    },
  })
  if (route.isPending) return <AdminPage><p className="p-8">Đang tải tuyến…</p></AdminPage>
  if (route.error || !value) return <AdminPage><p role="alert" className="p-4 text-sm text-red-700">Không tải được tuyến.</p></AdminPage>
  const latestRevisionNumber = Math.max(...value.revisionHistory.map(revision => revision.revisionNumber), value.revisionNumber)
  const isCurrentRevision = value.revisionNumber === latestRevisionNumber && value.revisionHistory.some(revision => revision.revisionId === value.revisionId && revision.revisionNumber === latestRevisionNumber)
  const hasUnverifiedPoi = value.eligibilityIssues.some(issue => issue.startsWith('POI_VERIFICATION_REQUIRED:'))
  const notice = isCurrentRevision ? routeNotice(value, hasUnverifiedPoi) : null
  const area = mapAreaName(maps.data, { mapVersionId: value.mapVersionId })
  const start = { x: value.startX, y: value.startY }
  const end = value.endMode === 'POSE' && value.endX != null && value.endY != null ? { x: value.endX, y: value.endY } : null
  const canSubmit = isCurrentRevision && !value.isSubmitted && !hasUnverifiedPoi && !submitMutation.isPending
  const reload = async () => { submitMutation.reset(); await route.refetch() }
  const viewedAt = value.revisionHistory.find(revision => revision.revisionId === value.revisionId)?.createdAt
  const status = staffRouteStatus(value)
  return <AdminPage>
    <Link to="/staff/manage/routes" className="mb-3 inline-flex text-sm text-[#2d719e]">← Danh sách tuyến</Link>
    <PageHeader eyebrow="Tuyến" title={value.name} description={statusLine(value)} action={<div className="flex max-w-sm flex-col items-end gap-1.5"><div className="flex flex-wrap justify-end gap-2"><Link className={buttonClass('secondary')} to={`/staff/manage/routes/${value.routeId}/edit`}>Sửa tuyến</Link>{value.isActive && isCurrentRevision && <button type="button" className={buttonClass('secondary')} onClick={() => { availability.reset(); setDeactivating(value) }}>Ngừng sử dụng</button>}{!value.isSubmitted && isCurrentRevision && <button className={buttonClass('primary')} disabled={!canSubmit} onClick={() => void submitMutation.mutateAsync(value).catch(() => undefined)}>{submitMutation.isPending ? 'Đang gửi…' : 'Gửi kiểm chứng tuyến'}</button>}</div><p className="text-right text-xs text-[#64748b]">Lưu sẽ tạo bản mới; bản mới cần gửi kiểm chứng và chạy thử lại. Tour đã tạo vẫn dùng bản cũ.</p></div>} />
    <div className="mb-4 space-y-2">
      {!isCurrentRevision && <Notice tone="warn">{viewedAt ? `Đây là bản lưu ${campusShortStamp(viewedAt)}, chỉ xem được.` : 'Đây là bản lưu cũ, chỉ xem được.'}</Notice>}
      {notice && <div role={submitMutation.isSuccess ? 'status' : undefined}><Note tone={notice.tone}><div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1">{notice.text}</p>
        {notice.createTour && <Link to="/staff/manage/tours/new" className={buttonClass('secondary', 'sm')}>Tạo Tour</Link>}
        {notice.reopen && <button type="button" className={buttonClass('secondary', 'sm')} disabled={availability.isPending} onClick={() => availability.mutate({ target: value, requestId: crypto.randomUUID(), open: true })}>Mở lại</button>}
      </div></Note></div>}
      {submitMutation.isError && <Notice tone="danger" action={submitMutation.error instanceof ApiError && submitMutation.error.status === 409 ? <button className={buttonClass('secondary', 'sm')} disabled={route.isFetching} onClick={() => void reload()}>Tải lại tuyến</button> : undefined}>{submitMessage(submitMutation.error)}</Notice>}
      {availability.isError && !deactivating && <Notice tone="danger">{routeAvailabilityError(availability.error)}</Notice>}
    </div>
    <section className={`${panelClass} p-4`} aria-label="Tổng quan tuyến">
      <dl className="grid gap-3 sm:grid-cols-4">
        <div className="min-w-0 sm:col-span-4"><dt className="text-xs text-[#64748b]">Mô tả</dt><dd className="mt-0.5 break-words">{value.description ?? 'Chưa có mô tả.'}</dd></div>
        <div><dt className="text-xs text-[#64748b]">Trạng thái</dt><dd className="mt-1 flex flex-wrap gap-1"><span className={`inline-flex rounded-full border px-2 py-px text-[11px] font-bold whitespace-nowrap ${status.chip}`}>{status.label}</span><ScheduleFitBadge route={value} /></dd></div>
        <div className="min-w-0"><dt className="text-xs text-[#64748b]">Bản đồ</dt><dd className="mt-0.5 break-words">{area ?? (maps.isPending ? 'Đang tải…' : '-')}</dd></div>
        <div><dt className="text-xs text-[#64748b]">Số điểm dừng</dt><dd className="mt-0.5">{value.stops.length}</dd></div>
        <div><dt className="text-xs text-[#64748b]">Tổng thời gian dừng</dt><dd className="mt-0.5">{formatDuration(value.dwellDurationSeconds)}</dd></div>
      </dl>
    </section>
    <section className={`${panelClass} mt-4 p-4`} aria-label="Các điểm dừng">
      <h2 className="font-semibold">Các điểm dừng</h2>
      <div className="mt-2 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <ol className="divide-y divide-[#eef1f4]">{value.stops.map(stop => <li className="flex items-center gap-3 py-2.5" key={stop.poiRevisionId}>
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#173b5f] text-xs font-semibold text-white">{stop.stopOrder}</span>
          <span className="min-w-0 flex-1 break-words font-medium text-[#0f172a]">{stop.name}</span>
          <span className="shrink-0 text-[13px] text-[#64748b]">Dừng {formatDuration(stop.dwellSeconds)}</span>
        </li>)}</ol>
        <RouteMap mapVersionId={value.mapVersionId} start={start} end={end}
          stops={[...value.stops].sort((a, b) => a.stopOrder - b.stopOrder).map(stop => ({ id: stop.poiRevisionId, name: stop.name, x: stop.x, y: stop.y }))} />
      </div>
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
    {deactivating && <DeactivateRouteDialog route={deactivating} busy={availability.isPending} error={availability.isError ? routeAvailabilityError(availability.error) : null}
      onConfirm={requestId => availability.mutate({ target: deactivating, requestId, open: false })} onCancel={() => { availability.reset(); setDeactivating(null) }} />}
  </AdminPage>
}
