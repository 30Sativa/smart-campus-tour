import { useMemo, useState, type FormEvent } from 'react'
import { CircleCheck, CircleX, Clock3, LoaderCircle } from 'lucide-react'
import { PageHeader, PanelHead, StatStrip, StatTile, panelClass } from '../../components/ui/ConsolePrimitives'
import { Modal } from '../../components/ui/Drawer'
import { EmptyState } from '../../components/ui/EmptyState'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { expectedDurationText, failedCheckNames, hasScheduledToursOnPath, legCoverageText, missingLegsText, resultSource, revisionTone, routeChanges, sharedResultLine } from '../../features/administration/routes/route-messages'
import { campusShortStamp } from '../../features/administration/tours/tour-calendar'
import type { VersionedRoute } from '../../features/administration/routes/versioned-api'
import { DeployToRobotDialog } from '../../features/technical/DeployToRobotDialog'
import { ReadyRobotField } from '../../features/technical/ReadyRobotField'
import { robotForMap } from '../../features/technical/robot-readiness'
import { RouteRerunSection } from '../../features/technical/RouteRerunSection'
import { CheckRow, ComputedResult, NoneChecked, Note, SaveBlockedHint, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { errorText, routeTestErrors } from '../../features/technical/technical-format'
import { formatDateTime, formatMinutesSeconds } from '../../components/ui/date-time'
import { useMapVersions, usePhysicalRobots, usePreviousRevision, useRecordRouteTest, useRouteRevision, useRouteTestParticipants, useRouteTestQueue, useSubmittedRoutes } from '../../features/technical/technical-hooks'

type RouteFilter = 'pending' | 'passed' | 'failed'
type RouteRow = { route: VersionedRoute; filter: RouteFilter }
/** Holds the route itself: saving moves it between lists, and the dialog must not unmount mid-save. */
type Dialog = { view: 'record' | 'result'; route: VersionedRoute }

const filterText: Record<RouteFilter, { title: string; empty: string }> = {
  pending: { title: 'Tuyến chờ chạy thử', empty: 'Chưa có tuyến chờ chạy thử' },
  passed: { title: 'Tuyến đã đạt', empty: 'Chưa có tuyến chạy thử đạt' },
  failed: { title: 'Tuyến không đạt', empty: 'Chưa có tuyến chạy thử không đạt' },
}

function toRows(queue: VersionedRoute[], routes: VersionedRoute[]): RouteRow[] {
  // A save carrying the result of its path is not waiting for a first run (ADR-0023 addendum); an older server still
  // lists it in the queue, so it is left out here too and shows in the passed or failed list.
  const waiting = queue.filter(route => !['PASS', 'FAIL'].includes(route.verificationStatus))
  const queued = new Set(waiting.map(route => route.revisionId))
  return [
    ...waiting.map(route => ({ route, filter: 'pending' as const })),
    ...routes.filter(route => !queued.has(route.revisionId) && ['PASS', 'FAIL'].includes(route.verificationStatus))
      .map(route => ({ route, filter: route.verificationStatus === 'PASS' ? 'passed' as const : 'failed' as const })),
  ]
}

/**
 * Whole-route verification: the figure strip filters one table; a run is recorded
 * against the exact submitted revision, and a recorded run opens read-only.
 */
export default function TechnicalRouteTestsPage() {
  const queue = useRouteTestQueue()
  const routes = useSubmittedRoutes()
  const [filter, setFilter] = useState<RouteFilter>('pending')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  // The robot picker replaces the test form rather than opening inside its <form> (see ReadyRobotField).
  const [assigning, setAssigning] = useState<{ mapVersionId: string; mapLabel: string } | null>(null)

  const rows = useMemo(() => toRows(queue.data ?? [], routes.data?.data ?? []), [queue.data, routes.data])
  // A route Staff stopped using stays listed with its result, below the routes still in use.
  const visible = rows.filter(row => row.filter === filter).sort((a, b) => Number(a.route.isActive === false) - Number(b.route.isActive === false))
  const count = (value: RouteFilter) => rows.filter(row => row.filter === value).length
  const recordedCount = (value: RouteFilter) => routes.isPending ? '…' : routes.isError ? '-' : count(value)

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Chuẩn bị" title="Chạy thử tuyến" description="Ghi kết quả chạy thử toàn tuyến cho đúng phiên bản Staff đã gửi. Kết quả do người kiểm tra nhập, hệ thống không tự xác minh robot đã chạy. Tuyến đạt thì Staff dùng được để tạo Tour." />

      {!queue.isPending && !queue.error && (
        <div className="mb-3">
          <StatStrip label="Lọc tuyến theo kết quả chạy thử" columns="sm:grid-cols-3">
            <StatTile icon={Clock3} label="Chờ chạy thử" value={count('pending')} tone="warn" onClick={() => setFilter('pending')} pressed={filter === 'pending'} />
            <StatTile icon={CircleCheck} label="Đã đạt" value={recordedCount('passed')} onClick={() => setFilter('passed')} pressed={filter === 'passed'} />
            <StatTile icon={CircleX} label="Không đạt" value={recordedCount('failed')} tone="danger" onClick={() => setFilter('failed')} pressed={filter === 'failed'} />
          </StatStrip>
          {/* Đã đạt and Không đạt count the catalog, so its failure is shown under the figures whatever the filter. */}
          {routes.isError && <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-[#f5c8c2] bg-[#fff4f2] p-3 text-[13px] text-[#b23e31]"><p>Chưa tải được số tuyến đã đạt và không đạt.</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void routes.refetch()}>Tải lại</button></div>}
        </div>
      )}

      <RouteRerunSection onRecord={route => setDialog({ view: 'record', route })} />

      <section className={panelClass} aria-label="Danh sách kiểm chứng tuyến">
        <PanelHead title={filterText[filter].title} />
        {queue.isPending ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]" aria-busy="true"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải…</p> : queue.error ? <div role="alert" className="space-y-2 p-4 text-[13px] text-[#b23e31]"><p>{errorText(queue.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void queue.refetch()}>Tải lại danh sách chờ</button></div> : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Tuyến</th><th className={thClass}>Bản đồ</th><th className={thClass}>Điểm dừng</th><th className={thClass}>Trạng thái</th><th className={thClass}><span className="sr-only">Thao tác</span></th></tr></thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {visible.map(({ route, filter: rowFilter }) => {
                  const source = resultSource(route)
                  const shared = sharedResultLine(route)
                  const retired = route.isActive === false
                  return <tr key={route.revisionId} className={`${rowClass}${retired ? ' opacity-60' : ''}`}>
                  <td className={tdClass}><span className="font-semibold text-[#0f172a]">{route.name}</span>{retired && <> <ToneBadge tone="muted">Đã ngừng sử dụng</ToneBadge></>}<p className="text-[11.5px] text-[#64748b]">Phiên bản {route.revisionNumber}</p>{shared && <p className="mt-0.5 max-w-md text-[11.5px] text-[#8a5a06]">{shared}</p>}</td>
                  <td className={`${tdClass} font-mono text-xs`}>{route.mapKey}</td>
                  <td className={`${tdClass} text-xs text-[#64748b]`}>{route.stops.length} điểm · dừng {formatMinutesSeconds(route.dwellDurationSeconds)}</td>
                  <td className={tdClass}><ToneBadge tone={rowFilter === 'passed' ? 'ok' : rowFilter === 'failed' ? 'danger' : 'warn'}>{revisionTone(true, route.verificationStatus).label}</ToneBadge>{source && <p className="mt-1 text-[11.5px] text-[#64748b]">Giữ kết quả từ bản {campusShortStamp(source.createdAt)}</p>}{route.legCoverage && <p className="mt-1 text-[11.5px] text-[#64748b]">{legCoverageText(route.legCoverage)}</p>}</td>
                  <td className={`${tdClass} text-right`}>{rowFilter === 'pending'
                    ? <button type="button" className={buttonClass('primary', 'sm')} aria-label={`Ghi kết quả ${route.name}`} onClick={() => setDialog({ view: 'record', route })}>Ghi kết quả</button>
                    : <button type="button" className={buttonClass('secondary', 'sm')} aria-label={`Xem kết quả ${route.name}`} onClick={() => setDialog({ view: 'result', route })}>Xem kết quả</button>}</td>
                </tr>
                })}
                {!visible.length && <tr><td colSpan={5}><EmptyState variant="empty" title={filterText[filter].empty} /></td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Note tone="danger"><b>Đổi đường đi</b> (thêm, bớt, đổi thứ tự điểm dừng, đổi góc nhìn camera, điểm đầu, điểm cuối hoặc bản đồ) thì bản mới cần chạy thử lại.</Note>
        <Note tone="ok"><b>Chỉ đổi tên, mô tả, thời gian dừng hoặc thuyết minh</b> thì giữ kết quả chạy thử của đường đi, không cần chạy lại.</Note>
      </div>

      {dialog?.view === 'record' && <RecordRouteTestModal key={dialog.route.revisionId} route={dialog.route} onClose={() => setDialog(null)}
        onAssignRobot={mapLabel => { setAssigning({ mapVersionId: dialog.route.mapVersionId, mapLabel }); setDialog(null) }} />}
      {assigning && <DeployToRobotDialog mapVersionId={assigning.mapVersionId} mapLabel={assigning.mapLabel} onClose={() => setAssigning(null)} />}
      {dialog?.view === 'result' && <RouteResultModal key={dialog.route.revisionId} route={dialog.route} onRecord={() => setDialog({ view: 'record', route: dialog.route })} onClose={() => setDialog(null)} />}
    </TechnicalPage>
  )
}

function RecordRouteTestModal({ route, onClose, onAssignRobot }: { route: VersionedRoute; onClose: () => void; onAssignRobot: (mapLabel: string) => void }) {
  const record = useRecordRouteTest()
  const robots = usePhysicalRobots()
  const maps = useMapVersions()
  const participants = useRouteTestParticipants()
  const [staffUserId, setStaffUserId] = useState('')
  const [allStopsReached, setAllStopsReached] = useState(false)
  const [safelyStopped, setSafelyStopped] = useState(false)
  const [localizationPassed, setLocalizationPassed] = useState(false)
  // Until a box is ticked or unticked, the result is neither Đạt nor Không đạt and no reason is asked.
  const [touched, setTouched] = useState(false)
  const [failureReason, setFailureReason] = useState('')
  const [evidence, setEvidence] = useState('')
  // ADR-0065: on a voting route the run names the order driven; the first POI is fixed, so it starts there.
  const voting = Boolean(route.viewerChoosesNextStop)
  const orderedStops = [...route.stops].sort((a, b) => a.stopOrder - b.stopOrder)
  const stopIdsKnown = orderedStops.every(stop => Boolean(stop.id))
  const [driven, setDriven] = useState<string[]>(() => orderedStops[0]?.id ? [orderedStops[0].id] : [])
  // Stable across retries of the same input, so a lost response cannot record a second run.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const checks = [
    { label: 'Robot đi đủ các điểm dừng', checked: allStopsReached, set: setAllStopsReached },
    { label: 'Robot dừng an toàn', checked: safelyStopped, set: setSafelyStopped },
    { label: 'Định vị đạt', checked: localizationPassed, set: setLocalizationPassed },
  ]
  // The result follows the ticks: all three ticked is Đạt, any left unticked is Không đạt and needs a reason.
  const resultCode: 'PASS' | 'FAIL' = checks.every(check => check.checked) ? 'PASS' : 'FAIL'
  const pending = !touched && checks.every(check => !check.checked)
  // Not chosen: the one robot the server calls ready on the route's map version records the run.
  const robotCode = robotForMap(robots.data, route.mapVersionId).ready?.robotCode ?? ''
  const errors = record.error ? routeTestErrors(record.error) : {}
  // ADR-0023 addendum: the result applies to every save with this path, so the Tours it decides are named before saving.
  const shared = sharedResultLine(route)
  const failStopsTours = !pending && resultCode === 'FAIL' && hasScheduledToursOnPath(route)
  const changed = () => { record.reset(); setRequestId(crypto.randomUUID()) }
  const missingToSave = [
    !robotCode && 'cần một robot sẵn sàng trên bản đồ này',
    !staffUserId && 'chọn Staff đi cùng',
    pending && 'tick các mục đã kiểm tra',
    !pending && resultCode === 'FAIL' && !failureReason.trim() && 'nhập lý do không đạt',
    !evidence.trim() && 'nhập ghi chú bằng chứng',
    voting && !stopIdsKnown && 'tải lại trang để lấy mã điểm dừng',
    voting && stopIdsKnown && driven.length < orderedStops.length && 'chọn đủ thứ tự robot đã đi',
  ].filter((item): item is string => Boolean(item))
  const ready = missingToSave.length === 0

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ready || record.isPending) return
    record.mutate({ routeName: route.name, run: {
      routeId: route.routeId, revisionId: route.revisionId, requestId, robotCode, participatingStaffUserId: staffUserId, resultCode,
      allStopsReached, safelyStopped, localizationPassed,
      failureReason: resultCode === 'FAIL' ? failureReason.trim() : null, evidenceNote: evidence.trim(),
      ...(voting ? { traversedStopIds: driven } : {}),
    } }, { onSuccess: onClose })
  }

  return (
    <Modal open size="lg" title={`Chạy thử ${route.name}`} description={`Phiên bản ${route.revisionNumber} · bản đồ ${route.mapKey} · ${route.stops.length} điểm dừng. Đạt khi cả ba kiểm tra đều đạt.`} onClose={onClose}
      footer={<div className="flex flex-wrap items-center justify-end gap-2"><SaveBlockedHint id="route-test-missing" missing={missingToSave} /><ComputedResult passed={resultCode === 'PASS'} pending={pending} failed={failedCheckNames({ allStopsReached, safelyStopped, localizationPassed })} /><button type="button" className={buttonClass('secondary')} onClick={onClose}>Đóng</button><button type="submit" form="route-test-form" className={buttonClass('primary')} aria-describedby={ready ? undefined : 'route-test-missing'} disabled={!ready || record.isPending}>{record.isPending ? 'Đang lưu…' : 'Lưu kết quả'}</button></div>}>
      <form id="route-test-form" className="space-y-3.5" onSubmit={submit}>
        <div>
          <ReadyRobotField robots={robots} mapVersionId={route.mapVersionId} map={maps.data?.find(item => item.map.id === route.mapVersionId)?.map} onAssignRobot={onAssignRobot} />
          {errors.robotCode && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{errors.robotCode}</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="route-test-staff">Staff đi cùng</label>
          <select title="" id="route-test-staff" className={`${inputClass} mt-1`} required value={staffUserId} disabled={participants.isPending || participants.isError || !participants.data?.length} onChange={event => { setStaffUserId(event.target.value); changed() }}><option value="">Chọn Staff</option>{participants.data?.map(person => <option key={person.userId} value={person.userId}>{person.fullName} · {person.username}</option>)}</select>
          {participants.isPending && <p role="status" className="mt-1 text-sm text-[#64748b]">Đang tải danh sách Staff…</p>}
          {participants.isError && <div role="alert" className="mt-1 text-sm text-[#b23e18]"><p>{errorText(participants.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void participants.refetch()}>Tải lại danh sách Staff</button></div>}
          {participants.data?.length === 0 && <p role="status" className="mt-1 text-sm text-[#b23e18]">Chưa có tài khoản Staff đang hoạt động. Cần một Staff đi cùng để ghi kết quả.</p>}
          {errors.staff && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{errors.staff}</p>}
        </div>
        {route.expectedDurationSeconds ? <p className="text-xs text-[#64748b]">{expectedDurationText(route.expectedDurationSeconds)}</p> : null}
        <RouteChangeSummary route={route} />
        {voting && <DrivenOrderStep route={route} stops={orderedStops} known={stopIdsKnown} driven={driven} onChange={value => { setDriven(value); changed() }} />}
        {shared || route.scheduledTours?.length ? <div role="note" className="rounded-lg border border-[#f0d89f] bg-[#fff8e6] px-3 py-2 text-[13px] text-[#7d5310]">
          {route.scheduledTours?.length ? <p>Bản này có {route.scheduledTours.length} Tour đã lên lịch: {route.scheduledTours.map(tour => `${tour.name} · ${campusShortStamp(tour.scheduledStartAt)}`).join('; ')}.</p> : null}
          {shared && <p>{shared}.</p>}
          {failStopsTours && <p className="mt-1 font-semibold text-[#b23e31]">Các Tour này sẽ không chốt và không bắt đầu được cho tới khi có lần chạy đạt.</p>}
        </div> : null}
        <div className="space-y-2">
          <p className="text-xs text-[#64748b]">Tick mục đã đạt. Còn mục chưa tick thì kết quả là Không đạt.</p>
          {checks.map(check => <CheckRow key={check.label} checked={check.checked} onChange={value => { check.set(value); setTouched(true); changed() }}>{check.label}</CheckRow>)}
          {pending && <NoneChecked reasonId="route-test-reason" onNone={() => { setTouched(true); changed() }} />}
        </div>
        {!pending && resultCode === 'FAIL' && <div><label className={labelClass} htmlFor="route-test-reason">Lý do không đạt</label><p className="mt-0.5 text-xs text-[#64748b]">Staff sẽ thấy lý do này khi sửa tuyến.</p><input id="route-test-reason" className={`${inputClass} mt-1`} required maxLength={1000} value={failureReason} onChange={event => { setFailureReason(event.target.value); changed() }} /></div>}
        <div><label className={labelClass} htmlFor="route-test-evidence">Ghi chú bằng chứng</label><textarea id="route-test-evidence" rows={3} className={`${inputClass} mt-1`} required maxLength={2000} value={evidence} onChange={event => { setEvidence(event.target.value); changed() }} /></div>
        {errors.form && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errors.form}</p>}
        <Note>Mỗi lần chạy được ghi thêm, không sửa được. Lần chạy mới nhất của cùng đường đi là kết quả đang áp dụng, cho mọi bản lưu có đường đi này. Chỉ đổi tên, mô tả, thời gian dừng hoặc thuyết minh thì giữ kết quả.</Note>
      </form>
    </Modal>
  )
}

function RouteResultModal({ route, onRecord, onClose }: { route: VersionedRoute; onRecord: () => void; onClose: () => void }) {
  const detail = useRouteRevision(route.routeId, route.revisionId)
  const participants = useRouteTestParticipants()
  const runs = [...(detail.data?.testRuns ?? [])].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
  const staffName = (id: string) => participants.data?.find(person => person.userId === id)?.fullName ?? 'Staff không còn hoạt động'
  return (
    <Modal open size="lg" title={`Kết quả ${route.name}`} description={`Phiên bản ${route.revisionNumber} · bản đồ ${route.mapKey}.`} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={onClose}>Đóng</button><button type="button" className={buttonClass('primary')} onClick={onRecord}>Ghi lần chạy mới</button></div>}>
      <div className="space-y-3">
        {detail.isPending && <p role="status" className="text-sm text-[#64748b]">Đang tải kết quả…</p>}
        {detail.isError && <div role="alert" className="space-y-2 text-sm text-[#b23e31]"><p>{errorText(detail.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void detail.refetch()}>Tải lại kết quả</button></div>}
        {runs.map(run => <section key={run.id} aria-label={`Lần chạy ${formatDateTime(run.checkedAt)}`} className="rounded-lg border border-[#e2e8f0] p-3 text-[13px] text-[#334155]">
          <div className="flex flex-wrap items-center gap-2"><ToneBadge tone={run.resultCode === 'PASS' ? 'ok' : 'danger'}>{run.resultCode === 'PASS' ? 'Đạt' : 'Không đạt'}</ToneBadge><span className="text-xs text-[#64748b]">{formatDateTime(run.checkedAt)}</span>{run.id === detail.data?.effectiveTestRunId && <ToneBadge tone="info">Đang áp dụng</ToneBadge>}</div>
          <p className="mt-1.5 text-xs text-[#64748b]">Robot <span className="font-mono">{run.robotCode}</span> · Staff đi cùng: {staffName(run.participatingStaffUserId)}</p>
          <ul className="mt-2 grid gap-x-3 gap-y-0.5 text-xs sm:grid-cols-3">{[['Đi đủ các điểm dừng', run.allStopsReached], ['Dừng an toàn', run.safelyStopped], ['Định vị', run.localizationPassed]].map(([label, passed]) => <li key={String(label)}>{passed ? 'Đạt' : 'Không đạt'}: {label}</li>)}</ul>
          {run.resultCode === 'FAIL' && failedCheckNames(run).length > 0 && <p className="mt-1 text-xs text-[#b23e31]">Không đạt ở: {failedCheckNames(run).join(', ')}</p>}
          {run.routeRevisionId !== route.revisionId && <p className="mt-1 text-xs text-[#64748b]">Ghi trên một bản lưu khác có cùng đường đi.</p>}
          {run.traversedStopIds?.length ? <p className="mt-1 text-xs text-[#334155]">Thứ tự đã đi: {drivenText(detail.data ?? route, run.traversedStopIds)}</p> : null}
          {run.failureReason && <p className="mt-2"><span className="font-medium">Lý do:</span> {run.failureReason}</p>}
          <p className="mt-2 whitespace-pre-wrap"><span className="font-medium">Bằng chứng:</span> {run.evidenceNote}</p>
        </section>)}
        {detail.isSuccess && !runs.length && <p className="text-sm text-[#64748b]">Chưa có lần chạy nào.</p>}
      </div>
    </Modal>
  )
}

/** "Bắt đầu → A → C → B → Kết thúc" for a recorded or chosen order of revision stop ids. */
function drivenText(route: VersionedRoute, ids: string[]) {
  const name = (id: string) => route.stops.find(stop => stop.id === id)?.name ?? 'POI'
  return ['Bắt đầu', ...ids.map(name), 'Kết thúc'].join(' → ')
}

/**
 * ADR-0065: the order the robot drove on a route where Viewers choose the next stop. The first POI is fixed; each
 * button adds the POI the robot went to next. The legs still to cover come from the server.
 */
function DrivenOrderStep({ route, stops, known, driven, onChange }: {
  route: VersionedRoute; stops: VersionedRoute['stops']; known: boolean; driven: string[]; onChange: (value: string[]) => void
}) {
  const missing = missingLegsText(route.legCoverage)
  const remaining = stops.filter(stop => stop.id && !driven.includes(stop.id))
  return <fieldset className="space-y-2 rounded-lg border border-[#e2e8f0] p-3">
    <legend className="px-1 text-[13px] font-semibold text-[#0f172a]">Thứ tự robot đã đi</legend>
    <p className="text-xs text-[#64748b]">Tuyến này cho Viewer chọn điểm tiếp theo. POI đầu là điểm cố định; bấm các POI theo đúng thứ tự robot đã tới trong lần chạy này.</p>
    {route.legCoverage && <p className="text-xs text-[#334155]">{legCoverageText(route.legCoverage)}{missing ? '. ' + missing : '.'}</p>}
    {!known ? <p role="alert" className="text-xs text-[#b23e18]">Máy chủ chưa trả mã điểm dừng nên chưa ghi được thứ tự. Tải lại trang rồi thử lại.</p> : <>
      <p aria-label="Thứ tự đã chọn" className="text-[13px] font-medium text-[#0f172a]">{drivenText(route, driven).replace(/ → Kết thúc$/, remaining.length ? ' → …' : ' → Kết thúc')}</p>
      <div className="flex flex-wrap items-center gap-2">
        {remaining.map(stop => <button key={stop.id} type="button" className={buttonClass('secondary', 'sm')} onClick={() => onChange([...driven, stop.id!])}>Tiếp theo: {stop.name}</button>)}
        {driven.length > 1 && <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => onChange(driven.slice(0, 1))}>Chọn lại</button>}
      </div>
    </>}
  </fieldset>
}

/**
 * B4: how this save differs from the save before it, so Technical sees whether the path changed. The server decides
 * the applied result; this only says what to look at on the robot.
 */
function RouteChangeSummary({ route }: { route: VersionedRoute }) {
  const detail = useRouteRevision(route.routeId, route.revisionId)
  const before = [...(detail.data?.revisionHistory ?? [])].filter(item => item.revisionNumber < route.revisionNumber)
    .sort((a, b) => b.revisionNumber - a.revisionNumber)[0]
  const previous = usePreviousRevision(route.routeId, before?.revisionId)
  if (!before) return null
  if (!previous.data) return previous.isError ? <p className="text-xs text-[#64748b]">Không tải được bản lưu trước để so sánh.</p> : null
  const { changes, pathChanged } = routeChanges(previous.data, route)
  return <p className="text-xs text-[#334155]"><span className="font-medium">So với bản lưu {campusShortStamp(before.createdAt)}:</span>{' '}
    {changes.length ? `${changes.join(', ')}.` : 'không đổi đường đi hay thời gian dừng.'}
    {pathChanged ? ' Đường đi đã đổi, cần chạy thử lại.' : changes.length ? ' Đường đi không đổi.' : ''}</p>
}
