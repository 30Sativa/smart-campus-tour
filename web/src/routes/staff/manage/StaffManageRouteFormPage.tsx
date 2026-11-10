import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { ApiError } from '../../../api/client'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { SaveBlockedHint } from '../../../features/technical/TechnicalUi'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { celebrate, notify } from '../../../components/ui/toast-store'
import { technicalApi, type MapVersionItem, type PoiProposal } from '../../../features/technical/api/technical'
import { staffMapLabels } from '../../../features/administration/map-labels'
import { errorText } from '../../../features/technical/technical-format'
import { usePoiProposals } from '../../../features/technical/technical-hooks'
import { versionedRoutesApi, type VersionedRouteDraft } from '../../../features/administration/routes/versioned-api'
import { RouteScheduledToursList } from '../../../features/administration/routes/RouteScheduledTours'
import { useRouteScheduledTours } from '../../../features/administration/routes/hooks'
import { PoiPosePicker, type PickerMode, type PickerPose } from '../../../features/administration/pois/map/PoiPosePicker'
import { RouteMap } from '../../../features/administration/routes/RouteMap'
import { UnsavedChangesGuard } from '../../../features/administration/UnsavedChangesGuard'
import { AFTER_SAVE } from '../../../features/administration/after-save'
import { clearanceMessage, poseClearance, yawDegrees } from '../../../features/administration/pois/map/occupancy-grid'
import { useMapRaster } from '../../../features/administration/pois/map/use-map-raster'

type StopDraft = { poiRevisionId: string; dwellSeconds: number; headSteps: Array<{ preset: 'FRONT' | 'LEFT' | 'RIGHT'; holdSeconds: number }> }
type Draft = { name: string; description: string; mapVersionId: string; startX: number | null; startY: number | null; startYaw: number | null; endMode: 'LAST_POI' | 'POSE'; endX: number | null; endY: number | null; endYaw: number | null }
const moveButton = 'grid size-8 shrink-0 place-items-center rounded-lg text-[#2d78a9] hover:bg-[#e9f5ff] disabled:text-[#c3d0db] disabled:hover:bg-transparent'
// A new route has no start until Staff places one; 0, 0, 0 used to be saved silently.
const empty: Draft = { name: '', description: '', mapVersionId: '', startX: null, startY: null, startYaw: null, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null }
const STEPS = ['Bản đồ và tên', 'Điểm dừng', 'Điểm bắt đầu và kết thúc', 'Xem lại và lưu'] as const
const placed = (pose: PickerPose) => pose.x != null && pose.y != null && pose.yaw != null
const samePose = (a: PickerPose, b: PickerPose) => a.x === b.x && a.y === b.y && a.yaw === b.yaw
// START is still saved as endMode POSE; it only keeps the end pose following the start.
type EndChoice = 'LAST_POI' | 'START' | 'POSE'
const poseText = (pose: PickerPose) => placed(pose) ? `x ${pose.x!.toFixed(2)} m · y ${pose.y!.toFixed(2)} m · hướng ${yawDegrees(pose.yaw!)}°` : 'Chưa chọn'
// docs/lich-tour-theo-ca.md §2. The server checks the same bounds; these only say so before Save.
const MIN_DWELL_SECONDS = 15
const MAX_DWELL_SECONDS = 300
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
const metres = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
const durationText = (seconds: number) => seconds < 60 ? `${seconds} giây`
  : `${Math.floor(seconds / 60)} phút${seconds % 60 ? ` ${seconds % 60} giây` : ''}`
type NearStop = { name: string; meters: number }

/**
 * Route authoring as four steps, because each one depends on the one before: stops need the map,
 * and start/end poses are placed on that map. Saving still sends one revision, as before.
 */
export default function StaffManageRouteFormPage() {
  const { routeId } = useParams()
  const navigate = useNavigate()
  const source = useQuery({ queryKey: ['versioned-routes', routeId], queryFn: () => versionedRoutesApi.get(routeId!), enabled: Boolean(routeId) })
  // Saving makes a new revision; these Tours keep the one they were created on (ADR-0034).
  const scheduledTours = useRouteScheduledTours(routeId)
  const proposals = usePoiProposals()
  const maps = useQuery({ queryKey: ['technical', 'maps'], queryFn: technicalApi.listMaps })
  const [draftOverride, setDraftOverride] = useState<Draft | null>(null)
  const [stopsOverride, setStopsOverride] = useState<StopDraft[] | null>(null)
  const [step, setStep] = useState(0)
  // An existing route already has every step filled in, so all of them can be opened directly.
  const [furthest, setFurthest] = useState(routeId ? STEPS.length - 1 : 0)
  const [endChoiceOverride, setEndChoice] = useState<EndChoice | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initialDraft: Draft = source.data ? {
    name: source.data.name, description: source.data.description ?? '', mapVersionId: source.data.mapVersionId,
    startX: source.data.startX, startY: source.data.startY, startYaw: source.data.startYaw,
    endMode: source.data.endMode, endX: source.data.endX, endY: source.data.endY, endYaw: source.data.endYaw,
  } : empty
  const draft: Draft = draftOverride ?? (source.data ? {
    name: source.data.name, description: source.data.description ?? '', mapVersionId: source.data.mapVersionId,
    startX: source.data.startX, startY: source.data.startY, startYaw: source.data.startYaw,
    endMode: source.data.endMode, endX: source.data.endX, endY: source.data.endY, endYaw: source.data.endYaw,
  } : empty)
  const stops = stopsOverride ?? source.data?.stops.map(stop => ({
    poiRevisionId: stop.poiRevisionId, dwellSeconds: stop.dwellSeconds, headSteps: stop.headSteps,
  })) ?? []
  const initialStops = source.data?.stops.map(stop => ({ poiRevisionId: stop.poiRevisionId, dwellSeconds: stop.dwellSeconds, headSteps: stop.headSteps })) ?? []
  const changed = JSON.stringify([draft, stops]) !== JSON.stringify([initialDraft, initialStops])
  const updateDraft = (update: Partial<Draft>) => setDraftOverride(current => ({ ...draft, ...current, ...update }))
  const verifiedPois = (proposals.data ?? []).filter((proposal: PoiProposal) => proposal.revision.navigationStatus === 'PASS')
  const available = verifiedPois.filter(proposal => proposal.revision.mapVersionId === draft.mapVersionId)
  // Stops come first, in route order, so the order being saved is the order on screen.
  const orderedPois = [
    ...stops.flatMap(stop => available.filter(proposal => proposal.revision.id === stop.poiRevisionId)),
    ...available.filter(proposal => !stops.some(stop => stop.poiRevisionId === proposal.revision.id)),
  ]
  // Mirrors the server: a route needs PASS POIs on the exact map (ADR-0023) and current map evidence (ADR-0033).
  const poiMapIds = new Set(verifiedPois.map(proposal => proposal.revision.mapVersionId))
  const mapBlock = ({ map, canUseForPoiPreparation }: MapVersionItem) => !canUseForPoiPreparation ? 'chưa đạt kiểm tra kỹ thuật' : poiMapIds.has(map.id) ? null : 'chưa có POI đạt'
  const mapOptions = [...(maps.data ?? [])].sort((a, b) => Number(mapBlock(a) !== null) - Number(mapBlock(b) !== null))
  const mapLabel = staffMapLabels(maps.data ?? [], item => mapBlock(item) === null)
  const chosenMap = maps.data?.find(item => item.map.id === draft.mapVersionId)
  const mapNotReady = Boolean(chosenMap && !chosenMap.canUseForPoiPreparation)
  const raster = useMapRaster(draft.mapVersionId)
  const clearance = chosenMap?.poiClearanceMeters
  const startPose = { x: draft.startX, y: draft.startY, yaw: draft.startYaw }
  const endPose = { x: draft.endX, y: draft.endY, yaw: draft.endYaw }
  const endChoice: EndChoice = endChoiceOverride
    ?? (draft.endMode === 'LAST_POI' ? 'LAST_POI' : placed(startPose) && samePose(endPose, startPose) ? 'START' : 'POSE')
  // ADR-0040: the server refuses a newly written start or end pose without free floor around it; say so before Next.
  // Like the server (SaveRouteRevision), a pose kept unchanged on the same map is exempt: it may predate the rule.
  const saved = source.data && source.data.mapVersionId === draft.mapVersionId ? source.data : null
  const kept = (pose: PickerPose, savedX?: number | null, savedY?: number | null) => saved != null && pose.x === savedX && pose.y === savedY
  const tooClose = (pose: PickerPose) => Boolean(raster.map && clearance != null && pose.x != null && pose.y != null
    && poseClearance(raster.map, raster.map.pixels ?? null, { x: pose.x, y: pose.y }, clearance) === 'blocked')
  const startTooClose = tooClose(startPose) && !kept(startPose, saved?.startX, saved?.startY)
  const endTooClose = tooClose(endPose) && !kept(endPose, saved?.endX, saved?.endY)
  const poiName = (id: string) => available.find(proposal => proposal.revision.id === id)?.revision.name ?? id
  // Both rules come with the map version from the server; without them the server alone decides.
  const minStops = chosenMap?.routeMinStops
  const minSeparation = chosenMap?.routeMinStopSeparationMeters
  const stopPois = stops.flatMap(stop => available.filter(proposal => proposal.revision.id === stop.poiRevisionId).map(proposal => proposal.revision))
  const stopIds = new Set(stops.map(stop => stop.poiRevisionId))
  const nearStop = (pose: PickerPose, candidates: typeof stopPois): NearStop | null => {
    if (minSeparation == null || pose.x == null || pose.y == null) return null
    const point = { x: pose.x, y: pose.y }
    const near = candidates.find(poi => distance(point, poi) < minSeparation)
    return near ? { name: near.name, meters: distance(point, near) } : null
  }
  const startNearStop = nearStop(startPose, stopPois)
  // A separate end is measured from the last stop only; "Quay về điểm bắt đầu" is always allowed.
  const endNearStop = endChoice === 'POSE' && !samePose(endPose, startPose) ? nearStop(endPose, stopPois.slice(-1)) : null
  const closeStops = minSeparation == null ? null : stopPois.slice(1).map((poi, index) => [stopPois[index], poi] as const)
    .find(([previous, poi]) => distance(previous, poi) < minSeparation) ?? null
  const totalDwell = stops.reduce((sum, stop) => sum + (Number.isFinite(stop.dwellSeconds) ? stop.dwellSeconds : 0), 0)

  const missingByStep: string[][] = [
    [!draft.name.trim() && 'nhập tên tuyến', !draft.mapVersionId && 'chọn bản đồ', mapNotReady && 'chọn bản đồ còn đạt kiểm tra kỹ thuật'],
    [stops.length < (minStops ?? 1) && `chọn ít nhất ${minStops ?? 1} điểm dừng`,
      stops.some(stop => !Number.isInteger(stop.dwellSeconds) || stop.dwellSeconds < MIN_DWELL_SECONDS || stop.dwellSeconds > MAX_DWELL_SECONDS) && `thời gian dừng từ ${MIN_DWELL_SECONDS} đến ${MAX_DWELL_SECONDS} giây`,
      closeStops && `${closeStops[0].name} và ${closeStops[1].name} quá gần nhau`],
    [!placed(startPose) && 'chọn điểm bắt đầu và hướng', startTooClose && 'điểm bắt đầu quá sát vật cản',
      startNearStop && `điểm bắt đầu quá gần điểm dừng ${startNearStop.name}`,
      endChoice === 'POSE' && !placed(endPose) && 'chọn điểm kết thúc và hướng', endChoice === 'POSE' && endTooClose && 'điểm kết thúc quá sát vật cản',
      endNearStop && `điểm kết thúc quá gần điểm dừng cuối ${endNearStop.name}`],
    [],
  ].map(list => list.filter((item): item is string => Boolean(item)))
  const firstOpen = missingByStep.findIndex(list => list.length > 0)
  // Red only for a real problem (too close, against an obstacle, a map that lost its check); what is simply still to do reads grey.
  const problemByStep = [mapNotReady, Boolean(closeStops), Boolean(startTooClose || startNearStop || (endChoice === 'POSE' && endTooClose) || endNearStop), false]
  const goTo = (index: number) => { setStep(index); setFurthest(current => Math.max(current, index)); setError(null) }

  const moveStop = (index: number, offset: number) => setStopsOverride(current => {
    const next = [...(current ?? stops)]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    return next
  })
  const toggle = (proposal: PoiProposal) => setStopsOverride(current => (current ?? stops).some(stop => stop.poiRevisionId === proposal.revision.id)
    ? (current ?? stops).filter(stop => stop.poiRevisionId !== proposal.revision.id)
    : [...(current ?? stops), { poiRevisionId: proposal.revision.id, dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 10 }] }])
  const chooseMap = (mapVersionId: string) => {
    // Stops and poses belong to one map version, so another version starts them again.
    updateDraft({ mapVersionId, startX: null, startY: null, startYaw: null, endX: null, endY: null, endYaw: null })
    setStopsOverride([])
    setFurthest(0)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (step !== STEPS.length - 1) return
    if (firstOpen !== -1) { setStep(firstOpen); return }
    const body: VersionedRouteDraft = {
      ...draft, startX: draft.startX!, startY: draft.startY!, startYaw: draft.startYaw!,
      name: draft.name.trim(), description: draft.description.trim() || null, requestId: crypto.randomUUID(),
      expectedCurrentRevision: source.data?.revisionNumber ?? 0, mapVersionId: draft.mapVersionId, stops,
    }
    setBusy(true); setError(null)
    try {
      const route = routeId ? await versionedRoutesApi.revise(routeId, body) : await versionedRoutesApi.create(body)
      if (routeId) notify({ title: `Đã lưu thay đổi cho “${body.name}”; bản mới cần gửi kiểm chứng lại.` })
      else celebrate({ title: `Đã tạo tuyến “${body.name}”`, detail: `${stops.length} POI trên map đã chọn. Tuyến đang là bản nháp: gửi kiểm chứng để kỹ thuật chạy thử trước khi dùng cho Tour.` })
      navigate(`/staff/manage/routes/${route.routeId}`, { replace: true, ...AFTER_SAVE })
    } catch (cause) { setError(routeSaveError(cause)) }
    finally { setBusy(false) }
  }
  if ((routeId && source.isPending) || proposals.isPending || maps.isPending) return <AdminPage><p className="p-8">Đang tải dữ liệu…</p></AdminPage>
  if (source.error || proposals.error || maps.error) return <AdminPage><p role="alert" className="p-4 text-sm text-red-700">Không tải được tuyến, POI đã kiểm chứng hoặc map.</p></AdminPage>

  const last = step === STEPS.length - 1
  const missingHere = missingByStep[step]
  return <AdminPage>
    <UnsavedChangesGuard when={changed && !busy} />
    <Link to="/staff/manage/routes" className="mb-3 inline-flex text-sm text-[#2d719e]">← Danh sách tuyến</Link>
    <PageHeader eyebrow="Tuyến" title={routeId ? 'Sửa tuyến' : 'Tạo tuyến'} description="Tuyến gắn với đúng một bản đồ và chỉ gồm các POI đã đạt kiểm chứng trên bản đồ đó." />
    <div className="mb-4"><Notice>Lưu xong, gửi kiểm chứng để Kỹ thuật chạy thử toàn tuyến. Chỉ tuyến chạy thử đạt mới dùng được để tạo Tour.</Notice></div>
    {scheduledTours.data && scheduledTours.data.length > 0 && <div className="mb-4"><Notice tone="warn">
      <p>{scheduledTours.data.length} Tour đã lên lịch trên tuyến này vẫn chạy bản đã chọn lúc tạo, không tự đổi theo bản bạn sắp lưu. Muốn Tour đi theo bản mới, chờ bản mới chạy thử đạt rồi hủy Tour và tạo lại.</p>
      <RouteScheduledToursList tours={scheduledTours.data} />
    </Notice></div>}

    <nav aria-label="Các bước tạo tuyến" className="mb-4">
      <ol className="grid gap-2 sm:grid-cols-4">{STEPS.map((label, index) => {
        const done = index < step || (index <= furthest && index !== step && missingByStep[index].length === 0)
        const current = index === step
        return <li key={label}>
          <button type="button" aria-current={current ? 'step' : undefined} disabled={index > furthest} onClick={() => goTo(index)}
            className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] disabled:cursor-not-allowed ${current ? 'border-[#2563eb] bg-[#eff6ff] text-[#0f172a]' : 'border-[#e2e8f0] bg-white text-[#475569] enabled:hover:border-[#cbd5e1] disabled:text-[#94a3b8]'}`}>
            <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${current ? 'bg-[#2563eb] text-white' : done ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#f1f5f9] text-[#64748b]'}`}>{done && !current ? <Check size={13} /> : index + 1}</span>
            <span className="min-w-0"><span className="block text-[11px] font-semibold text-[#64748b]">Bước {index + 1}</span>{label}</span>
          </button>
        </li>
      })}</ol>
    </nav>

    <form onSubmit={event => void save(event)} className="space-y-4">
      {step === 0 && <section aria-label={STEPS[0]} className={`${panelClass} grid gap-3 p-4 sm:grid-cols-2`}>
        <label className="text-sm">Tên tuyến<input className={`${inputClass} mt-1`} required maxLength={150} value={draft.name} onChange={e => updateDraft({ name: e.target.value })} /></label>
        <div className="text-sm"><label htmlFor="route-map">Bản đồ</label><select title="" id="route-map" className={`${inputClass} mt-1`} required value={draft.mapVersionId} onChange={e => chooseMap(e.target.value)}><option value="">— Chọn bản đồ —</option>{mapOptions.map(item => <option key={item.map.id} value={item.map.id} disabled={mapBlock(item) !== null}>{mapLabel(item.map, mapBlock(item))}</option>)}</select>{mapNotReady ? <p role="alert" className="mt-1 text-xs text-[#b23e31]">Bản đồ này không còn kiểm tra kỹ thuật đạt nên không lưu được tuyến. Nhờ Kỹ thuật kiểm tra lại hoặc chọn bản đồ khác.</p> : <p className="mt-1 text-xs text-[#64748b]">Chỉ chọn được bản đồ đạt kiểm tra kỹ thuật và đã có POI đạt kiểm chứng. Đổi bản đồ sẽ chọn lại điểm dừng và điểm bắt đầu.</p>}</div>
        <label className="text-sm sm:col-span-2">Mô tả<textarea className={`${inputClass} mt-1`} rows={2} maxLength={1000} value={draft.description} onChange={e => updateDraft({ description: e.target.value })} /></label>
      </section>}

      {step === 1 && <section aria-label={STEPS[1]} className={`${panelClass} p-4`}><h2 className="font-semibold">Điểm dừng</h2><p className="mt-1 text-xs text-[#64748b]">Tick POI hoặc bấm điểm trên bản đồ để chọn. Robot đi theo thứ tự đánh số, dùng mũi tên để đổi thứ tự.{minStops != null && ` Cần ít nhất ${minStops} điểm dừng.`} Mỗi điểm dừng từ {MIN_DWELL_SECONDS} đến {MAX_DWELL_SECONDS} giây.</p>
        {closeStops && <p role="alert" className="mt-2 text-xs text-[#b23e18]">{closeStops[0].name} và {closeStops[1].name} cách nhau {metres(distance(closeStops[0], closeStops[1]))} m, cần ít nhất {metres(minSeparation!)} m. Đổi thứ tự hoặc bỏ bớt một điểm.</p>}
        {available.length ? <div className="mt-3 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><ol className="space-y-2">{orderedPois.map(poi => {
          const index = stops.findIndex(stop => stop.poiRevisionId === poi.revision.id)
          const selected = index >= 0
          return <li key={poi.revision.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3 text-sm ${selected ? 'border-[#bcd7ea] bg-[#f5fafd]' : 'border-[#e2e8f0]'}`}>
            <label className="flex min-w-0 flex-1 basis-56 cursor-pointer items-center gap-3">
              <input type="checkbox" className="size-4 shrink-0 accent-[#2d719e]" checked={selected} onChange={() => toggle(poi)} />
              {selected && <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#173b5f] text-xs font-semibold text-white">{index + 1}</span>}
              <span className="min-w-0 break-words"><span className="font-semibold text-[#0f172a]">{poi.revision.name}</span></span>
            </label>
            {selected && <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-[#64748b]">Dừng<span className="w-20 shrink-0"><input aria-label={`Thời gian dừng ${poi.revision.name} (giây)`} className={inputClass} type="number" min={MIN_DWELL_SECONDS} max={MAX_DWELL_SECONDS} value={stops[index].dwellSeconds} onChange={e => setStopsOverride(current => (current ?? stops).map(stop => stop.poiRevisionId === poi.revision.id ? { ...stop, dwellSeconds: Number(e.target.value) } : stop))} /></span>giây</label>
              <button type="button" className={moveButton} aria-label={`Đưa ${poi.revision.name} lên`} disabled={index === 0} onClick={() => moveStop(index, -1)}><ChevronUp size={16} aria-hidden="true" /></button>
              <button type="button" className={moveButton} aria-label={`Đưa ${poi.revision.name} xuống`} disabled={index === stops.length - 1} onClick={() => moveStop(index, 1)}><ChevronDown size={16} aria-hidden="true" /></button>
            </div>}
          </li>
        })}</ol>
          <div className="lg:sticky lg:top-4"><RouteMap mapVersionId={draft.mapVersionId} start={placed(startPose) ? { x: startPose.x!, y: startPose.y! } : null}
            stops={stopPois.map(poi => ({ id: poi.id, name: poi.name, x: poi.x, y: poi.y }))}
            candidates={available.filter(proposal => !stopIds.has(proposal.revision.id)).map(({ revision }) => ({ id: revision.id, name: revision.name, x: revision.x, y: revision.y }))}
            onToggle={id => { const proposal = available.find(item => item.revision.id === id); if (proposal) toggle(proposal) }} /></div>
        </div> : <p className="py-4 text-sm text-[#64748b]">Chưa có POI đạt kiểm chứng trên bản đồ này.</p>}
      </section>}

      {step === 2 && <div className="space-y-4">
        <PoseStep title="Điểm bắt đầu" help="Nơi robot đứng chờ trước khi Tour bắt đầu, ví dụ chỗ đỗ. Không bắt buộc trùng một POI."
          pose={startPose} onChange={pose => updateDraft({ startX: pose.x, startY: pose.y, startYaw: pose.yaw, ...(endChoice === 'START' && { endX: pose.x, endY: pose.y, endYaw: pose.yaw }) })}
          raster={raster} clearance={clearance} tooClose={startTooClose} pois={available} stopIds={stopIds}
          nearStop={startNearStop} nearStopLabel="Điểm bắt đầu" minSeparation={minSeparation} placing="điểm bắt đầu" stops={stopPois} />
        <section aria-label="Điểm kết thúc" className={`${panelClass} space-y-3 p-4`}>
          <div><h2 className="font-semibold">Điểm kết thúc</h2><p className="mt-1 text-xs text-[#64748b]">Robot dừng ở đâu khi hết tuyến.</p></div>
          <div role="radiogroup" aria-label="Điểm kết thúc" className="grid gap-2 sm:grid-cols-3">
            {([
              ['LAST_POI', 'Dừng tại điểm dừng cuối', stops.length ? poiName(stops[stops.length - 1].poiRevisionId) : '-'],
              ['START', 'Quay về điểm bắt đầu', placed(startPose) ? 'Robot về lại đúng vị trí và hướng lúc xuất phát' : 'Chọn điểm bắt đầu trước'],
              ['POSE', 'Về một vị trí riêng', 'Chọn trên bản đồ hoặc lấy từ một POI'],
            ] as const).map(([value, label, detail]) => (
              <label key={value} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm ${endChoice === value ? 'border-[#2563eb] bg-[#eff6ff]' : 'border-[#e2e8f0]'}`}>
                <input type="radio" name="route-end-mode" className="mt-0.5 accent-[#2563eb]" checked={endChoice === value} onChange={() => {
                  setEndChoice(value)
                  updateDraft(value === 'LAST_POI' ? { endMode: 'LAST_POI', endX: null, endY: null, endYaw: null }
                    : value === 'START' ? { endMode: 'POSE', endX: draft.startX, endY: draft.startY, endYaw: draft.startYaw }
                      : { endMode: 'POSE', endX: null, endY: null, endYaw: null })
                }} />
                <span><span className="block font-medium text-[#0f172a]">{label}</span><span className="text-xs text-[#64748b]">{detail}</span></span>
              </label>
            ))}
          </div>
        </section>
        {endChoice === 'POSE' && <PoseStep title="Vị trí kết thúc" help="Robot đi tới đây sau điểm dừng cuối."
          pose={endPose} onChange={pose => updateDraft({ endX: pose.x, endY: pose.y, endYaw: pose.yaw })}
          raster={raster} clearance={clearance} tooClose={endTooClose} pois={available} stopIds={stopIds}
          nearStop={endNearStop} nearStopLabel="Điểm kết thúc" minSeparation={minSeparation} placing="điểm kết thúc" stops={stopPois} />}
      </div>}

      {step === 3 && <section aria-label={STEPS[3]} className={`${panelClass} p-4`}>
        <h2 className="font-semibold">Xem lại trước khi lưu</h2>
        <dl className="mt-3 divide-y divide-[#f1f5f9] text-sm">
          <ReviewRow label="Tên tuyến" onEdit={() => goTo(0)}>{draft.name.trim()}{draft.description.trim() && <span className="block text-xs text-[#64748b]">{draft.description.trim()}</span>}</ReviewRow>
          <ReviewRow label="Bản đồ" onEdit={() => goTo(0)}>{chosenMap ? mapLabel(chosenMap.map) : '-'}</ReviewRow>
          <ReviewRow label={`Điểm dừng (${stops.length})`} onEdit={() => goTo(1)}><ol className="list-inside list-decimal">{stops.map(stop => <li key={stop.poiRevisionId}>{poiName(stop.poiRevisionId)} · dừng {stop.dwellSeconds} giây</li>)}</ol></ReviewRow>
          <ReviewRow label="Điểm bắt đầu" onEdit={() => goTo(2)}><span className="font-mono text-xs">{poseText(startPose)}</span></ReviewRow>
          <ReviewRow label="Điểm kết thúc" onEdit={() => goTo(2)}>{endChoice === 'LAST_POI' ? 'Dừng tại điểm dừng cuối' : endChoice === 'START' ? 'Quay về điểm bắt đầu' : <span className="font-mono text-xs">{poseText(endPose)}</span>}</ReviewRow>
          <ReviewRow label="Lộ trình" onEdit={() => goTo(1)}>
            <p aria-label="Lộ trình robot đi">{['Bắt đầu', ...stops.map((stop, index) => `${index + 1}. ${poiName(stop.poiRevisionId)}`),
              endChoice === 'LAST_POI' ? 'Kết thúc tại điểm dừng cuối' : endChoice === 'START' ? 'Kết thúc tại điểm bắt đầu' : 'Kết thúc'].join(' → ')}</p>
            <p className="mt-1">Tổng thời gian dừng: <span className="font-semibold">{durationText(totalDwell)}</span></p>
            <p className="mt-1 text-xs text-[#64748b]">Thời lượng thật chốt sau khi Kỹ thuật chạy thử.</p>
          </ReviewRow>
        </dl>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </section>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <SaveBlockedHint id="route-step-missing" tone={!last && problemByStep[step] ? 'danger' : 'neutral'} lead={!last && problemByStep[step] ? 'Chưa sang bước tiếp được' : 'Cần'}
          missing={last ? (firstOpen === -1 ? [] : [`hoàn tất bước ${firstOpen + 1}`]) : missingHere} />
        {step > 0 && <button type="button" className={buttonClass('secondary')} onClick={() => goTo(step - 1)}><ChevronLeft size={15} aria-hidden="true" />Quay lại</button>}
        {/* Distinct keys: if React reused the Next button as the submit button, the click that opens
            the review step would finish as a submit and save before anyone reviewed it. */}
        {last
          ? <button key="save" disabled={busy || firstOpen !== -1} aria-describedby={firstOpen === -1 ? undefined : 'route-step-missing'} type="submit" className={buttonClass('primary')}>{busy ? 'Đang lưu…' : 'Lưu bản nháp'}</button>
          : <button key="next" type="button" disabled={missingHere.length > 0} aria-describedby={missingHere.length ? 'route-step-missing' : undefined} className={buttonClass('primary')} onClick={() => goTo(step + 1)}>Tiếp<ChevronRight size={15} aria-hidden="true" /></button>}
      </div>
    </form>
  </AdminPage>
}

function ReviewRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
  return <div className="flex gap-3 py-2.5">
    <dt className="w-32 shrink-0 text-[#64748b]">{label}</dt>
    <dd className="min-w-0 flex-1 text-[#0f172a]">{children}</dd>
    <dd><button type="button" className={buttonClass('ghost', 'sm')} onClick={onEdit} aria-label={`Sửa ${label}`}>Sửa</button></dd>
  </div>
}

/** Says why a route save was refused; a stop-distance refusal names the stop (docs/lich-tour-theo-ca.md §6). */
function routeSaveError(cause: unknown) {
  const message = errorText(cause)
  if (cause instanceof ApiError && cause.status === 409 && cause.body.includes('ROUTE_STOP_TOO_CLOSE'))
    return message.includes('cần ít nhất') ? message : 'Điểm bắt đầu, điểm kết thúc hoặc hai điểm dừng liền nhau đặt quá gần nhau. Sửa ở bước 2 hoặc 3 rồi lưu lại.'
  return message
}

/** One pose on the route's map: pick it on the map, or copy a POI's pose as a shortcut. */
function PoseStep({ title, help, pose, onChange, raster, clearance, tooClose, pois, stopIds, nearStop, nearStopLabel, minSeparation, placing, stops }: {
  title: string; help: string; pose: PickerPose; onChange: (pose: PickerPose) => void
  raster: ReturnType<typeof useMapRaster>; clearance: number | undefined; tooClose: boolean; pois: PoiProposal[]
  stopIds: Set<string>; nearStop: NearStop | null; nearStopLabel: string; minSeparation: number | undefined
  placing: string; stops: Array<{ x: number; y: number; name: string }>
}) {
  const [mode, setMode] = useState<PickerMode>('position')
  const copy = (value: string) => {
    const poi = pois.find(proposal => proposal.revision.id === value)
    if (poi) onChange({ x: poi.revision.x, y: poi.revision.y, yaw: poi.revision.yaw })
  }
  // The select shows which POI the pose came from; once moved on the map it no longer matches one.
  const source = pois.find(poi => samePose(pose, poi.revision))?.revision.id ?? ''
  return <section aria-label={title} className={`${panelClass} space-y-3 p-4`}>
    <div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-xs text-[#64748b]">{help}</p></div>
    <label className="block text-sm">Lấy vị trí có sẵn<select title="" className={`${inputClass} mt-1`} value={source} onChange={e => copy(e.target.value)}>
      <option value="">{placed(pose) ? 'Vị trí tự chọn trên bản đồ' : '— Chọn để chép vị trí và hướng —'}</option>
      {/* A stop's own pose would leave the robot nowhere to go, so stops are shown but cannot be picked. */}
      {pois.map(poi => stopIds.has(poi.revision.id)
        ? <option key={poi.revision.id} value={poi.revision.id} disabled className="text-[#94a3b8]">POI {poi.revision.name} (đang là điểm dừng)</option>
        : <option key={poi.revision.id} value={poi.revision.id}>POI {poi.revision.name}</option>)}
    </select></label>
    {raster.error
      ? <Notice tone="danger" action={<button type="button" onClick={raster.retry} className={buttonClass('secondary', 'sm')}>Thử lại</button>}>{raster.error}</Notice>
      : raster.map
        ? <PoiPosePicker map={raster.map} pose={pose} editable mode={mode} onModeChange={setMode} onPoseChange={onChange} clearanceMeters={clearance}
          placing={placing} landmarks={stops.map((stop, index) => ({ x: stop.x, y: stop.y, name: stop.name, label: String(index + 1) }))} landmarkRadiusMeters={minSeparation} />
        : <p role="status" className="grid min-h-48 place-items-center rounded-xl bg-[#f8fafc] text-sm text-[#64748b]">Đang tải bản đồ…</p>}
    {!placed(pose) && <p className="text-sm text-[#64748b]">Chưa chọn</p>}
    {tooClose && clearance != null && <p role="alert" className="text-xs text-[#b23e18]">{clearanceMessage(clearance)}</p>}
    {nearStop && minSeparation != null && <p role="alert" className="text-xs text-[#b23e18]">{nearStopLabel} cách điểm dừng {nearStop.name} {metres(nearStop.meters)} m, cần ít nhất {metres(minSeparation)} m. Chọn vị trí xa hơn.</p>}
  </section>
}
