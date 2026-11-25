import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, CircleAlert, Info, MapPinned, MapPinOff } from 'lucide-react'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { celebrate, notify } from '../../../components/ui/toast-store'
import { technicalApi, type PoiProposal, type PoiVerification } from '../../../features/technical/api/technical'
import { errorText } from '../../../features/technical/technical-format'
import { useMapVersions } from '../../../features/technical/technical-hooks'
import { mapCheckLabel, narrationStatus, poiCheckBadge, poiObservationLabels, routeUseLine, verificationMethodLabel } from '../../../features/technical/poi-labels'
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
import { poiThemeClass, poiInputClass } from '../../../features/administration/pois/poi-ui'

function PoiPage({ children }: { children: ReactNode }) {
  return <AdminPage><div className={poiThemeClass}>{children}</div></AdminPage>
}

const card = 'ct-panel min-w-0 rounded-[15px] bg-white shadow-[0_3.5px_5.5px_var(--poi-shadow)]'
/** The page's tabs, kept in `?tab=` so a link (the list's "Chờ duyệt" badge) can open one directly. */
const TABS = [['vi-tri', 'Vị trí & camera'], ['thuyet-minh', 'Thuyết minh'], ['lich-su', 'Lịch sử']] as const
type Tab = typeof TABS[number][0]
const INSPECTOR_TABS = [['info', 'Thông tin điểm'], ['camera', 'Camera']] as const
type Inspector = typeof INSPECTOR_TABS[number][0]
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--poi-focus)] focus-visible:ring-offset-2'

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
  const inspector: Inspector = searchParams.get('panel') === 'camera' ? 'camera' : 'info'
  const chooseInspector = (panel: Inspector) => setSearchParams(params => {
    const next = new URLSearchParams(params)
    next.set('panel', panel)
    return next
  })
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
  const selectedMapLabel = selectedItem
    ? mapLabel(selectedItem.map, selectedItem.canUseForPoiPreparation ? null : mapCheckLabel(selectedItem.technicalCheckStatus))
    : 'Chọn bản đồ'
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

  if ((proposalQuery.isPending && poiId) || maps.isPending || (mapMissingFromList && mapDetailsQuery.isPending)) return <PoiPage><p className="p-8 text-sm text-[var(--poi-muted)]">Đang tải…</p></PoiPage>
  if (proposalQuery.isError || maps.error || (mapMissingFromList && mapDetailsQuery.isError)) return <PoiPage><p role="alert" className="p-4 text-sm text-red-700">Không tải được điểm tham quan hoặc bản đồ. Hãy thử tải lại trang.</p></PoiPage>

  const back = <Link to="/staff/manage/pois" className="mb-2 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--poi-muted)] hover:text-[var(--poi-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--poi-focus)]"><ArrowLeft size={15} aria-hidden="true" />Danh sách POI</Link>
  if (!poiId && eligibleMaps.length === 0) return <PoiPage>
    {back}
    <PageHeader eyebrow="Chuẩn bị Tour · POI" title="Tạo điểm tham quan" description="Điểm tham quan được đặt trên một bản đồ đã kiểm tra đạt." />
    <section className={`${panelClass} px-6 py-10 text-center`} role="status">
      <MapPinOff size={28} className="mx-auto text-[var(--poi-warn)]" aria-hidden="true" />
      <h2 className="mt-3 text-[15px] font-semibold text-[var(--poi-ink)]">Chưa có bản đồ được kỹ thuật xác nhận đạt</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-[var(--poi-muted)]">Điểm tham quan phải được đặt trên một bản đồ đã kiểm tra đạt. Hãy liên hệ kỹ thuật viên trước khi tạo POI.</p>
      {(maps.data?.length ?? 0) > 0 && <ul className="mx-auto mt-4 max-w-md divide-y divide-[var(--poi-rule)] rounded-xl border border-[var(--poi-rule)] text-left text-sm">
        {maps.data!.map(item => <li key={item.map.id} className="flex items-center justify-between gap-3 px-3 py-2"><span className="text-[var(--poi-text)]">{mapLabel(item.map)}</span><span className="text-xs font-semibold text-[var(--poi-warn)]">{mapCheckLabel(item.technicalCheckStatus)}</span></li>)}
      </ul>}
    </section>
  </PoiPage>

  // A submitted revision waiting for its check takes no new revision (CreatePoiRevisionCommand), so its fields are locked
  // up front instead of failing on save. There is no way to withdraw a submission yet.
  const frozen = retired || waiting
  const locked = !mapEligible || historicalReadOnly || frozen
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
    ? { tone: 'ok', text: 'Đủ thông tin để lưu hoặc gửi kiểm chứng.' }
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
  const field = `${poiInputClass} mt-1.5`
  const label = 'flex items-center gap-1 text-sm font-medium text-[var(--poi-ink)]'
  const required = <span aria-hidden="true" className="text-[var(--poi-danger)]">*</span>
  return <PoiPage>
    <UnsavedChangesGuard when={changed && !locked} />
    {back}
    <header className="mb-5">
      <h1 className="text-2xl leading-tight font-bold text-[var(--poi-ink)]">{poiId ? (current?.revision.name ?? 'Điểm tham quan') : 'Tạo điểm tham quan'}</h1>
      <p className="mt-1 text-sm text-[var(--poi-muted)]">Đặt vị trí và hướng robot, sau đó hoàn thiện nội dung.</p>
    </header>
    {current && retired && <div className="mb-4"><Notice tone="warn">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1">POI này đã ngưng dùng. Tuyến và Tour đã lưu vẫn giữ điểm này, nhưng tuyến mới không chọn được. Trang chỉ để xem; dùng lại POI để sửa, gửi kiểm hoặc đổi thuyết minh.</span>
        {current.canReactivate && <button type="button" disabled={reactivate.isPending} className={buttonClass('secondary', 'sm')}
          onClick={() => reactivate.mutate(current, { onSuccess: result => { setSaved(result); void invalidatePoi(result.id) } })}>
          {reactivate.isPending ? 'Đang lưu…' : 'Dùng lại'}</button>}
      </span>
      {reactivate.error && <span role="alert" className="mt-1 block text-[var(--poi-danger)]">{errorText(reactivate.error)}</span>}
    </Notice></div>}
    {current?.discardedAt && <div className="mb-4"><Notice tone="warn">POI này đã bị xoá khỏi danh sách. Trang chỉ để xem.</Notice></div>}
    {current && waiting && !retired && <div className="mb-4"><Notice tone="info">Đang chờ kỹ thuật kiểm tra trên robot nên chưa sửa được vị trí, camera hay nội dung. Khi có kết quả Đạt hoặc Không đạt, bạn sửa tiếp được. Thuyết minh vẫn viết và duyệt được ở tab Thuyết minh.</Notice></div>}
    {current && <PoiHeadline proposal={current} />}
    {current && failed && <PoiFailBanner record={failRecord} onFix={openPosition}
      cameraPreset={history.data?.revisions.find(item => item.id === failRecord?.proposalRevisionId)?.cameraPreset ?? current.revision.cameraPreset} />}
    {current && <div role="tablist" aria-label="Phần của POI" className="mb-4 flex flex-wrap gap-1.5 border-b border-[var(--poi-rule)]">
      {TABS.map(([key, title]) => <button key={key} type="button" role="tab" id={`poi-tab-${key}`} aria-selected={tab === key} aria-controls={`poi-panel-${key}`}
        onClick={() => setSearchParams(params => { const next = new URLSearchParams(params); next.set('tab', key); return next })}
        className={`-mb-px rounded-t-lg border-b-2 px-3.5 py-2 text-sm font-semibold transition-colors active:bg-[var(--poi-soft)] disabled:opacity-50 motion-reduce:transition-none ${focus} ${tab === key ? 'border-[var(--poi-focus)] text-[var(--poi-visor)]' : 'border-transparent text-[var(--poi-muted)] hover:text-[var(--poi-visor)]'}`}>{title}</button>)}
    </div>}

    {/* Every panel stays mounted and only the chosen one shows, so switching tabs keeps what is being typed. */}
    <div role="tabpanel" id="poi-panel-vi-tri" aria-labelledby={current ? 'poi-tab-vi-tri' : undefined} hidden={tab !== 'vi-tri'}>
    {current?.revision.verificationMethod && <div className="mb-4"><Notice tone="info">Cách kiểm chứng: {verificationMethodLabel[current.revision.verificationMethod]}.</Notice></div>}
    {current?.sourcePoiId && !current.narration?.approved && <div className="mb-4"><Notice tone="warn">POI này được nhập từ tệp ghi pose trên robot. Thêm tên ở đây và viết thuyết minh ở tab Thuyết minh; vị trí giữ nguyên thì không phải kiểm chứng lại.</Notice></div>}
    {current && selectedItem && !selectedItem.canUseForPoiPreparation && <div className="mb-4"><Notice tone="warn">Bản đồ của điểm này hiện không đủ điều kiện để chỉnh sửa: {selectedItem.preparationBlockReason} Lịch sử và kết quả kiểm chứng vẫn được giữ; bản đồ và vị trí bên dưới chỉ để xem.</Notice></div>}

    <form id="poi-form" className={`${poiThemeClass} overflow-clip rounded-2xl border border-[var(--poi-rule)] bg-[var(--poi-paper)] shadow-xs`}
      onInvalidCapture={event => {
        const target = event.target
        if (!(target instanceof HTMLElement)) return
        const next = target.closest('#poi-inspector-info') ? 'info' : target.closest('#poi-inspector-camera') ? 'camera' : null
        if (next && next !== inspector) {
          event.preventDefault()
          chooseInspector(next)
          requestAnimationFrame(() => target.focus())
        }
      }}
      onSubmit={event => { event.preventDefault(); void mutate('save') }}>
    <section className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[var(--poi-rule)] p-4 lg:px-5" aria-label="Bản đồ và tiến độ">
      <label htmlFor="poi-map" className="text-sm text-[var(--poi-muted)]">Bản đồ</label>
      <select title={selectedMapLabel} id="poi-map" aria-label="Bản đồ" disabled={Boolean(current) && frozen} className={`h-10 w-full min-w-0 appearance-auto! truncate rounded-xl border border-[var(--poi-control)] bg-[var(--poi-paper)] px-3 text-sm font-semibold text-[var(--poi-text)] sm:w-80 ${focus}`} required value={draft.mapVersionId} onChange={event => { update({ mapVersionId: event.target.value, x: null, y: null, yaw: null }); setPoseMode('position') }}><option value="">Chọn bản đồ</option>{maps.data?.map(item => { const { map } = item; return <option key={map.id} value={map.id} disabled={!item.canUseForPoiPreparation}>{mapLabel(map, item.canUseForPoiPreparation ? null : mapCheckLabel(item.technicalCheckStatus))}</option> })}{selectedItem && !maps.data?.some(item => item.map.id === selectedItem.map.id) && <option value={selectedItem.map.id} disabled={!selectedItem.canUseForPoiPreparation}>{mapLabel(selectedItem.map, mapCheckLabel(selectedItem.technicalCheckStatus))}</option>}</select>
      {selectedItem && selectedItem.currentlyDeployedOn.length > 0 && <span className="max-w-full rounded-lg bg-[var(--poi-soft)] px-2.5 py-1 text-xs font-medium text-[var(--poi-accent-ink)] [overflow-wrap:anywhere]">Robot đang dùng: {selectedItem.currentlyDeployedOn.map(robot => robot.robotCode).join(', ')}</span>}
      <ol aria-label="Tiến độ" className="flex flex-wrap items-center gap-x-3 gap-y-2 xl:ml-auto xl:border-l xl:border-[var(--poi-rule)] xl:pl-4">
        {steps.map(([ok, done, todo], index) => (
          <li key={done} className="flex items-center gap-2 text-[13px]">
            {index > 0 && <span aria-hidden="true" className="h-px w-3 bg-[var(--poi-body)]" />}
            <span aria-hidden="true" className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${ok ? 'bg-[var(--poi-soft)] text-[var(--poi-accent-ink)]' : 'bg-[var(--poi-ground)] text-[var(--poi-control)]'}`}>{ok ? <Check size={12} strokeWidth={3} /> : index + 1}</span>
            <span className={ok ? 'font-semibold text-[var(--poi-ink)]' : 'text-[var(--poi-muted)]'}>{ok ? done : todo}</span>
          </li>
        ))}
      </ol>
    </section>
    {selectedItem?.technicalCheckStatus === 'PASSED' && selectedItem.currentlyDeployedOn.length === 0 && <div role="status" className="mb-4"><Notice tone="warn">Chưa có robot dùng bản đồ này. Cần kỹ thuật triển khai trước khi kiểm chứng POI.</Notice></div>}

    <div className="grid lg:grid-cols-[minmax(0,1fr)_370px]">
      <div className="min-w-0 bg-[var(--poi-ground)]">
      <section ref={mapSectionRef} className="min-w-0 scroll-mt-4 p-4 lg:sticky lg:top-4 lg:p-5" aria-label="Vị trí và hướng robot">
        <h2 className="mb-3 text-base font-semibold text-[var(--poi-ink)]">Vị trí & hướng robot</h2>
        {mapError && <div role="alert" className="mb-3"><Notice tone="danger" action={<button type="button" onClick={retryMap} className={buttonClass('secondary', 'sm')}>Thử lại</button>}>{mapError}</Notice></div>}
        {pickerMap && selectedItem ? <PoiPosePicker layout="workbench" map={pickerMap} pose={pose} editable={mapEligible && !frozen} mode={mapEligible && !frozen ? poseMode : 'pan'} onModeChange={setPoseMode} onPoseChange={value => update(value)} clearanceMeters={selectedItem.poiClearanceMeters} /> : <div className="grid min-h-[260px] lg:min-h-[440px] place-items-center rounded-xl border border-[var(--poi-rule)] bg-[var(--poi-paper)] p-5 text-center text-sm text-[var(--poi-muted)]"><div><MapPinned size={26} className="mx-auto mb-2 text-[var(--poi-control)]" aria-hidden="true" />{mapDetailsQuery.isError ? 'Không tải được bản đồ lịch sử.' : mapError ? 'Chưa tải được bản đồ.' : draft.mapVersionId ? 'Đang tải bản đồ…' : 'Chọn bản đồ ở trên để đặt vị trí điểm.'}</div></div>}
        <p className="mt-4 text-sm text-[var(--poi-ink)]">{placed && draft.yaw != null
          ? `Đã đặt vị trí trên bản đồ, robot quay hướng ${yawDegreesText(draft.yaw)}°.`
          : placed ? 'Đã đặt vị trí. Tiếp theo, chọn hướng robot nhìn trên bản đồ.'
          : 'Chưa đặt vị trí. Bấm lên bản đồ ở chỗ robot cần dừng.'}</p>
        {/* One set of fields, synced both ways with the map: clicking the map fills them, typing moves the marker.
            Folded away: most Staff place the POI on the map and never need the numbers. */}
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-[var(--poi-muted)]">Nhập tọa độ chính xác (không bắt buộc)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <PoseNumberField label="X (m)" value={draft.x} disabled={locked} change={x => update({ x: x == null ? null : quantizeMeters(x) })} />
          <PoseNumberField label="Y (m)" value={draft.y} disabled={locked} change={y => update({ y: y == null ? null : quantizeMeters(y) })} />
          <YawDegreesField yaw={draft.yaw} disabled={locked} change={yaw => update({ yaw })} />
        </div>
        </details>
      </section>
      </div>
      <div className="min-w-0 border-t border-[var(--poi-rule)] bg-[var(--poi-paper)] lg:border-t-0 lg:border-l">
        <div role="tablist" aria-label="Bảng chỉnh sửa POI" className="flex gap-5 border-b border-[var(--poi-rule)] px-4 lg:px-5">
          {INSPECTOR_TABS.map(([key, title]) => <button key={key} id={`poi-inspector-tab-${key}`} type="button" role="tab"
            aria-selected={inspector === key} aria-controls={`poi-inspector-${key}`} tabIndex={inspector === key ? 0 : -1}
            onClick={() => chooseInspector(key)} onKeyDown={event => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const next: Inspector = event.key === 'Home' ? 'info' : event.key === 'End' ? 'camera' : inspector === 'info' ? 'camera' : 'info'
              chooseInspector(next)
              document.getElementById(`poi-inspector-tab-${next}`)?.focus()
            }}
            className={`min-h-12 whitespace-nowrap border-b-2 px-0 py-3 text-[13px] font-semibold transition-colors active:text-[var(--poi-accent)] disabled:opacity-50 motion-reduce:transition-none ${focus} ${inspector === key ? 'border-[var(--poi-accent)] text-[var(--poi-accent-ink)]' : 'border-transparent text-[var(--poi-muted)] hover:text-[var(--poi-ink)]'}`}>{title}</button>)}
        </div>
        <div role="tabpanel" id="poi-inspector-info" aria-labelledby="poi-inspector-tab-info" hidden={inspector !== 'info'}>
      <aside className="space-y-5 p-4 lg:p-5" aria-label="Nội dung điểm">
        <div className="space-y-5">
        <div className="space-y-3.5">
          <h2 className="text-base font-semibold text-[var(--poi-ink)]">Thông tin điểm</h2>
          <div><span className={label}><label htmlFor="poi-name">Tên POI</label>{required}</span><input id="poi-name" readOnly={frozen} className={field} required maxLength={150} value={draft.name} onChange={e => update({ name: e.target.value })} placeholder="Sảnh thư viện" /></div>
          <div><span className={label}><label htmlFor="poi-purpose">Mục đích</label>{required}</span><input id="poi-purpose" readOnly={frozen} className={field} required maxLength={500} value={draft.purpose} onChange={e => update({ purpose: e.target.value })} placeholder="Giới thiệu khu tự học" /></div>
          <div><span className={label}><label htmlFor="poi-description">Ghi chú nội bộ</label><span className="font-normal text-[var(--poi-muted)]">(tùy chọn)</span></span><textarea id="poi-description" readOnly={frozen} className={field} rows={3} maxLength={1000} value={draft.description} onChange={e => update({ description: e.target.value })} placeholder="Lưu ý dành cho Staff…" />
            {/* The API field stays `description`; owners took it for the narration students hear. */}
            <p className="mt-1 text-xs text-[var(--poi-muted)]">Chỉ Staff xem. {poiId ? <>Nội dung cho học sinh ở <Link to={{ search: '?tab=thuyet-minh' }} className="font-semibold text-[var(--poi-accent)] underline">tab Thuyết minh</Link>.</> : 'Thêm thuyết minh sau khi tạo POI.'}</p></div>
        </div>
        <p className="flex items-start gap-2 text-xs text-[var(--poi-muted)]"><Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />Gửi kiểm chứng để kỹ thuật kiểm tra trên robot.</p>
        </div>
      </aside>
        </div>
        <div role="tabpanel" id="poi-inspector-camera" aria-labelledby="poi-inspector-tab-camera" hidden={inspector !== 'camera'}>
          <section className="min-w-0 space-y-3 p-4 lg:p-5" aria-label="Camera và tư liệu">
            <h2 className="text-base font-semibold text-[var(--poi-ink)]">Camera & tư liệu</h2>
            <fieldset disabled={frozen} className="min-w-0"><HeadCameraPresetField value={draft.cameraPreset} onChange={cameraPreset => update({ cameraPreset })} /></fieldset>
          </section>
        </div>
      </div>
    </div>
    {/* The actions close the workbench. They save the same position, camera and content, without covering the map on phones. */}
    {tab === 'vi-tri' && <div className="border-t border-[var(--poi-rule)] bg-[var(--poi-ground)]">
      {/* Below sm the message takes its own row and the buttons share the next ones, so no text wraps word by word. */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          {error ? <p role="alert" className="flex items-start gap-2 text-sm text-[var(--poi-danger)]"><CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />{error}</p>
            : waiting && !retired ? <p id="poi-outcome" className="flex items-start gap-2 text-sm font-semibold text-[var(--poi-ink)]"><Info size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--poi-muted)]" />Đang chờ kỹ thuật kiểm tra, chưa sửa được.</p>
            : locked && current ? <p className="text-sm text-[var(--poi-muted)]">Điểm này đang ở chế độ chỉ xem.</p>
            : missing.length ? <p className="flex items-start gap-2.5 text-sm"><CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--poi-warn)]" /><span><b className="block font-semibold text-[var(--poi-ink)]">Chưa đủ thông tin</b><span className="text-[var(--poi-muted)]">Còn thiếu: {missing.join(', ')}.</span></span></p>
            : outcome && <p id="poi-outcome" className="flex items-start gap-2 text-sm font-semibold text-[var(--poi-ink)]">{outcome.tone === 'ok' ? <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--poi-accent-ink)]" /> : outcome.tone === 'warn' ? <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--poi-warn)]" /> : <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--poi-muted)]" />}{outcome.text}</p>}
          <p className="mt-1 text-xs text-[var(--poi-muted)]">Lưu tạo bản mới. Gửi kiểm chưa phải Đạt.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap [&>*]:flex-1 [&>*]:whitespace-nowrap sm:[&>*]:flex-none">
        <Link to="/staff/manage/pois" className={buttonClass('secondary')}>Hủy bỏ</Link>
        {/* A PASS POI whose navigation is unchanged keeps its PASS, so sending it again would add nothing. */}
        {keepsPass
          ? <button type="submit" form="poi-form" disabled={busy || locked || saveBlocked} aria-describedby={saveBlocked ? 'poi-outcome' : undefined} className={buttonClass('primary')}>{busy ? 'Đang lưu…' : 'Lưu (giữ kết quả Đạt)'}</button>
          : <>
            <button type="submit" form="poi-form" disabled={busy || locked || saveBlocked} aria-describedby={saveBlocked ? 'poi-outcome' : undefined} className={buttonClass('secondary')}>{busy ? 'Đang lưu…' : 'Lưu, chưa gửi kiểm'}</button>
            <button type="button" disabled={busy || locked || submitBlocked} aria-describedby={submitBlocked ? 'poi-outcome' : undefined} onClick={() => void mutate('submit')} className={buttonClass('primary')}>{busy ? 'Đang xử lý…' : sentBefore ? 'Lưu và gửi kiểm lại' : 'Lưu và gửi kiểm chứng'}</button>
          </>}
        </div>
      </div>
    </div>}
    </form>
    </div>

    {current && <div role="tabpanel" id="poi-panel-thuyet-minh" aria-labelledby="poi-tab-thuyet-minh" hidden={tab !== 'thuyet-minh'}><PoiNarrationPanel proposal={current} /></div>}

    {current && <div role="tabpanel" id="poi-panel-lich-su" aria-labelledby="poi-tab-lich-su" hidden={tab !== 'lich-su'}>
      <PoiHistory proposalId={current.id} revisions={history.data?.revisions ?? []} records={history.data?.verificationRecords ?? []} loading={history.isPending} /></div>}


  </PoiPage>
}

/** Always above the tabs: the navigation check, the narration and whether a route can use the POI, by the server's rule. */
function PoiHeadline({ proposal }: { proposal: PoiProposal }) {
  const navigation = poiCheckBadge(proposal)
  const narration = narrationStatus(proposal.narration)
  const use = routeUseLine(proposal)
  return <section aria-label="Tình trạng POI" className={`${card} mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3`}>
    <span className="text-sm text-[var(--poi-muted)]">Kiểm chứng: <ToneBadge tone={navigation.tone}>{navigation.label}{proposal.revision.verificationSourceRevisionId && proposal.revision.verificationSourceRevisionId !== proposal.revision.id ? ' · giữ kết quả của bản lưu trước' : ''}</ToneBadge></span>
    <span className="text-sm text-[var(--poi-muted)]">Thuyết minh: <ToneBadge tone={proposal.retiredAt ? 'muted' : narration.tone}>{narration.label}</ToneBadge></span>
    {proposal.retiredAt && <ToneBadge tone="muted">Ngưng dùng</ToneBadge>}
    {proposal.discardedAt && <ToneBadge tone="muted">Đã xoá</ToneBadge>}
    <span className={`text-sm font-semibold sm:ml-auto ${use.usable ? 'text-[var(--poi-success)]' : 'text-[var(--poi-warn)]'}`}>Dùng được cho tuyến: {use.text}</span>
  </section>
}

function isMapEligibilityConflict(error: unknown) {
  if (!error || typeof error !== 'object' || !('body' in error) || typeof error.body !== 'string') return false
  try {
    const code = (JSON.parse(error.body) as { errors?: { code?: unknown } }).errors?.code
    return code === 'TECHNICAL_CHECK_PENDING' || code === 'TECHNICAL_CHECK_NOT_PASSED'
  } catch { return false }
}

/** A heading in degrees, in (−180, 180] to one decimal. */
const yawDegreesText = (yaw: number | null) => {
  if (yaw == null) return ''
  const degrees = Math.round((yaw * 180 / Math.PI) * 10) / 10
  return String(degrees <= -180 ? degrees + 360 : degrees)
}

/**
 * The heading keeps what is being typed: the marker follows each parsable value, but the text is put into
 * (−180, 180] and rounded only on blur, or when the map turns the heading.
 */
function YawDegreesField({ yaw, disabled, change }: { yaw: number | null; disabled: boolean; change: (yaw: number | null) => void }) {
  const [text, setText] = useState(() => yawDegreesText(yaw))
  // The yaw this field last sent; any other value came from the map (or a reload) and replaces the text.
  const sent = useRef(yaw)
  useEffect(() => {
    if (yaw !== sent.current) { sent.current = yaw; setText(yawDegreesText(yaw)) }
  }, [yaw])
  const typed = (raw: string) => {
    setText(raw)
    const degrees = raw.trim() === '' ? null : globalThis.Number(raw)
    if (degrees != null && !Number.isFinite(degrees)) return
    const next = degrees == null ? null : yawFromDegrees(degrees)
    sent.current = next
    change(next)
  }
  return <div className="text-sm">
    <label>Hướng (độ)<input type="number" disabled={disabled} className={`${poiInputClass} mt-1`} step="any" value={text}
      onChange={event => typed(event.target.value)} onBlur={() => setText(yawDegreesText(yaw))} /></label>
    {yaw != null && <p className="mt-1 font-mono text-xs text-[var(--poi-muted)]">{`= ${yaw.toFixed(6)} rad`}</p>}
  </div>
}

function PoseNumberField({ label, value, disabled, change, hint }: { label: string; value: number | null; disabled: boolean; change: (value: number | null) => void; hint?: string }) {
  return <div className="text-sm">
    <label>{label}<input type="number" disabled={disabled} className={`${poiInputClass} mt-1`} step="any" value={value ?? ''} onChange={event => change(event.target.value === '' ? null : globalThis.Number(event.target.value))} /></label>
    {hint && <p className="mt-1 font-mono text-xs text-[var(--poi-muted)]">{hint}</p>}
  </div>
}

const observationKeys = ['reached', 'stopped', 'localizationPassed', 'cameraPresetConfirmed'] as const

/** Under the status strip on every tab while the result in effect is Không đạt: why, what failed, who and when. */
function PoiFailBanner({ cameraPreset, record, onFix }: { cameraPreset: string; record: PoiVerification | null; onFix: () => void }) {
  // The camera step names the action of the revision that was checked, as in the history tab.
  const labels = poiObservationLabels(cameraPreset)
  const failedSteps = record ? observationKeys.flatMap((key, index) => record[key] === false ? [labels[index]] : []) : []
  return <section aria-label="Kết quả kiểm chứng không đạt" className="mb-4 rounded-[15px] border border-[var(--poi-danger-rule)] bg-[var(--poi-danger-soft)] px-5 py-3.5 text-sm text-[var(--poi-danger)]">
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-2 font-semibold"><CircleAlert size={16} aria-hidden="true" className="shrink-0" />Kỹ thuật ghi không đạt</p>
        <p>Lý do: {record?.reason?.trim() || 'Không ghi lý do.'}</p>
        {failedSteps.length > 0 && <div>
          <p>Không đạt ở:</p>
          <ul aria-label="Bước không đạt" className="ml-5 list-disc">{failedSteps.map(step => <li key={step}>{step}</li>)}</ul>
        </div>}
        {record && <p className="text-xs text-[var(--poi-danger)]">Robot {record.robotCode} · ghi lúc {campusShortStamp(record.checkedAt)}</p>}
      </div>
      <button type="button" onClick={onFix} className={buttonClass('secondary', 'sm')}>Sửa vị trí</button>
    </div>
  </section>
}
