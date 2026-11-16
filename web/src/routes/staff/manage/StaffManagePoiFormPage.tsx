import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, CircleAlert, Info, MapPinned, MapPinOff } from 'lucide-react'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { celebrate, notify } from '../../../components/ui/toast-store'
import { technicalApi, type PoiProposal, type PoiVerification } from '../../../features/technical/api/technical'
import { errorText } from '../../../features/technical/technical-format'
import { useMapVersions } from '../../../features/technical/technical-hooks'
import { mapCheckLabel, narrationStatus, poiObservationLabels, poiStatus, routeUseLine, verificationMethodLabel } from '../../../features/technical/poi-labels'
import { campusShortStamp } from '../../../features/administration/tours/tour-calendar'
import { ToneBadge } from '../../../features/technical/TechnicalUi'
import { headPresetProblem } from '../../../features/technical/head-camera-preset'
import { HeadCameraPresetField } from '../../../features/administration/pois/HeadCameraPresetField'
import { staffMapLabels } from '../../../features/administration/map-labels'
import { PoiPosePicker, type PickerMode, type PickerPose } from '../../../features/administration/pois/map/PoiPosePicker'
import { clearanceMessage, poseClearance, quantizeMeters, yawFromDegrees } from '../../../features/administration/pois/map/occupancy-grid'
import { useMapRaster } from '../../../features/administration/pois/map/use-map-raster'
import { UnsavedChangesGuard } from '../../../features/administration/UnsavedChangesGuard'
import { AFTER_SAVE } from '../../../features/administration/after-save'
import { PoiNarrationPanel } from '../../../features/administration/pois/PoiNarrationPanel'
import { PoiHistory } from '../../../features/administration/pois/PoiHistory'
import { effectiveFailRecord } from '../../../features/administration/pois/poi-status'
import { useReactivatePoiProposal } from '../../../features/technical/technical-hooks'

const card = 'ct-panel min-w-0 rounded-[15px] bg-white shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]'
/** The page's tabs, kept in `?tab=` so a link (the list's "Chờ duyệt" badge) can open one directly. */
const TABS = [['vi-tri', 'Vị trí & camera'], ['thuyet-minh', 'Thuyết minh'], ['lich-su', 'Lịch sử']] as const
type Tab = typeof TABS[number][0]
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2'

// Narration is not part of a POI revision any more; it has its own versions and approval (ADR-0060).
type Draft = { mapVersionId: string; name: string; purpose: string; description: string; x: number | null; y: number | null; yaw: number | null; cameraPreset: string }
const empty: Draft = { mapVersionId: '', name: '', purpose: '', description: '', x: null, y: null, yaw: null, cameraPreset: 'FRONT' }

/** The draft exactly as it is sent, so "nothing changed" means the server would get the same revision. */
function payload(draft: Draft) {
  return { mapVersionId: draft.mapVersionId, name: draft.name.trim(), purpose: draft.purpose.trim(), description: draft.description.trim() || null,
    x: draft.x, y: draft.y, yaw: draft.yaw, cameraPreset: draft.cameraPreset }
}
const samePayload = (a: Draft, b: Draft) => JSON.stringify(payload(a)) === JSON.stringify(payload(b))
/**
 * The fields of the server's navigation fingerprint (PoiNavigationFingerprint.Compute), at its precision. A PASS
 * belongs to this fingerprint, so a revision that keeps it keeps the PASS and any other change needs a new check.
 */
const navigationKey = (draft: Draft) => [draft.mapVersionId, draft.x?.toFixed(4), draft.y?.toFixed(4), draft.yaw?.toFixed(6), draft.cameraPreset.trim().toUpperCase()].join('|')

function asDraft(item: PoiProposal): Draft {
  const { revision } = item
  return { mapVersionId: revision.mapVersionId, name: revision.name, purpose: revision.purpose, description: revision.description ?? '', x: revision.x, y: revision.y, yaw: revision.yaw, cameraPreset: revision.cameraPreset }
}

export default function StaffManagePoiFormPage() {
  const { poiId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  // A new POI has only its position and content; narration and history need a saved POI.
  const tab: Tab = poiId && TABS.some(([key]) => key === requestedTab) ? requestedTab as Tab : 'vi-tri'
  const queryClient = useQueryClient()
  const maps = useMapVersions()
  const proposalQuery = useQuery({ queryKey: ['technical', 'poi-proposal', poiId], queryFn: () => technicalApi.getPoiProposal(poiId!), enabled: Boolean(poiId) })
  const [draftOverride, setDraftOverride] = useState<Draft | null>(null)
  const [saved, setSaved] = useState<PoiProposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [poseMode, setPoseMode] = useState<PickerMode>('position')
  const current = saved ?? proposalQuery.data ?? null
  // A save clears the override, so the form then shows the revision the server just returned.
  const draft = draftOverride ?? (current ? asDraft(current) : empty)
  const baseline = current ? asDraft(current) : empty
  const changed = !samePayload(draft, baseline)
  const navigationChanged = Boolean(current) && navigationKey(draft) !== navigationKey(baseline)
  const passed = current?.revision.navigationStatus === 'PASS'
  const failed = current?.revision.navigationStatus === 'FAIL'
  // The server refuses a new revision of a submitted one that is still waiting for its check (CreatePoiRevisionCommand).
  const waiting = Boolean(current?.revision.isSubmitted) && !passed && !failed
  const mapMissingFromList = Boolean(poiId && current && !maps.data?.some(item => item.map.id === current.revision.mapVersionId))
  const mapDetailsQuery = useQuery({
    queryKey: ['technical', 'map', current?.revision.mapVersionId],
    queryFn: () => technicalApi.getMap(current!.revision.mapVersionId),
    enabled: mapMissingFromList,
  })
  const selectedItem = maps.data?.find(item => item.map.id === draft.mapVersionId)
    ?? (mapDetailsQuery.data?.map.id === draft.mapVersionId ? mapDetailsQuery.data : undefined)
  const eligibleMaps = (maps.data ?? []).filter(item => item.canUseForPoiPreparation)
  const mapLabel = staffMapLabels(maps.data ?? [])
  const { map: pickerMap, error: mapError, retry: retryMap } = useMapRaster(draft.mapVersionId)
  const mapEligible = Boolean(selectedItem?.canUseForPoiPreparation)
  const historicalReadOnly = Boolean(current && selectedItem && !mapEligible)
  // ADR-0062: a retired POI takes no new revision, submission or narration change until Staff reactivates it.
  const retired = Boolean(current?.retiredAt)
  const reactivate = useReactivatePoiProposal()
  const pose: PickerPose = { x: draft.x, y: draft.y, yaw: draft.yaw }

  const history = useQuery({ queryKey: ['technical', 'poi-history', poiId], queryFn: () => technicalApi.getPoiHistory(poiId!), enabled: Boolean(poiId) })
  const mapSectionRef = useRef<HTMLElement>(null)
  // "Sent before": this revision or an earlier one went to Technical, so sending now is a re-check.
  const sentBefore = Boolean(current) && (Boolean(current!.revision.isSubmitted) || passed || failed
    || Boolean(history.data?.revisions.some(revision => revision.isSubmitted)) || Boolean(history.data?.verificationRecords.length))
  // A PASS POI whose position, heading, camera and map are unchanged keeps its PASS on save, so it offers one button.
  const keepsPass = Boolean(current) && passed && !navigationChanged
  const failRecord = failed && current ? effectiveFailRecord(current.revision, history.data?.revisions ?? [], history.data?.verificationRecords ?? []) : null
  const invalidatePoi = async (id: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['technical', 'poi-proposals'] }),
      queryClient.invalidateQueries({ queryKey: ['technical', 'poi-proposal', id] }),
      queryClient.invalidateQueries({ queryKey: ['technical', 'poi-history', id] }),
    ])
  }
  const openPosition = () => {
    setSearchParams(params => { const next = new URLSearchParams(params); next.set('tab', 'vi-tri'); return next })
    // The panel is un-hidden on the next render; scroll once it is laid out.
    setTimeout(() => mapSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 0)
  }
  const update =(values: Partial<Draft>) => { setDraftOverride(value => ({ ...draft, ...value, ...values })); setError(null) }
  const mutate = async (action: 'save' | 'submit') => {
    // Enter in a field submits the form even while Save is disabled.
    if ((action === 'save' && current && !changed) || (waiting && changed)) return
    if (retired) return
    if (!mapEligible || historicalReadOnly || !draft.mapVersionId || !draft.name.trim() || !draft.purpose.trim() || draft.x == null || draft.y == null || draft.yaw == null) {
      setError('Cần chọn bản đồ, nhập tên, mục đích và đặt vị trí cùng hướng trên bản đồ.')
      return
    }
    const cameraProblem = headPresetProblem(draft.cameraPreset)
    if (cameraProblem) {
      setError(cameraProblem)
      return
    }
    // The server skips this for a pose kept from the current revision, so a content edit stays possible.
    const poseKept = current?.revision.mapVersionId === draft.mapVersionId && current.revision.x === draft.x && current.revision.y === draft.y
    const clearanceMeters = selectedItem?.poiClearanceMeters
    if (!poseKept && pickerMap && clearanceMeters != null && poseClearance(pickerMap, pickerMap.pixels ?? null, { x: draft.x, y: draft.y }, clearanceMeters) === 'blocked') {
      setError(clearanceMessage(clearanceMeters))
      return
    }
    const body = { ...payload(draft), x: draft.x, y: draft.y, yaw: draft.yaw }
    setBusy(true); setError(null)
    try {
      let result = current
      const created = !result
      // Nothing changed: no new revision, so the history does not gain a copy of the current one.
      if (!result || changed) {
        result = result ? await technicalApi.revisePoiProposal(result.id, result, body) : await technicalApi.createPoiProposal(body)
        setSaved(result)
        setDraftOverride(null)
        await invalidatePoi(result.id)
      }
      if (action === 'submit') {
        result = await technicalApi.submitPoiProposal(result.id, result)
        setSaved(result)
        await invalidatePoi(result.id)
      }
      const submitted = action === 'submit'
      if (created) celebrate({ title: `Đã tạo POI “${body.name}”`, detail: submitted ? 'Đã gửi kiểm chứng. POI dùng được cho tuyến khi kỹ thuật xác nhận đạt và thuyết minh được duyệt.' : 'Đã lưu, chưa gửi kiểm. Gửi kiểm chứng để kỹ thuật xác nhận đạt trước khi dùng cho tuyến.' })
      else notify(submitted
        ? { title: sentBefore ? `Đã gửi kiểm lại POI “${body.name}”` : `Đã gửi kiểm chứng POI “${body.name}”`, detail: 'Chờ kỹ thuật xác nhận. Gửi kiểm chứng chưa có nghĩa là đã đạt.' }
        : { title: `Đã lưu POI “${body.name}”`, detail: keepsPass ? 'Vẫn đạt kiểm chứng, không cần kiểm lại.'
          : failed && !navigationChanged ? 'Vẫn giữ kết quả không đạt. Sửa vị trí, hướng hoặc camera rồi gửi kiểm lại.'
          : sentBefore ? 'Chưa gửi kiểm lại. Gửi kiểm lại khi sẵn sàng để kỹ thuật kiểm tra trên robot.' : 'Chưa gửi kiểm chứng.' })
      if (!poiId) navigate(`/staff/manage/pois/${result.id}`, { replace: true, ...AFTER_SAVE })
    } catch (cause) {
      setError(errorText(cause))
      if (isMapEligibilityConflict(cause)) {
        await maps.refetch()
        if (current && mapMissingFromList) await mapDetailsQuery.refetch()
      }
    }
    finally { setBusy(false) }
  }

  if ((proposalQuery.isPending && poiId) || maps.isPending || (mapMissingFromList && mapDetailsQuery.isPending)) return <AdminPage><p className="p-8 text-sm text-[#64748b]">Đang tải…</p></AdminPage>
  if (proposalQuery.isError || maps.error || (mapMissingFromList && mapDetailsQuery.isError)) return <AdminPage><p role="alert" className="p-4 text-sm text-red-700">Không tải được điểm tham quan hoặc bản đồ. Hãy thử tải lại trang.</p></AdminPage>

  const back = <Link to="/staff/manage/pois" className="mb-2 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-[#475569] hover:text-[#2d3748] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]"><ArrowLeft size={15} aria-hidden="true" />Danh sách POI</Link>
  if (!poiId && eligibleMaps.length === 0) return <AdminPage>
    {back}
    <PageHeader eyebrow="Chuẩn bị Tour · POI" title="Tạo điểm tham quan" description="Điểm tham quan được đặt trên một bản đồ đã kiểm tra đạt." />
    <section className={`${panelClass} px-6 py-10 text-center`} role="status">
      <MapPinOff size={28} className="mx-auto text-[#b7791f]" aria-hidden="true" />
      <h2 className="mt-3 text-[15px] font-semibold text-[#0f172a]">Chưa có bản đồ được kỹ thuật xác nhận đạt</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-[#64748b]">Điểm tham quan phải được đặt trên một bản đồ đã kiểm tra đạt. Hãy liên hệ kỹ thuật viên trước khi tạo POI.</p>
      {(maps.data?.length ?? 0) > 0 && <ul className="mx-auto mt-4 max-w-md divide-y divide-[#eef1f4] rounded-xl border border-[#e2e8f0] text-left text-sm">
        {maps.data!.map(item => <li key={item.map.id} className="flex items-center justify-between gap-3 px-3 py-2"><span className="text-[#334155]">{mapLabel(item.map)}</span><span className="text-xs font-semibold text-[#7d5310]">{mapCheckLabel(item.technicalCheckStatus)}</span></li>)}
      </ul>}
    </section>
  </AdminPage>

  const locked = !mapEligible || historicalReadOnly || retired
  const yawDeg = draft.yaw == null ? null : Math.round((draft.yaw * 180 / Math.PI) * 10) / 10
  const placed = draft.x != null && draft.y != null
  const contentReady = Boolean(draft.name.trim() && draft.purpose.trim())
  const narration = current ? narrationStatus(current.narration) : null
  // A PASS alone is not enough for a route: its narration must be approved as well (ADR-0060).
  const passedText = narration?.approved ? 'Đã đạt, dùng được trong tuyến.' : 'Đã đạt kiểm chứng. Còn chờ duyệt thuyết minh trước khi dùng cho tuyến.'
  const steps: Array<[boolean, string, string]> = [
    [Boolean(selectedItem), 'Bản đồ đã chọn', 'Chưa chọn bản đồ'],
    [placed, 'Vị trí đã đặt', 'Vị trí chưa đặt'],
    [draft.yaw != null, 'Hướng đã chọn', 'Hướng chưa chọn'],
    [contentReady, 'Nội dung đủ', 'Nội dung chưa đủ'],
  ]
  // What Save and Send would do from here, in the server's terms; see navigationKey above.
  const outcome: { tone: 'ok' | 'info' | 'warn'; text: string } | null = !current
    ? { tone: 'ok', text: 'Đủ thông tin. Lưu rồi gửi kiểm sau, hoặc gửi ngay để kỹ thuật kiểm tra trên robot.' }
    : !changed
      ? passed ? { tone: narration?.approved ? 'ok' : 'info', text: passedText }
        : waiting ? { tone: 'info', text: 'Đang chờ kỹ thuật kiểm tra.' }
        : failed ? { tone: 'warn', text: current.revision.isSubmitted ? 'Kỹ thuật ghi không đạt. Sửa vị trí, hướng hoặc góc camera rồi gửi kiểm chứng lại.' : 'Kỹ thuật ghi không đạt cho vị trí này. Gửi kiểm chứng để kiểm tra lại.' }
        : { tone: 'info', text: 'Đã lưu, chưa gửi kiểm.' }
      : waiting ? { tone: 'warn', text: 'Đang chờ kỹ thuật kiểm tra nên chưa lưu được thay đổi. Chờ có kết quả rồi sửa tiếp.' }
      : navigationChanged
        ? passed ? { tone: 'warn', text: 'Lưu sẽ tạo bản mới và phải gửi kiểm chứng lại. Tuyến và Tour đang dùng bản cũ không bị ảnh hưởng.' }
          : failed ? { tone: 'info', text: 'Lưu sẽ tạo bản mới và phải gửi kiểm chứng lại.' }
          : { tone: 'info', text: 'Lưu sẽ tạo phiên bản mới, chưa gửi kiểm.' }
        : passed ? { tone: 'ok', text: 'Lưu sẽ tạo bản mới và giữ kết quả đạt.' }
          : failed ? { tone: 'warn', text: 'Lưu sẽ tạo bản mới. Vị trí, hướng và góc camera không đổi nên vẫn giữ kết quả không đạt.' }
          : { tone: 'info', text: 'Lưu sẽ tạo phiên bản mới, chưa gửi kiểm.' }
  const saveBlocked = Boolean(current) && (!changed || waiting)
  // Sending again adds nothing when the revision it would send is already submitted or already holds a PASS.
  const submitBlocked = Boolean(current) && (waiting || (!changed && (current!.revision.isSubmitted || passed)) || (changed && !navigationChanged && passed))
  const missing = [!draft.mapVersionId && 'bản đồ', !placed && 'vị trí', draft.yaw == null && 'hướng robot', !draft.name.trim() && 'tên POI', !draft.purpose.trim() && 'mục đích', headPresetProblem(draft.cameraPreset) && 'hoạt động đầu camera hợp lệ'].filter(Boolean) as string[]
  const field = `${inputClass} mt-1.5`
  const label = 'flex items-center gap-1 text-sm font-medium text-[#2d3748]'
  const required = <span aria-hidden="true" className="text-[#c53030]">*</span>
  return <AdminPage>
    <UnsavedChangesGuard when={changed && !locked} />
    {back}
    <header className="mb-5">
      <h1 className="text-2xl leading-tight font-bold text-[#2d3748]">{poiId ? (current?.revision.name ?? 'Điểm tham quan') : 'Tạo điểm tham quan'}</h1>
      <p className="mt-1 text-sm text-[#718096]">Đặt vị trí và hướng robot, sau đó hoàn thiện nội dung.</p>
    </header>
    {current && retired && <div className="mb-4"><Notice tone="warn">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1">POI này đã ngưng dùng. Tuyến và Tour đã lưu vẫn giữ điểm này, nhưng tuyến mới không chọn được. Trang chỉ để xem; dùng lại POI để sửa, gửi kiểm hoặc đổi thuyết minh.</span>
        {current.canReactivate && <button type="button" disabled={reactivate.isPending} className={buttonClass('secondary', 'sm')}
          onClick={() => reactivate.mutate(current, { onSuccess: result => { setSaved(result); void invalidatePoi(result.id) } })}>
          {reactivate.isPending ? 'Đang lưu…' : 'Dùng lại'}</button>}
      </span>
      {reactivate.error && <span role="alert" className="mt-1 block text-[#a4473d]">{errorText(reactivate.error)}</span>}
    </Notice></div>}
    {current?.discardedAt && <div className="mb-4"><Notice tone="warn">POI này đã bị xoá khỏi danh sách. Trang chỉ để xem.</Notice></div>}
    {current && <PoiHeadline proposal={current} />}
    {current && failed && <PoiFailBanner record={failRecord} onFix={openPosition}
      cameraPreset={history.data?.revisions.find(item => item.id === failRecord?.proposalRevisionId)?.cameraPreset ?? current.revision.cameraPreset} />}
    {current && <div role="tablist" aria-label="Phần của POI" className="mb-4 flex flex-wrap gap-1.5 border-b border-[#e2e8f0]">
      {TABS.map(([key, title]) => <button key={key} type="button" role="tab" id={`poi-tab-${key}`} aria-selected={tab === key} aria-controls={`poi-panel-${key}`}
        onClick={() => setSearchParams(params => { const next = new URLSearchParams(params); next.set('tab', key); return next })}
        className={`-mb-px rounded-t-lg border-b-2 px-3.5 py-2 text-sm font-semibold transition-colors ${focus} ${tab === key ? 'border-[#2563eb] text-[#1e293b]' : 'border-transparent text-[#64748b] hover:text-[#1e293b]'}`}>{title}</button>)}
    </div>}

    {/* Every panel stays mounted and only the chosen one shows, so switching tabs keeps what is being typed. */}
    <div role="tabpanel" id="poi-panel-vi-tri" aria-labelledby={current ? 'poi-tab-vi-tri' : undefined} hidden={tab !== 'vi-tri'}>
    {current?.revision.verificationMethod && <div className="mb-4"><Notice tone="info">Cách kiểm chứng: {verificationMethodLabel[current.revision.verificationMethod]}.</Notice></div>}
    {current?.sourcePoiId && !current.narration?.approved && <div className="mb-4"><Notice tone="warn">POI này được nhập từ tệp ghi pose trên robot. Thêm tên ở đây và viết thuyết minh ở tab Thuyết minh; vị trí giữ nguyên thì không phải kiểm chứng lại.</Notice></div>}
    {current && selectedItem && !selectedItem.canUseForPoiPreparation && <div className="mb-4"><Notice tone="warn">Bản đồ của điểm này hiện không đủ điều kiện để chỉnh sửa: {selectedItem.preparationBlockReason} Lịch sử và kết quả kiểm chứng vẫn được giữ; bản đồ và vị trí bên dưới chỉ để xem.</Notice></div>}

    <section className={`${card} mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5`} aria-label="Bản đồ và tiến độ">
      <span className="text-sm text-[#718096]">Bản đồ</span>
      <select title="" id="poi-map" aria-label="Bản đồ" className={`min-h-10 min-w-56 rounded-xl border border-[#e2e8f0] bg-white px-3 text-sm font-semibold text-[#2d3748] ${focus}`} required value={draft.mapVersionId} onChange={event => { update({ mapVersionId: event.target.value, x: null, y: null, yaw: null }); setPoseMode('position') }}><option value="">— Chọn bản đồ —</option>{maps.data?.map(item => { const { map } = item; return <option key={map.id} value={map.id} disabled={!item.canUseForPoiPreparation}>{mapLabel(map, item.canUseForPoiPreparation ? null : mapCheckLabel(item.technicalCheckStatus))}</option> })}{selectedItem && !maps.data?.some(item => item.map.id === selectedItem.map.id) && <option value={selectedItem.map.id} disabled={!selectedItem.canUseForPoiPreparation}>{mapLabel(selectedItem.map, mapCheckLabel(selectedItem.technicalCheckStatus))}</option>}</select>
      {selectedItem && selectedItem.currentlyDeployedOn.length > 0 && <span className="rounded-lg bg-[#edf3fc] px-2.5 py-1 text-xs font-medium text-[#3f62a0]">Robot đang chạy bản đồ này: {selectedItem.currentlyDeployedOn.map(robot => robot.robotCode).join(', ')}</span>}
      <ol aria-label="Tiến độ" className="flex flex-wrap items-center gap-x-3 gap-y-2 xl:ml-auto xl:border-l xl:border-[#e2e8f0] xl:pl-4">
        {steps.map(([ok, done, todo], index) => (
          <li key={done} className="flex items-center gap-2 text-[13px]">
            {index > 0 && <span aria-hidden="true" className="h-px w-3 bg-[#cbd5e1]" />}
            <span aria-hidden="true" className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${ok ? 'bg-[#edf3fb] text-[#4a6fa5]' : 'bg-[#f1f5f9] text-[#94a3b8]'}`}>{ok ? <Check size={12} strokeWidth={3} /> : index + 1}</span>
            <span className={ok ? 'font-semibold text-[#2d3748]' : 'text-[#718096]'}>{ok ? done : todo}</span>
          </li>
        ))}
      </ol>
    </section>
    {selectedItem?.technicalCheckStatus === 'PASSED' && selectedItem.currentlyDeployedOn.length === 0 && <div role="status" className="mb-4"><Notice tone="warn">Chưa có robot nào đang chạy bản đồ này. POI có thể không kiểm chứng được cho đến khi kỹ thuật triển khai lại.</Notice></div>}

    <form id="poi-form" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]" onSubmit={event => { event.preventDefault(); void mutate('save') }}>
      <section ref={mapSectionRef} className={`${card} min-w-0 scroll-mt-4 p-5`} aria-label="Vị trí và hướng robot">
        <h2 className="mb-3 text-lg font-bold text-[#2d3748]">Vị trí & hướng robot</h2>
        {mapError && <div role="alert" className="mb-3"><Notice tone="danger" action={<button type="button" onClick={retryMap} className={buttonClass('secondary', 'sm')}>Thử lại</button>}>{mapError}</Notice></div>}
        {pickerMap && selectedItem ? <PoiPosePicker map={pickerMap} pose={pose} editable={mapEligible} mode={mapEligible ? poseMode : 'pan'} onModeChange={setPoseMode} onPoseChange={value => update(value)} clearanceMeters={selectedItem.poiClearanceMeters} /> : <div className="grid min-h-[380px] place-items-center rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-5 text-center text-sm text-[#718096]"><div><MapPinned size={26} className="mx-auto mb-2 text-[#a0aec0]" aria-hidden="true" />{mapDetailsQuery.isError ? 'Không tải được bản đồ lịch sử.' : mapError ? 'Chưa tải được bản đồ.' : draft.mapVersionId ? 'Đang tải bản đồ…' : 'Chọn bản đồ ở trên để đặt vị trí điểm.'}</div></div>}
        {/* One set of fields, synced both ways with the map: clicking the map fills them, typing moves the marker. */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <PoseNumberField label="X (m)" value={draft.x} disabled={locked} change={x => update({ x: x == null ? null : quantizeMeters(x) })} />
          <PoseNumberField label="Y (m)" value={draft.y} disabled={locked} change={y => update({ y: y == null ? null : quantizeMeters(y) })} />
          <PoseNumberField label="Hướng (độ)" value={yawDeg} disabled={locked} change={deg => update({ yaw: deg == null ? null : yawFromDegrees(deg) })}
            hint={draft.yaw == null ? undefined : `= ${draft.yaw.toFixed(6)} rad`} />
        </div>
        <div className="mt-5 space-y-2 border-t border-[#e2e8f0] pt-5">
          <h2 className="text-lg font-bold text-[#2d3748]">Camera & tư liệu</h2>
          <HeadCameraPresetField value={draft.cameraPreset} onChange={cameraPreset => update({ cameraPreset })} />
        </div>
      </section>

      {/* Both cards share the row's height, so the shorter one never ends in a bare
          strip of page; its fields follow the scroll inside the card instead. */}
      <aside className={`${card} p-5`} aria-label="Nội dung điểm">
        <div className="space-y-5 lg:sticky lg:top-4">
        <div className="space-y-3.5">
          <h2 className="text-lg font-bold text-[#2d3748]">Thông tin điểm</h2>
          <div><span className={label}><label htmlFor="poi-name">Tên POI</label>{required}</span><input id="poi-name" readOnly={retired} className={field} required maxLength={150} value={draft.name} onChange={e => update({ name: e.target.value })} placeholder="Sảnh thư viện" /></div>
          <div><span className={label}><label htmlFor="poi-purpose">Mục đích</label>{required}</span><input id="poi-purpose" readOnly={retired} className={field} required maxLength={500} value={draft.purpose} onChange={e => update({ purpose: e.target.value })} placeholder="Giới thiệu khu tự học" /></div>
          <div><span className={label}><label htmlFor="poi-description">Ghi chú nội bộ (không hiện cho học sinh)</label><span className="font-normal text-[#718096]">(không bắt buộc)</span></span><textarea id="poi-description" readOnly={retired} className={field} rows={3} maxLength={1000} value={draft.description} onChange={e => update({ description: e.target.value })} placeholder="Ghi chú cho Staff về điểm này…" />
            {/* The API field stays `description`; owners took it for the narration students hear. */}
            <p className="mt-1 text-xs text-[#718096]">Lời guide đọc cho học sinh là Thuyết minh, sửa ở {poiId ? <Link to={{ search: '?tab=thuyet-minh' }} className="font-semibold text-[#2d719e] underline">tab Thuyết minh</Link> : 'tab Thuyết minh sau khi tạo POI'}.</p></div>
        </div>
        <p className="flex items-start gap-2 text-xs text-[#718096]"><Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />Gửi đề xuất để kỹ thuật viên kiểm chứng. Mỗi lần lưu tạo một bản mới. {poiId ? 'Thuyết minh viết và duyệt ở tab Thuyết minh.' : 'Thuyết minh viết sau khi tạo POI, ở trang chi tiết của điểm.'}</p>
        </div>
      </aside>
    </form>
    </div>

    {current && <div role="tabpanel" id="poi-panel-thuyet-minh" aria-labelledby="poi-tab-thuyet-minh" hidden={tab !== 'thuyet-minh'}><PoiNarrationPanel proposal={current} /></div>}

    {current && <div role="tabpanel" id="poi-panel-lich-su" aria-labelledby="poi-tab-lich-su" hidden={tab !== 'lich-su'}>
      <PoiHistory proposalId={current.id} revisions={history.data?.revisions ?? []} records={history.data?.verificationRecords ?? []} loading={history.isPending} /></div>}

    {/* The page's actions stay in reach at the bottom of the screen; they save the position, camera and content only. */}
    {tab === 'vi-tri' && <div className="sticky bottom-20 z-20 lg:bottom-3 mt-4 rounded-[15px] border border-[#e2e8f0] bg-white/90 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.25)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <div className="min-w-0 flex-1">
          {error ? <p role="alert" className="flex items-start gap-2 text-sm text-[#a4473d]"><CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />{error}</p>
            : locked && current ? <p className="text-sm text-[#718096]">Điểm này đang ở chế độ chỉ xem.</p>
            : missing.length ? <p className="flex items-start gap-2.5 text-sm"><CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[#c08a1e]" /><span><b className="block font-semibold text-[#2d3748]">Chưa đủ thông tin</b><span className="text-[#718096]">Còn thiếu: {missing.join(', ')}.</span></span></p>
            : outcome && <p id="poi-outcome" className="flex items-start gap-2 text-sm font-semibold text-[#2d3748]">{outcome.tone === 'ok' ? <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[#3f62a0]" /> : outcome.tone === 'warn' ? <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[#c08a1e]" /> : <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[#718096]" />}{outcome.text}</p>}
        </div>
        <p className="hidden text-xs text-[#a0aec0] xl:block">Lưu tạo bản mới; gửi kiểm chứng chưa phải kết quả đạt.</p>
        <Link to="/staff/manage/pois" className={buttonClass('secondary')}>Hủy bỏ</Link>
        {/* A PASS POI whose navigation is unchanged keeps its PASS, so sending it again would add nothing. */}
        {keepsPass
          ? <button type="submit" form="poi-form" disabled={busy || locked || saveBlocked} aria-describedby={saveBlocked ? 'poi-outcome' : undefined} className={buttonClass('primary')}>{busy ? 'Đang lưu…' : 'Lưu (giữ kết quả Đạt)'}</button>
          : <>
            <button type="submit" form="poi-form" disabled={busy || locked || saveBlocked} aria-describedby={saveBlocked ? 'poi-outcome' : undefined} className={buttonClass('secondary')}>{busy ? 'Đang lưu…' : 'Lưu, chưa gửi kiểm'}</button>
            <button type="button" disabled={busy || locked || submitBlocked} aria-describedby={submitBlocked ? 'poi-outcome' : undefined} onClick={() => void mutate('submit')} className={buttonClass('primary')}>{busy ? 'Đang xử lý…' : sentBefore ? 'Lưu và gửi kiểm lại' : 'Lưu và gửi kiểm chứng'}</button>
          </>}
      </div>
    </div>}
  </AdminPage>
}

/** Always above the tabs: the navigation check, the narration and whether a route can use the POI, by the server's rule. */
function PoiHeadline({ proposal }: { proposal: PoiProposal }) {
  const navigation = poiStatus(proposal.revision)
  const narration = narrationStatus(proposal.narration)
  const use = routeUseLine(proposal)
  return <section aria-label="Tình trạng POI" className={`${card} mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3`}>
    <span className="text-sm text-[#475569]">Kiểm chứng: <ToneBadge tone={proposal.retiredAt ? 'muted' : navigation.tone}>{navigation.label}{proposal.revision.verificationSourceRevisionId && proposal.revision.verificationSourceRevisionId !== proposal.revision.id ? ' · giữ kết quả của bản lưu trước' : ''}</ToneBadge></span>
    <span className="text-sm text-[#475569]">Thuyết minh: <ToneBadge tone={proposal.retiredAt ? 'muted' : narration.tone}>{narration.label}</ToneBadge></span>
    {proposal.retiredAt && <ToneBadge tone="muted">Ngưng dùng</ToneBadge>}
    {proposal.discardedAt && <ToneBadge tone="muted">Đã xoá</ToneBadge>}
    <span className={`text-sm font-semibold sm:ml-auto ${use.usable ? 'text-[#166534]' : 'text-[#7d5310]'}`}>Dùng được cho tuyến: {use.text}</span>
  </section>
}

function isMapEligibilityConflict(error: unknown) {
  if (!error || typeof error !== 'object' || !('body' in error) || typeof error.body !== 'string') return false
  try {
    const code = (JSON.parse(error.body) as { errors?: { code?: unknown } }).errors?.code
    return code === 'TECHNICAL_CHECK_PENDING' || code === 'TECHNICAL_CHECK_NOT_PASSED'
  } catch { return false }
}

function PoseNumberField({ label, value, disabled, change, hint }: { label: string; value: number | null; disabled: boolean; change: (value: number | null) => void; hint?: string }) {
  return <div className="text-sm">
    <label>{label}<input type="number" disabled={disabled} className={`${inputClass} mt-1`} step="any" value={value ?? ''} onChange={event => change(event.target.value === '' ? null : globalThis.Number(event.target.value))} /></label>
    {hint && <p className="mt-1 font-mono text-xs text-[#718096]">{hint}</p>}
  </div>
}

const observationKeys = ['reached', 'stopped', 'localizationPassed', 'cameraPresetConfirmed'] as const

/** Under the status strip on every tab while the result in effect is Không đạt: why, what failed, who and when. */
function PoiFailBanner({ cameraPreset, record, onFix }: { cameraPreset: string; record: PoiVerification | null; onFix: () => void }) {
  // The camera step names the action of the revision that was checked, as in the history tab.
  const labels = poiObservationLabels(cameraPreset)
  const failedSteps = record ? observationKeys.flatMap((key, index) => record[key] === false ? [labels[index]] : []) : []
  return <section aria-label="Kết quả kiểm chứng không đạt" className="mb-4 rounded-[15px] border border-[#f1c9c3] bg-[#fbeeec] px-5 py-3.5 text-sm text-[#7f2f27]">
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-2 font-semibold"><CircleAlert size={16} aria-hidden="true" className="shrink-0" />Kỹ thuật ghi không đạt</p>
        <p>Lý do: {record?.reason?.trim() || 'Không ghi lý do.'}</p>
        {failedSteps.length > 0 && <div>
          <p>Không đạt ở:</p>
          <ul aria-label="Bước không đạt" className="ml-5 list-disc">{failedSteps.map(step => <li key={step}>{step}</li>)}</ul>
        </div>}
        {record && <p className="text-xs text-[#a4473d]">Robot {record.robotCode} · ghi lúc {campusShortStamp(record.checkedAt)}</p>}
      </div>
      <button type="button" onClick={onFix} className={buttonClass('secondary', 'sm')}>Sửa vị trí</button>
    </div>
  </section>
}
