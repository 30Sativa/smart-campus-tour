import { useMemo, useState, type FormEvent } from 'react'
import { CircleCheck, CircleX, Clock3, LoaderCircle } from 'lucide-react'
import { PageHeader, PanelHead, StatStrip, StatTile, panelClass } from '../../components/ui/ConsolePrimitives'
import { Modal } from '../../components/ui/Drawer'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { revisionTone } from '../../features/administration/routes/route-messages'
import type { VersionedRoute } from '../../features/administration/routes/versioned-api'
import { RobotPicker } from '../../features/technical/RobotPicker'
import { CheckRow, Note, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { errorText, routeTestErrors, stamp } from '../../features/technical/technical-format'
import { usePhysicalRobots, useRecordRouteTest, useRouteRevision, useRouteTestParticipants, useRouteTestQueue, useSubmittedRoutes } from '../../features/technical/technical-hooks'

type RouteFilter = 'pending' | 'passed' | 'failed'
type RouteRow = { route: VersionedRoute; filter: RouteFilter }
/** Holds the route itself: saving moves it between lists, and the dialog must not unmount mid-save. */
type Dialog = { view: 'record' | 'result'; route: VersionedRoute }

const filterText: Record<RouteFilter, { title: string; empty: string }> = {
  pending: { title: 'Tuyến chờ chạy thử', empty: 'Không có tuyến nào đang chờ chạy thử.' },
  passed: { title: 'Tuyến đã đạt', empty: 'Chưa có tuyến nào chạy thử đạt.' },
  failed: { title: 'Tuyến không đạt', empty: 'Không có tuyến nào chạy thử không đạt.' },
}

function toRows(queue: VersionedRoute[], routes: VersionedRoute[]): RouteRow[] {
  const queued = new Set(queue.map(route => route.revisionId))
  return [
    ...queue.map(route => ({ route, filter: 'pending' as const })),
    ...routes.filter(route => !queued.has(route.revisionId) && ['PASS', 'FAIL'].includes(route.verificationStatus))
      .map(route => ({ route, filter: route.verificationStatus === 'PASS' ? 'passed' as const : 'failed' as const })),
  ]
}

/**
 * Whole-route verification: the figure strip filters one table; a run is recorded
 * against the exact submitted revision, and a recorded run opens read-only.
 */
export default function TechnicalConfirmationsPage() {
  const queue = useRouteTestQueue()
  const routes = useSubmittedRoutes()
  const [filter, setFilter] = useState<RouteFilter>('pending')
  const [dialog, setDialog] = useState<Dialog | null>(null)

  const rows = useMemo(() => toRows(queue.data ?? [], routes.data?.data ?? []), [queue.data, routes.data])
  const visible = rows.filter(row => row.filter === filter)
  const count = (value: RouteFilter) => rows.filter(row => row.filter === value).length
  const recordedCount = (value: RouteFilter) => routes.isPending ? '…' : routes.isError ? '-' : count(value)

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Tuyến" title="Xác nhận toàn tuyến" description="Ghi kết quả chạy thử toàn tuyến cho đúng phiên bản Staff đã gửi. Đây là bằng chứng người kiểm tra nhập, không chứng minh robot đã chạy thật và không tự làm tuyến READY." />

      {!queue.isPending && !queue.error && (
        <div className="mb-3">
          <StatStrip label="Lọc tuyến theo kết quả chạy thử" columns="sm:grid-cols-3">
            <StatTile icon={Clock3} label="Chờ chạy thử" value={count('pending')} tone="warn" onClick={() => setFilter('pending')} pressed={filter === 'pending'} />
            <StatTile icon={CircleCheck} label="Đã đạt" value={recordedCount('passed')} onClick={() => setFilter('passed')} pressed={filter === 'passed'} />
            <StatTile icon={CircleX} label="Không đạt" value={recordedCount('failed')} tone="danger" onClick={() => setFilter('failed')} pressed={filter === 'failed'} />
          </StatStrip>
        </div>
      )}

      <section className={panelClass} aria-label="Danh sách kiểm chứng tuyến">
        <PanelHead title={filterText[filter].title} description="Mỗi lần chạy gắn với đúng một phiên bản tuyến và bản đồ." />
        {filter !== 'pending' && routes.isError && <div role="alert" className="space-y-2 border-b border-[#eef1f4] p-4 text-[13px] text-[#b23e31]"><p>{errorText(routes.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void routes.refetch()}>Tải lại danh sách tuyến</button></div>}
        {queue.isPending ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]" aria-busy="true"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải…</p> : queue.error ? <div role="alert" className="space-y-2 p-4 text-[13px] text-[#b23e31]"><p>{errorText(queue.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void queue.refetch()}>Tải lại danh sách chờ</button></div> : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Tuyến</th><th className={thClass}>Bản đồ</th><th className={thClass}>Điểm dừng</th><th className={thClass}>Trạng thái</th><th className={thClass}><span className="sr-only">Thao tác</span></th></tr></thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {visible.map(({ route, filter: rowFilter }) => <tr key={route.revisionId} className={rowClass}>
                  <td className={tdClass}><span className="font-semibold text-[#0f172a]">{route.name}</span><p className="text-[11.5px] text-[#64748b]">Phiên bản {route.revisionNumber}</p></td>
                  <td className={`${tdClass} font-mono text-xs`}>{route.mapKey}</td>
                  <td className={`${tdClass} text-xs text-[#64748b]`}>{route.stops.length} điểm · dừng {route.dwellDurationSeconds} giây</td>
                  <td className={tdClass}><ToneBadge tone={rowFilter === 'passed' ? 'ok' : rowFilter === 'failed' ? 'danger' : 'warn'}>{revisionTone(true, route.verificationStatus).label}</ToneBadge></td>
                  <td className={`${tdClass} text-right`}>{rowFilter === 'pending'
                    ? <button type="button" className={buttonClass('primary', 'sm')} aria-label={`Ghi kết quả ${route.name}`} onClick={() => setDialog({ view: 'record', route })}>Ghi kết quả</button>
                    : <button type="button" className={buttonClass('secondary', 'sm')} aria-label={`Xem kết quả ${route.name}`} onClick={() => setDialog({ view: 'result', route })}>Xem kết quả</button>}</td>
                </tr>)}
                {!visible.length && <tr><td className={`${tdClass} py-8 text-center text-[#64748b]`} colSpan={5}>{filterText[filter].empty}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Note tone="danger"><b>Thay đổi ảnh hưởng di chuyển</b> (thêm, bớt, đổi thứ tự điểm dừng, đổi map) không thừa hưởng xác nhận cũ.</Note>
        <Note tone="ok"><b>Chỉ sửa thuyết minh</b> thì giữ xác nhận, không cần chạy lại navigation.</Note>
      </div>

      {dialog?.view === 'record' && <RecordRouteTestModal key={dialog.route.revisionId} route={dialog.route} onClose={() => setDialog(null)} />}
      {dialog?.view === 'result' && <RouteResultModal key={dialog.route.revisionId} route={dialog.route} onRecord={() => setDialog({ view: 'record', route: dialog.route })} onClose={() => setDialog(null)} />}
    </TechnicalPage>
  )
}

function RecordRouteTestModal({ route, onClose }: { route: VersionedRoute; onClose: () => void }) {
  const record = useRecordRouteTest()
  const robots = usePhysicalRobots()
  const participants = useRouteTestParticipants()
  const [robotCode, setRobotCode] = useState('')
  const [staffUserId, setStaffUserId] = useState('')
  const [resultCode, setResultCode] = useState<'PASS' | 'FAIL'>('PASS')
  const [allStopsReached, setAllStopsReached] = useState(false)
  const [safelyStopped, setSafelyStopped] = useState(false)
  const [localizationPassed, setLocalizationPassed] = useState(false)
  const [duration, setDuration] = useState('')
  const [failureReason, setFailureReason] = useState('')
  const [evidence, setEvidence] = useState('')
  // Stable across retries of the same input, so a lost response cannot record a second run.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())

  const checks = [
    { label: 'Robot đi đủ các điểm dừng', checked: allStopsReached, set: setAllStopsReached },
    { label: 'Robot dừng an toàn', checked: safelyStopped, set: setSafelyStopped },
    { label: 'Localization đạt', checked: localizationPassed, set: setLocalizationPassed },
  ]
  const missing = checks.filter(check => !check.checked).map(check => check.label)
  const passBlocked = resultCode === 'PASS' && missing.length > 0
  const failBlocked = resultCode === 'FAIL' && missing.length === 0
  const seconds = Number(duration)
  const durationValid = Number.isInteger(seconds) && seconds >= 1 && seconds <= 86400
  const selectedRobot = robots.data?.find(robot => robot.robotCode === robotCode)
  // Advisory only: the server decides from the robot's latest deployment check.
  const robotElsewhere = selectedRobot && (selectedRobot.latestDeployedMapKey !== route.mapKey || selectedRobot.latestDeploymentPassed === false)
  const errors = record.error ? routeTestErrors(record.error) : {}
  const changed = () => { record.reset(); setRequestId(crypto.randomUUID()) }
  const ready = robotCode && staffUserId && durationValid && evidence.trim() && !passBlocked && !failBlocked && (resultCode === 'PASS' || failureReason.trim())

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ready || record.isPending) return
    record.mutate({ routeName: route.name, run: {
      routeId: route.routeId, revisionId: route.revisionId, requestId, robotCode, participatingStaffUserId: staffUserId, resultCode,
      allStopsReached, safelyStopped, localizationPassed, measuredDurationSeconds: seconds,
      failureReason: resultCode === 'FAIL' ? failureReason.trim() : null, evidenceNote: evidence.trim(),
    } }, { onSuccess: onClose })
  }

  return (
    <Modal open size="lg" title={`Chạy thử ${route.name}`} description={`Phiên bản ${route.revisionNumber} · bản đồ ${route.mapKey} · ${route.stops.length} điểm dừng. Đạt khi cả ba kiểm tra đều đạt.`} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={onClose}>Đóng</button><button type="submit" form="route-test-form" className={buttonClass('primary')} disabled={!ready || record.isPending}>{record.isPending ? 'Đang lưu…' : 'Lưu kết quả'}</button></div>}>
      <form id="route-test-form" className="space-y-3.5" onSubmit={submit}>
        <div>
          <RobotPicker id="route-test-robot" label="Robot vật lý" value={robotCode} onChange={value => { setRobotCode(value); changed() }} robots={robots} emptyText="Chưa có robot vật lý được đăng ký. Cần đăng ký robot trước khi ghi kết quả." />
          {errors.robotCode && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{errors.robotCode}</p>}
          {robotElsewhere && !errors.robotCode && <p role="status" className="mt-1 text-xs text-amber-800">Lần kiểm tra triển khai gần nhất của robot này không phải kết quả đạt trên {route.mapKey}. Máy chủ sẽ từ chối cho tới khi có kiểm tra đạt đúng map này.</p>}
        </div>
        <div>
          <label className={labelClass} htmlFor="route-test-staff">Staff đi cùng</label>
          <select title="" id="route-test-staff" className={`${inputClass} mt-1`} required value={staffUserId} disabled={participants.isPending || participants.isError || !participants.data?.length} onChange={event => { setStaffUserId(event.target.value); changed() }}><option value="">— Chọn Staff —</option>{participants.data?.map(person => <option key={person.userId} value={person.userId}>{person.fullName} · {person.username}</option>)}</select>
          {participants.isPending && <p role="status" className="mt-1 text-sm text-[#64748b]">Đang tải danh sách Staff…</p>}
          {participants.isError && <div role="alert" className="mt-1 text-sm text-[#b23e18]"><p>{errorText(participants.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void participants.refetch()}>Tải lại danh sách Staff</button></div>}
          {participants.data?.length === 0 && <p role="status" className="mt-1 text-sm text-[#b23e18]">Chưa có tài khoản Staff đang hoạt động. Cần một Staff đi cùng để ghi kết quả.</p>}
          {errors.staff && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{errors.staff}</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelClass} htmlFor="route-test-result">Kết quả</label><select id="route-test-result" className={`${inputClass} mt-1`} value={resultCode} onChange={event => { setResultCode(event.target.value as 'PASS' | 'FAIL'); changed() }}><option value="PASS">Đạt</option><option value="FAIL">Không đạt</option></select></div>
          <div><label className={labelClass} htmlFor="route-test-duration">Tổng thời gian chạy toàn tuyến (giây)</label><input id="route-test-duration" className={`${inputClass} mt-1`} type="number" required min={1} max={86400} step={1} value={duration} onChange={event => { setDuration(event.target.value); changed() }} /><p className="mt-1 text-xs text-[#64748b]">Tính từ lúc xuất phát đến khi kết thúc, gồm cả thời gian dừng tại các điểm.</p></div>
        </div>
        <div className="space-y-2">
          {checks.map(check => <CheckRow key={check.label} checked={check.checked} onChange={value => { check.set(value); changed() }}>{check.label}</CheckRow>)}
          {passBlocked && missing.length < checks.length && <p role="alert" className="text-xs text-[#b23e18]">Chưa thể ghi Đạt, còn thiếu: {missing.join(', ')}. Tick đủ cả ba mục hoặc đổi Kết quả thành Không đạt.</p>}
          {failBlocked && <p role="alert" className="text-xs text-[#b23e18]">Không đạt cần ít nhất một mục chưa đạt. Bỏ tick mục không đạt hoặc đổi Kết quả thành Đạt.</p>}
        </div>
        {resultCode === 'FAIL' && <div><label className={labelClass} htmlFor="route-test-reason">Lý do không đạt</label><input id="route-test-reason" className={`${inputClass} mt-1`} required maxLength={1000} value={failureReason} onChange={event => { setFailureReason(event.target.value); changed() }} /></div>}
        <div><label className={labelClass} htmlFor="route-test-evidence">Ghi chú bằng chứng</label><textarea id="route-test-evidence" rows={3} className={`${inputClass} mt-1`} required maxLength={2000} value={evidence} onChange={event => { setEvidence(event.target.value); changed() }} /></div>
        {errors.form && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errors.form}</p>}
        <Note>Mỗi lần chạy được ghi thêm, không sửa được. Lần chạy mới nhất của cùng cấu hình là kết quả đang áp dụng.</Note>
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
        {runs.map(run => <section key={run.id} aria-label={`Lần chạy ${stamp(run.checkedAt)}`} className="rounded-lg border border-[#e2e8f0] p-3 text-[13px] text-[#334155]">
          <div className="flex flex-wrap items-center gap-2"><ToneBadge tone={run.resultCode === 'PASS' ? 'ok' : 'danger'}>{run.resultCode === 'PASS' ? 'Đạt' : 'Không đạt'}</ToneBadge><span className="text-xs text-[#64748b]">{stamp(run.checkedAt)}</span>{run.id === detail.data?.effectiveTestRunId && <ToneBadge tone="info">Đang áp dụng</ToneBadge>}</div>
          <p className="mt-1.5 text-xs text-[#64748b]">Robot <span className="font-mono">{run.robotCode}</span> · Staff đi cùng: {staffName(run.participatingStaffUserId)} · đo được {run.measuredDurationSeconds} giây{run.measurementBasis ? '' : ' (đo theo định nghĩa cũ, cần chạy thử lại trước khi tạo Tour)'}</p>
          <ul className="mt-2 grid gap-x-3 gap-y-0.5 text-xs sm:grid-cols-3">{[['Đi đủ các điểm dừng', run.allStopsReached], ['Dừng an toàn', run.safelyStopped], ['Localization', run.localizationPassed]].map(([label, passed]) => <li key={String(label)}>{passed ? 'Đạt' : 'Chưa đạt'}: {label}</li>)}</ul>
          {run.failureReason && <p className="mt-2"><span className="font-medium">Lý do:</span> {run.failureReason}</p>}
          <p className="mt-2 whitespace-pre-wrap"><span className="font-medium">Bằng chứng:</span> {run.evidenceNote}</p>
        </section>)}
        {detail.isSuccess && !runs.length && <p className="text-sm text-[#64748b]">Chưa có lần chạy nào.</p>}
      </div>
    </Modal>
  )
}
