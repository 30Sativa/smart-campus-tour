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
import { apiErrorCode, errorText } from '../../../features/technical/technical-format'
import { narrationStatus, usableForRoute } from '../../../features/technical/poi-labels'
import { ToneBadge } from '../../../features/technical/TechnicalUi'
import { usePoiProposals } from '../../../features/technical/technical-hooks'
import { versionedRoutesApi, type VersionedRouteDraft } from '../../../features/administration/routes/versioned-api'
import { RouteScheduledToursList } from '../../../features/administration/routes/RouteScheduledTours'
import { RouteFailBanner } from '../../../features/administration/routes/RouteFailBanner'
import { routeChanges, saveResultText } from '../../../features/administration/routes/route-messages'
import { useRouteScheduledTours } from '../../../features/administration/routes/hooks'
import { PoiPosePicker, type PickerMode, type PickerPose } from '../../../features/administration/pois/map/PoiPosePicker'
import { RouteMap } from '../../../features/administration/routes/RouteMap'
import { ShiftLengthWarning } from '../../../features/administration/routes/ShiftLengthWarning'
import { campusDateKey, formatExpectedDuration, formatMinutesSeconds } from '../../../components/ui/date-time'
import { estimatedRouteSeconds } from '../../../features/administration/routes/route-estimate'
import { useTourShifts } from '../../../features/administration/tours/hooks'
import { UnsavedChangesGuard } from '../../../features/administration/UnsavedChangesGuard'
import { AFTER_SAVE } from '../../../features/administration/after-save'
import { clearanceMessage, poseClearance, yawDegrees } from '../../../features/administration/pois/map/occupancy-grid'
import { useMapRaster } from '../../../features/administration/pois/map/use-map-raster'

type StopDraft = { poiRevisionId: string; dwellSeconds: number; headSteps: Array<{ preset: 'FRONT' | 'LEFT' | 'RIGHT'; holdSeconds: number }> }
type Draft = { name: string; description: string; mapVersionId: string; startX: number | null; startY: number | null; startYaw: number | null; endMode: 'LAST_POI' | 'POSE'; endX: number | null; endY: number | null; endYaw: number | null; viewerChoosesNextStop: boolean }
const moveButton = 'grid size-8 shrink-0 place-items-center rounded-lg text-[#2d78a9] hover:bg-[#e9f5ff] disabled:text-[#c3d0db] disabled:hover:bg-transparent'
// A new route has no start until Staff places one; 0, 0, 0 used to be saved silently.
const empty: Draft = { name: '', description: '', mapVersionId: '', startX: null, startY: null, startYaw: null, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null, viewerChoosesNextStop: false }
const STEPS = ['Bản đồ và tên', 'Điểm dừng', 'Điểm bắt đầu và kết thúc', 'Xem lại và lưu'] as const
const placed = (pose: PickerPose) => pose.x != null && pose.y != null && pose.yaw != null
const samePose = (a: PickerPose, b: PickerPose) => a.x === b.x && a.y === b.y && a.yaw === b.yaw
// START is still saved as endMode POSE; it only keeps the end pose following the start. A separate end pose is no longer
// offered (ADR-0065, ROUTE_END_POSE_NOT_START); a revision saved with one stays readable, but a new save chooses again.
type EndChoice = 'LAST_POI' | 'START'
// Plain words first; the map coordinates stay as a small second line for whoever checks them against the map.
const poseSummary = (pose: PickerPose) => placed(pose) ? <>
  <span className="block">{`Đã chọn trên bản đồ, robot quay hướng ${yawDegrees(pose.yaw!)}°`}</span>
  <span className="block font-mono text-xs text-muted">{`x ${pose.x!.toFixed(2)} m · y ${pose.y!.toFixed(2)} m`}</span>
</> : 'Chưa chọn'
// docs/lich-tour-theo-ca.md §2. The server checks the same bounds; these only say so before Save.
const MIN_DWELL_SECONDS = 15
const MAX_DWELL_SECONDS = 300
// ADR-0065 (RouteRuleSettings.MinVoteDwellSeconds and the 3-4 POI rule); the server checks the same and answers 409.
const MIN_VOTE_DWELL_SECONDS = 30
const MIN_VOTE_STOPS = 3
const MAX_VOTE_STOPS = 4
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
const metres = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
const durationText = formatMinutesSeconds
type NearStop = { name: string; meters: number }
/** A stop's POI revision as the route saved it, with the POI it belongs to when that POI is still listed. */
type StopPoi = { id: string; name: string; x: number; y: number; yaw: number; cameraPreset: string; proposal: PoiProposal | null }
// The server's PoiNavigationFingerprint fields at its precision: a newer revision that keeps them keeps the route's test run.
const navigationKey = (poi: { x: number; y: number; yaw: number; cameraPreset: string }) =>
  [poi.x.toFixed(4), poi.y.toFixed(4), poi.yaw.toFixed(6), poi.cameraPreset.trim().toUpperCase()].join('|')

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
  const [busy, setBusy] = useState<false | 'save' | 'submit'>(false)
  const [error, setError] = useState<string | null>(null)
  const initialDraft: Draft = source.data ? {
    name: source.data.name, description: source.data.description ?? '', mapVersionId: source.data.mapVersionId,
    startX: source.data.startX, startY: source.data.startY, startYaw: source.data.startYaw,
    endMode: source.data.endMode, endX: source.data.endX, endY: source.data.endY, endYaw: source.data.endYaw,
    viewerChoosesNextStop: source.data.viewerChoosesNextStop ?? false,
  } : empty
  const draft: Draft = draftOverride ?? (source.data ? {
    name: source.data.name, description: source.data.description ?? '', mapVersionId: source.data.mapVersionId,
    startX: source.data.startX, startY: source.data.startY, startYaw: source.data.startYaw,
    endMode: source.data.endMode, endX: source.data.endX, endY: source.data.endY, endYaw: source.data.endYaw,
    viewerChoosesNextStop: source.data.viewerChoosesNextStop ?? false,
  } : empty)
  const stops = stopsOverride ?? source.data?.stops.map(stop => ({
    poiRevisionId: stop.poiRevisionId, dwellSeconds: stop.dwellSeconds, headSteps: stop.headSteps,
  })) ?? []
  const initialStops = source.data?.stops.map(stop => ({ poiRevisionId: stop.poiRevisionId, dwellSeconds: stop.dwellSeconds, headSteps: stop.headSteps })) ?? []
  const changed = JSON.stringify([draft, stops]) !== JSON.stringify([initialDraft, initialStops])
  const updateDraft = (update: Partial<Draft>) => setDraftOverride(current => ({ ...draft, ...current, ...update }))
  // ADR-0062: a retired POI is never offered for a route; the server refuses it with POI_RETIRED.
  const verifiedPois = (proposals.data ?? []).filter((proposal: PoiProposal) => proposal.revision.navigationStatus === 'PASS' && !proposal.retiredAt)
  const available = verifiedPois.filter(proposal => proposal.revision.mapVersionId === draft.mapVersionId)
  // ADR-0061: a stop keeps the exact POI revision it was saved with. Its name and pose come from the route itself, so a
  // stop on an older revision still reads by name, and its POI is not offered again as a second stop.
  const allPois = proposals.data ?? []
  const savedStops = new Map((source.data?.stops ?? []).map(stop => [stop.poiRevisionId, stop]))
  const stopPoi = (revisionId: string): StopPoi | null => {
    const current = allPois.find(proposal => proposal.revision.id === revisionId)
    if (current) return { ...current.revision, proposal: current }
    const saved = savedStops.get(revisionId)
    return saved ? { id: revisionId, name: saved.name, x: saved.x, y: saved.y, yaw: saved.yaw, cameraPreset: saved.cameraPreset,
      proposal: allPois.find(proposal => proposal.id === saved.poiProposalId) ?? null } : null
  }
  const stopPois = stops.flatMap(stop => { const poi = stopPoi(stop.poiRevisionId); return poi ? [poi] : [] })
  const stopProposalIds = new Set(stopPois.flatMap(poi => poi.proposal ? [poi.proposal.id] : []))
  const candidates = available.filter(proposal => !stopProposalIds.has(proposal.id))
  // Stops come first, in route order, so the order being saved is the order on screen.
  const rows: StopPoi[] = [
    ...stops.map(stop => stopPoi(stop.poiRevisionId) ?? { id: stop.poiRevisionId, name: 'POI không còn trong danh sách', x: 0, y: 0, yaw: 0, cameraPreset: '', proposal: null }),
    ...candidates.map(proposal => ({ ...proposal.revision, proposal })),
  ]
  // Mirrors the server: a route needs PASS POIs on the exact map (ADR-0023) and current map evidence (ADR-0033).
  const poiMapIds = new Set(verifiedPois.map(proposal => proposal.revision.mapVersionId))
  // ADR-0060: the server also needs an approved narration for every stop (POI_NARRATION_NOT_APPROVED).
  const usableMapIds = new Set(verifiedPois.filter(usableForRoute).map(proposal => proposal.revision.mapVersionId))
  const mapBlock = ({ map, canUseForPoiPreparation }: MapVersionItem) => !canUseForPoiPreparation ? 'chưa đạt kiểm tra kỹ thuật'
    : !poiMapIds.has(map.id) ? 'chưa có POI đạt' : usableMapIds.has(map.id) ? null : 'chưa có POI có thuyết minh đã duyệt'
  const mapOptions = [...(maps.data ?? [])].sort((a, b) => Number(mapBlock(a) !== null) - Number(mapBlock(b) !== null))
  const mapLabel = staffMapLabels(maps.data ?? [], item => mapBlock(item) === null)
  const chosenMap = maps.data?.find(item => item.map.id === draft.mapVersionId)
  const mapNotReady = Boolean(chosenMap && !chosenMap.canUseForPoiPreparation)
  const raster = useMapRaster(draft.mapVersionId)
  const clearance = chosenMap?.poiClearanceMeters
  const startPose = { x: draft.startX, y: draft.startY, yaw: draft.startYaw }
  const endPose = { x: draft.endX, y: draft.endY, yaw: draft.endYaw }
  const voting = draft.viewerChoosesNextStop
  // Null: the edited revision ends at a separate pose, which a new save may not keep; Staff chooses one of the two.
  const endChoice: EndChoice | null = voting ? 'START' : endChoiceOverride
    ?? (draft.endMode === 'LAST_POI' ? 'LAST_POI' : placed(startPose) && samePose(endPose, startPose) ? 'START' : null)
  const separateEndKept = endChoice === null && draft.endMode === 'POSE'
  // ADR-0040: the server refuses a newly written start or end pose without free floor around it; say so before Next.
  // Like the server (SaveRouteRevision), a pose kept unchanged on the same map is exempt: it may predate the rule.
  const saved = source.data && source.data.mapVersionId === draft.mapVersionId ? source.data : null
  const kept = (pose: PickerPose, savedX?: number | null, savedY?: number | null) => saved != null && pose.x === savedX && pose.y === savedY
  const tooClose = (pose: PickerPose) => Boolean(raster.map && clearance != null && pose.x != null && pose.y != null
    && poseClearance(raster.map, raster.map.pixels ?? null, { x: pose.x, y: pose.y }, clearance) === 'blocked')
  const startTooClose = tooClose(startPose) && !kept(startPose, saved?.startX, saved?.startY)
  const poiName = (id: string) => stopPoi(id)?.name ?? 'POI không còn trong danh sách'
  // Both rules come with the map version from the server; without them the server alone decides.
  const minStops = chosenMap?.routeMinStops
  const minSeparation = chosenMap?.routeMinStopSeparationMeters
  const stopIds = new Set(stops.map(stop => stop.poiRevisionId))
  // The current revision of a POI already on the route is taken too, for the "copy a POI's pose" pickers.
  const takenPoiRevisions = new Set([...stopIds, ...available.filter(proposal => stopProposalIds.has(proposal.id)).map(proposal => proposal.revision.id)])
  const nearStop = (pose: PickerPose, candidates: typeof stopPois): NearStop | null => {
    if (minSeparation == null || pose.x == null || pose.y == null) return null
    const point = { x: pose.x, y: pose.y }
    const near = candidates.find(poi => distance(point, poi) < minSeparation)
    return near ? { name: near.name, meters: distance(point, near) } : null
  }
  const startNearStop = nearStop(startPose, stopPois)
  // Neighbours in order, or, when Viewers choose the order, every pair of POIs (ADR-0065: any two may follow each other).
  const stopPairs = voting
    ? stopPois.flatMap((poi, index) => stopPois.slice(index + 1).map(other => [poi, other] as const))
    : stopPois.slice(1).map((poi, index) => [stopPois[index], poi] as const)
  const closeStops = minSeparation == null ? null : stopPairs.find(([previous, poi]) => distance(previous, poi) < minSeparation) ?? null
  // A POI without approved narration cannot be ticked; one kept from the revision being edited is named here,
  // so the problem shows before Save instead of as a refusal from the server.
  // Narration belongs to the POI, so a stop on an older revision needs the same approval.
  const unapprovedStops = stopPois.filter(poi => poi.proposal && !poi.proposal.retiredAt && !poi.proposal.narration?.approved).map(poi => poi.name)
  // A stop kept from the edited revision whose POI was retired since; Staff removes it or reactivates the POI.
  const retiredStops = stopPois.filter(poi => poi.proposal?.retiredAt).map(poi => poi.name)
  const totalDwell = stops.reduce((sum, stop) => sum + (Number.isFinite(stop.dwellSeconds) ? stop.dwellSeconds : 0), 0)
  // The estimate the server will store on Save (TourSchedule.EstimatedDurationSeconds), at the server's own speed, so the
  // review step warns about a shift the route page would also name. Unknown while a stop's position or the speed is missing.
  const [today] = useState(() => campusDateKey(Date.now()))
  const shiftsToday = useTourShifts(today, today, step === STEPS.length - 1)
  const stopPoints = stops.map(stop => { const poi = stopPoi(stop.poiRevisionId); return poi ? { x: poi.x, y: poi.y, dwellSeconds: stop.dwellSeconds } : null })
  // A voting route's length is the longest of its possible orders, which only the server computes (ADR-0065).
  const estimate = !voting && stopPoints.every(point => point !== null) && placed(startPose)
    ? estimatedRouteSeconds({ x: startPose.x!, y: startPose.y! }, stopPoints.filter(point => point !== null),
      draft.endMode === 'POSE' && draft.endX != null && draft.endY != null ? { x: draft.endX, y: draft.endY } : null,
      shiftsToday.data?.estimatedSpeedMetersPerSecond)
    : null

  const missingByStep: string[][] = [
    [!draft.name.trim() && 'nhập tên tuyến', !draft.mapVersionId && 'chọn bản đồ', mapNotReady && 'chọn bản đồ còn đạt kiểm tra kỹ thuật'],
    [stops.length < (minStops ?? 1) && `chọn ít nhất ${minStops ?? 1} điểm dừng`,
      voting && (stops.length < MIN_VOTE_STOPS || stops.length > MAX_VOTE_STOPS) && `chọn từ ${MIN_VOTE_STOPS} đến ${MAX_VOTE_STOPS} điểm dừng khi cho Viewer chọn điểm tiếp theo`,
      voting && stops.some(stop => stop.dwellSeconds < MIN_VOTE_DWELL_SECONDS) && `thời gian dừng ít nhất ${MIN_VOTE_DWELL_SECONDS} giây khi cho Viewer chọn điểm tiếp theo`,
      stops.some(stop => !Number.isInteger(stop.dwellSeconds) || stop.dwellSeconds < MIN_DWELL_SECONDS || stop.dwellSeconds > MAX_DWELL_SECONDS) && `thời gian dừng từ ${MIN_DWELL_SECONDS} đến ${MAX_DWELL_SECONDS} giây`,
      closeStops && `${closeStops[0].name} và ${closeStops[1].name} quá gần nhau`,
      unapprovedStops.length > 0 && `bỏ chọn ${unapprovedStops.join(', ')} hoặc duyệt thuyết minh trước (chưa có thuyết minh đã duyệt)`,
      retiredStops.length > 0 && `bỏ điểm dừng ${retiredStops.join(', ')} (POI đã ngưng dùng) hoặc dùng lại POI`],
    [!placed(startPose) && 'chọn điểm bắt đầu và hướng', startTooClose && 'điểm bắt đầu quá sát vật cản',
      startNearStop && `điểm bắt đầu quá gần điểm dừng ${startNearStop.name}`,
      endChoice === null && 'chọn điểm kết thúc'],
    [],
  ].map(list => list.filter((item): item is string => Boolean(item)))
  const firstOpen = missingByStep.findIndex(list => list.length > 0)
  // Red only for a real problem (too close, against an obstacle, a map that lost its check); what is simply still to do reads grey.
  const problemByStep = [mapNotReady, Boolean(closeStops) || unapprovedStops.length > 0 || retiredStops.length > 0, Boolean(startTooClose || startNearStop), false]
  const goTo = (index: number) => { setStep(index); setFurthest(current => Math.max(current, index)); setError(null) }

  const moveStop = (index: number, offset: number) => setStopsOverride(current => {
    const next = [...(current ?? stops)]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    return next
  })
  const toggle = (revisionId: string) => setStopsOverride(current => (current ?? stops).some(stop => stop.poiRevisionId === revisionId)
    ? (current ?? stops).filter(stop => stop.poiRevisionId !== revisionId)
    : [...(current ?? stops), { poiRevisionId: revisionId, dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 10 }] }])
  // Swaps a stop onto its POI's newer revision; order, dwell and head steps stay.
  const swapToNewer = (oldRevisionId: string, newRevisionId: string) => setStopsOverride(current =>
    (current ?? stops).map(stop => stop.poiRevisionId === oldRevisionId ? { ...stop, poiRevisionId: newRevisionId } : stop))
  // ADR-0065: a voting route always returns to its start, so turning the switch on chooses that end and locks it.
  const setVoting = (on: boolean) => {
    updateDraft(on ? { viewerChoosesNextStop: true, endMode: 'POSE', endX: draft.startX, endY: draft.startY, endYaw: draft.startYaw } : { viewerChoosesNextStop: false })
    if (on) setEndChoice('START')
  }
  const chooseMap = (mapVersionId: string) => {
    // Stops and poses belong to one map version, so another version starts them again.
    updateDraft({ mapVersionId, startX: null, startY: null, startYaw: null, endX: null, endY: null, endYaw: null })
    setStopsOverride([])
    setFurthest(0)
  }
  const save = async (event: FormEvent | null, submit = false) => {
    event?.preventDefault()
    if (busy || step !== STEPS.length - 1 || unchanged) return
    if (firstOpen !== -1) { setStep(firstOpen); return }
    const body: VersionedRouteDraft = {
      ...draft, startX: draft.startX!, startY: draft.startY!, startYaw: draft.startYaw!,
      name: draft.name.trim(), description: draft.description.trim() || null, requestId: crypto.randomUUID(),
      expectedCurrentRevision: source.data?.revisionNumber ?? 0, mapVersionId: draft.mapVersionId, stops,
    }
    setBusy(submit ? 'submit' : 'save'); setError(null)
    try {
      const route = routeId ? await versionedRoutesApi.revise(routeId, body) : await versionedRoutesApi.create(body)
      // The draft is saved; a refused submit leaves it as a draft, which the route page can still send.
      let submitError: string | null = null
      let saved = route
      if (submit) {
        try { saved = await versionedRoutesApi.submit(route) } catch (cause) { submitError = errorText(cause) }
      }
      const submitted = submit && !submitError
      // A save that changed only dwell or narration carries its path's result (ADR-0023 addendum); the toast says which case it is.
      const outcome = saveResultText({ isSubmitted: true, verificationStatus: saved.verificationStatus })
      if (submitError) notify({ tone: 'error', title: `Đã lưu “${body.name}” nhưng chưa gửi được kiểm chứng`, detail: `${submitError} Bấm Gửi kiểm chứng tuyến ở trang tuyến để gửi lại.` })
      else if (routeId) notify({ title: submitted ? `Đã lưu và gửi kiểm chứng “${body.name}”` : `Đã lưu “${body.name}”, chưa gửi kiểm chứng`,
        detail: submitted ? outcome : `${outcome} Bấm Gửi kiểm chứng tuyến ở trang tuyến để dùng bản này.` })
      else celebrate({ title: `Đã tạo tuyến “${body.name}”`, detail: submitted
        ? `${stops.length} POI trên map đã chọn. Đã gửi kiểm chứng, chờ kỹ thuật chạy thử trước khi dùng cho Tour.`
        : `${stops.length} POI trên map đã chọn. Tuyến chưa gửi kiểm chứng: gửi để kỹ thuật chạy thử trước khi dùng cho Tour.` })
      navigate(`/staff/manage/routes/${route.routeId}`, { replace: true, ...AFTER_SAVE })
    } catch (cause) { setError(routeSaveError(cause)) }
    finally { setBusy(false) }
  }
  if ((routeId && source.isPending) || proposals.isPending || maps.isPending) return <AdminPage><p className="p-8">Đang tải dữ liệu…</p></AdminPage>
  if (source.error || proposals.error || maps.error) return <AdminPage><p role="alert" className="p-4 text-sm text-red-700">Không tải được tuyến, POI đã kiểm chứng hoặc map.</p></AdminPage>

  const last = step === STEPS.length - 1
  // B1: whether this save keeps the result of the edited one, needs a new run, or starts with none.
  // Each stop with its POI and navigation, so a newer revision of the same POI is not read as one added and one removed.
  const pathStops = stops.map(stop => {
    const poi = stopPoi(stop.poiRevisionId)
    return poi ? { ...stop, poiProposalId: poi.proposal?.id ?? savedStops.get(stop.poiRevisionId)?.poiProposalId ?? null, name: poi.name, x: poi.x, y: poi.y, yaw: poi.yaw, cameraPreset: poi.cameraPreset } : stop
  })
  const draftChange = source.data ? routeChanges(source.data, { ...draft, mapVersionId: draft.mapVersionId, startX: draft.startX ?? NaN, startY: draft.startY ?? NaN, startYaw: draft.startYaw ?? NaN, stops: pathStops }) : null
  // ADR-0060: a save copies each stop's approved narration, so narration approved after the revision in use was saved
  // reaches the route only by saving again. That is a change, though not of the path; the server agrees.
  const savedAt = source.data?.revisionHistory.find(item => item.revisionId === source.data?.revisionId)?.createdAt
  const newNarration = savedAt ? stops.filter(stop => {
    const approvedAt = stopPoi(stop.poiRevisionId)?.proposal?.narration?.approved?.approvedAt
    return approvedAt && Date.parse(approvedAt) > Date.parse(savedAt)
  }).length : 0
  const pathChange = draftChange && newNarration ? { ...draftChange, changes: [...draftChange.changes, `cập nhật thuyết minh mới duyệt ${newNarration} điểm`] } : draftChange
  const keptPass = source.data?.verificationStatus === 'PASS'
  const keptResultText = keptPass ? 'chạy thử đạt, không cần chạy lại' : 'chạy thử không đạt. Nếu lỗi do đường đi thì sửa đường đi rồi gửi lại; nếu không thì nhờ Kỹ thuật chạy lại cùng đường đi'
  const keepsResult = Boolean(source.data?.isSubmitted && pathChange && !pathChange.pathChanged && ['PASS', 'FAIL'].includes(source.data.verificationStatus))
  // E1: an edit that changes nothing would only save a copy of the revision in use; a new route has nothing to compare.
  const unchanged = Boolean(pathChange && !pathChange.changes.length)
  const saveHint = firstOpen !== -1 ? 'route-step-missing' : unchanged ? 'route-unchanged' : undefined
  const missingHere = missingByStep[step]
  return <AdminPage>
    <UnsavedChangesGuard when={changed && !busy} />
    <PageHeader eyebrow="Nội dung tham quan" back={{ to: '/staff/manage/routes', label: 'Danh mục tuyến' }} title={routeId ? 'Sửa tuyến' : 'Tạo tuyến'} description="Tuyến gắn với đúng một bản đồ và chỉ gồm các POI đã đạt kiểm chứng, có thuyết minh đã duyệt, trên bản đồ đó." />
    {source.data && <div className="mb-4"><RouteFailBanner route={source.data} /></div>}
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
        <div className="text-sm"><label htmlFor="route-map">Bản đồ</label><select title="" id="route-map" className={`${inputClass} mt-1`} required value={draft.mapVersionId} onChange={e => chooseMap(e.target.value)}><option value="">— Chọn bản đồ —</option>{mapOptions.map(item => <option key={item.map.id} value={item.map.id} disabled={mapBlock(item) !== null}>{mapLabel(item.map, mapBlock(item))}</option>)}</select>{mapNotReady ? <p role="alert" className="mt-1 text-xs text-[#b23e31]">Bản đồ này không còn kiểm tra kỹ thuật đạt nên không lưu được tuyến. Nhờ Kỹ thuật kiểm tra lại hoặc chọn bản đồ khác.</p> : <p className="mt-1 text-xs text-[#64748b]">Chỉ chọn được bản đồ đạt kiểm tra kỹ thuật và đã có POI đạt kiểm chứng, có thuyết minh đã duyệt. Đổi bản đồ sẽ chọn lại điểm dừng và điểm bắt đầu.</p>}</div>
        <label className="text-sm sm:col-span-2">Mô tả<textarea className={`${inputClass} mt-1`} rows={2} maxLength={1000} value={draft.description} onChange={e => updateDraft({ description: e.target.value })} /></label>
      </section>}

      {step === 1 && <section aria-label={STEPS[1]} className={`${panelClass} p-4`}><h2 className="font-semibold">Điểm dừng</h2><p className="mt-1 text-xs text-[#64748b]">Tick POI hoặc bấm điểm trên bản đồ để chọn. {voting ? 'Robot tới POI số 1 trước, sau đó đi theo phiếu bầu; thứ tự các POI sau chỉ dùng khi hòa phiếu.' : 'Robot đi theo thứ tự đánh số, dùng mũi tên để đổi thứ tự.'}{minStops != null && ` Cần ít nhất ${minStops} điểm dừng.`} Mỗi điểm dừng từ {voting ? MIN_VOTE_DWELL_SECONDS : MIN_DWELL_SECONDS} đến {MAX_DWELL_SECONDS} giây.</p>
        <div className="mt-3 rounded-xl border border-[#e2e8f0] px-3 py-2.5">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="min-w-0"><span className="block text-sm font-semibold text-[#0f172a]">Cho Viewer chọn điểm tiếp theo</span>
              <span className="block text-xs text-[#64748b]">Ở mỗi POI, học sinh bầu POI tiếp theo trong lúc robot dừng. Tuyến cần từ {MIN_VOTE_STOPS} đến {MAX_VOTE_STOPS} POI và luôn quay về điểm bắt đầu.</span></span>
            <input type="checkbox" role="switch" className="size-5 shrink-0 accent-[#2563eb]" checked={voting} onChange={event => setVoting(event.target.checked)} />
          </label>
          {voting && <p className="mt-1.5 text-xs font-medium text-[#334155]">POI đầu là điểm cố định, các POI sau do học sinh bầu.</p>}
        </div>
        {closeStops && <p role="alert" className="mt-2 text-xs text-[#b23e18]">{closeStops[0].name} và {closeStops[1].name} cách nhau {metres(distance(closeStops[0], closeStops[1]))} m, cần ít nhất {metres(minSeparation!)} m. {voting ? 'Khi học sinh bầu, hai POI bất kỳ có thể đi liền nhau, nên bỏ bớt một điểm.' : 'Đổi thứ tự hoặc bỏ bớt một điểm.'}</p>}
        {rows.length ? <div className="mt-3 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><ol className="space-y-2">{rows.map(poi => {
          const index = stops.findIndex(stop => stop.poiRevisionId === poi.id)
          const selected = index >= 0
          const narration = narrationStatus(poi.proposal?.narration)
          // Unticking stays possible for a stop kept from the edited revision, so it can be removed.
          const lockedOut = (!narration.approved || (voting && stops.length >= MAX_VOTE_STOPS)) && !selected
          // A stop on an older revision of a POI that has moved on (ADR-0061): never swapped by itself.
          const retired = selected && Boolean(poi.proposal?.retiredAt)
          const newer = selected && !retired && poi.proposal && poi.proposal.revision.id !== poi.id ? poi.proposal.revision : null
          const newerUsable = newer?.navigationStatus === 'PASS' && newer.mapVersionId === draft.mapVersionId
          return <li key={poi.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3 text-sm ${selected ? narration.approved ? 'border-[#bcd7ea] bg-[#f5fafd]' : 'border-[#f1dcb0] bg-[#fffaf0]' : 'border-[#e2e8f0]'}`}>
            <label className={`flex min-w-0 flex-1 basis-56 items-center gap-3 ${lockedOut ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <input type="checkbox" className="size-4 shrink-0 accent-[#2d719e]" checked={selected} disabled={lockedOut} aria-describedby={narration.approved ? undefined : `narration-${poi.id}`} onChange={() => toggle(poi.id)} />
              {selected && <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#173b5f] text-xs font-semibold text-white">{index + 1}</span>}
              {selected && voting && index === 0 && <span className="shrink-0 rounded-full bg-[#eff6ff] px-2 py-px text-[11px] font-semibold text-[#1d4ed8]">Điểm cố định</span>}
              <span className="min-w-0 break-words"><span className={`font-semibold ${lockedOut ? 'text-[#64748b]' : 'text-[#0f172a]'}`}>{poi.name}</span>
                {poi.proposal && <span id={`narration-${poi.id}`} className="ml-2 inline-block align-middle"><ToneBadge tone={narration.tone}>{narration.approved ? `Thuyết minh: ${narration.label}` : narration.label === 'Chờ duyệt' ? 'Thuyết minh chờ duyệt, chưa chọn được' : 'Chưa có thuyết minh, chưa chọn được'}</ToneBadge></span>}</span>
            </label>
            {selected && <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-[#64748b]">Dừng<span className="w-20 shrink-0"><input aria-label={`Thời gian dừng ${poi.name} (giây)`} aria-describedby={voting ? `dwell-hint-${poi.id}` : undefined} className={inputClass} type="number" min={voting ? MIN_VOTE_DWELL_SECONDS : MIN_DWELL_SECONDS} max={MAX_DWELL_SECONDS} value={stops[index].dwellSeconds} onChange={e => setStopsOverride(current => (current ?? stops).map(stop => stop.poiRevisionId === poi.id ? { ...stop, dwellSeconds: Number(e.target.value) } : stop))} /></span>giây</label>
              <button type="button" className={moveButton} aria-label={`Đưa ${poi.name} lên`} disabled={index === 0} onClick={() => moveStop(index, -1)}><ChevronUp size={16} aria-hidden="true" /></button>
              <button type="button" className={moveButton} aria-label={`Đưa ${poi.name} xuống`} disabled={index === stops.length - 1} onClick={() => moveStop(index, 1)}><ChevronDown size={16} aria-hidden="true" /></button>
            </div>}
            {selected && voting && <div className="w-full text-xs">
              {stops[index].dwellSeconds < MIN_VOTE_DWELL_SECONDS && <p role="alert" className="text-[#b23e18]">Cần dừng ít nhất {MIN_VOTE_DWELL_SECONDS} giây để học sinh kịp bầu.</p>}
              <p id={`dwell-hint-${poi.id}`} className="text-[#64748b]">Nên bằng thời lượng thuyết minh cộng khoảng 20 giây để học sinh bầu.</p>
            </div>}
            {retired && <div role="alert" className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-[#fbeeec] px-2.5 py-1.5 text-xs text-[#a4473d]">
              <span className="min-w-0 flex-1">POI này đã ngưng dùng. Bỏ điểm dừng này, hoặc dùng lại POI ở trang POI, rồi lưu tuyến.</span>
              <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => toggle(poi.id)}>Bỏ điểm dừng</button>
            </div>}
            {newer && <div className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs text-[#7d5310]">
              <span className="min-w-0 flex-1">{newerUsable
                ? `POI này có phiên bản mới đã đạt.${navigationKey(newer) !== navigationKey(poi) ? ' Tuyến sẽ phải chạy thử lại.' : ''}`
                : 'POI này đang có bản sửa chưa đạt, tuyến giữ bản cũ.'}</span>
              {newerUsable && <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => swapToNewer(poi.id, newer.id)}>Dùng bản mới</button>}
            </div>}
          </li>
        })}</ol>
          <div className="lg:sticky lg:top-4"><RouteMap mapVersionId={draft.mapVersionId} start={placed(startPose) ? { x: startPose.x!, y: startPose.y! } : null}
            stops={stopPois.map(poi => ({ id: poi.id, name: poi.name, x: poi.x, y: poi.y }))}
            candidates={candidates.filter(usableForRoute).map(({ revision }) => ({ id: revision.id, name: revision.name, x: revision.x, y: revision.y }))}
            onToggle={toggle} /></div>
        </div> : <p className="py-4 text-sm text-[#64748b]">Chưa có POI đạt kiểm chứng trên bản đồ này.</p>}
      </section>}

      {step === 2 && <div className="space-y-4">
        <PoseStep title="Điểm bắt đầu" help="Nơi robot đứng chờ trước khi Tour bắt đầu, ví dụ chỗ đỗ. Không bắt buộc trùng một POI."
          pose={startPose} onChange={pose => updateDraft({ startX: pose.x, startY: pose.y, startYaw: pose.yaw, ...(endChoice === 'START' && { endX: pose.x, endY: pose.y, endYaw: pose.yaw }) })}
          raster={raster} clearance={clearance} tooClose={startTooClose} pois={available} stopIds={takenPoiRevisions}
          nearStop={startNearStop} nearStopLabel="Điểm bắt đầu" minSeparation={minSeparation} placing="điểm bắt đầu" stops={stopPois} />
        <section aria-label="Điểm kết thúc" className={`${panelClass} space-y-3 p-4`}>
          <div><h2 className="font-semibold">Điểm kết thúc</h2><p className="mt-1 text-xs text-[#64748b]">Robot dừng ở đâu khi hết tuyến.</p></div>
          {separateEndKept && <p role="status" className="rounded-lg bg-[#fffaf0] px-3 py-2 text-xs text-[#7d5310]">Bản đang dùng kết thúc ở một vị trí riêng. Tuyến lưu mới chỉ kết thúc tại điểm dừng cuối hoặc quay về điểm bắt đầu, hãy chọn một trong hai.</p>}
          <div role="radiogroup" aria-label="Điểm kết thúc" className="grid gap-2 sm:grid-cols-2">
            {([
              ['LAST_POI', 'Dừng tại điểm dừng cuối', voting ? 'Không dùng được khi cho Viewer chọn điểm tiếp theo' : stops.length ? poiName(stops[stops.length - 1].poiRevisionId) : '-'],
              ['START', 'Quay về điểm bắt đầu', voting ? 'Tuyến cho Viewer chọn điểm tiếp theo luôn quay về điểm bắt đầu' : placed(startPose) ? 'Robot về lại đúng vị trí và hướng lúc xuất phát' : 'Chọn điểm bắt đầu trước'],
            ] as const).map(([value, label, detail]) => (
              <label key={value} className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm ${voting ? 'cursor-not-allowed' : 'cursor-pointer'} ${voting && value === 'LAST_POI' ? 'opacity-60' : ''} ${endChoice === value ? 'border-[#2563eb] bg-[#eff6ff]' : 'border-[#e2e8f0]'}`}>
                <input type="radio" name="route-end-mode" className="mt-0.5 accent-[#2563eb]" checked={endChoice === value} disabled={voting} onChange={() => {
                  setEndChoice(value)
                  updateDraft(value === 'LAST_POI' ? { endMode: 'LAST_POI', endX: null, endY: null, endYaw: null }
                    : { endMode: 'POSE', endX: draft.startX, endY: draft.startY, endYaw: draft.startYaw })
                }} />
                <span><span className="block font-medium text-[#0f172a]">{label}</span><span className="text-xs text-[#64748b]">{detail}</span></span>
              </label>
            ))}
          </div>
        </section>
      </div>}

      {step === 3 && <section aria-label={STEPS[3]} className={`${panelClass} p-4`}>
        <h2 className="font-semibold">Xem lại trước khi lưu</h2>
        <dl className="mt-3 divide-y divide-[#f1f5f9] text-sm">
          <ReviewRow label="Tên tuyến" onEdit={() => goTo(0)}>{draft.name.trim()}{draft.description.trim() && <span className="block text-xs text-[#64748b]">{draft.description.trim()}</span>}</ReviewRow>
          <ReviewRow label="Bản đồ" onEdit={() => goTo(0)}>{chosenMap ? mapLabel(chosenMap.map) : '-'}</ReviewRow>
          <ReviewRow label={`Điểm dừng (${stops.length})`} onEdit={() => goTo(1)}><ol className="list-inside list-decimal">{stops.map(stop => <li key={stop.poiRevisionId}>{poiName(stop.poiRevisionId)} · dừng {stop.dwellSeconds} giây</li>)}</ol></ReviewRow>
          <ReviewRow label="Điểm bắt đầu" onEdit={() => goTo(2)}><span>{poseSummary(startPose)}</span></ReviewRow>
          <ReviewRow label="Viewer chọn điểm" onEdit={() => goTo(1)}>{voting ? 'Có. POI đầu là điểm cố định, các POI sau do học sinh bầu.' : 'Không, robot đi theo thứ tự đã đặt.'}</ReviewRow>
          <ReviewRow label="Điểm kết thúc" onEdit={() => goTo(2)}>{endChoice === 'LAST_POI' ? 'Dừng tại điểm dừng cuối' : endChoice === 'START' ? 'Quay về điểm bắt đầu' : 'Chưa chọn'}</ReviewRow>
          <ReviewRow label="Lộ trình" onEdit={() => goTo(1)}>
            <p aria-label="Lộ trình robot đi">{(voting && stops.length
              ? ['Bắt đầu', `1. ${poiName(stops[0].poiRevisionId)}`, `các POI còn lại theo phiếu bầu (${stops.slice(1).map(stop => poiName(stop.poiRevisionId)).join(', ')})`, 'Kết thúc tại điểm bắt đầu']
              : ['Bắt đầu', ...stops.map((stop, index) => `${index + 1}. ${poiName(stop.poiRevisionId)}`),
                endChoice === 'LAST_POI' ? 'Kết thúc tại điểm dừng cuối' : endChoice === 'START' ? 'Kết thúc tại điểm bắt đầu' : 'Kết thúc']).join(' → ')}</p>
            <p className="mt-1">Tổng thời gian dừng: <span className="font-semibold">{durationText(totalDwell)}</span></p>
            {estimate != null
              ? <p className="mt-1">Thời lượng dự kiến khoảng <span className="font-semibold">{formatExpectedDuration(estimate)}</span>
                <span className="block text-xs text-[#64748b]">Tính từ thời gian dừng và quãng đường robot đi.</span></p>
              : <p className="mt-1 text-xs text-[#64748b]">{voting ? 'Hệ thống tính thời lượng dự kiến khi lưu, theo thứ tự đi dài nhất có thể.' : shiftsToday.isPending ? 'Đang tính thời lượng dự kiến…' : 'Chưa tính được thời lượng dự kiến. Hệ thống sẽ tính khi lưu.'}</p>}
            <ShiftLengthWarning expectedSeconds={estimate} />
          </ReviewRow>
        </dl>
        {pathChange && <div id={unchanged ? 'route-unchanged' : undefined} className="mt-3"><Notice tone={keepsResult && keptPass ? 'success' : 'warn'}>
          {unchanged ? `Chưa thay đổi gì so với bản đang dùng, nên không cần lưu.${source.data?.isSubmitted ? '' : ' Muốn gửi Kỹ thuật chạy thử thì bấm Gửi kiểm chứng tuyến ở trang tuyến.'}`
            : keepsResult ? `Chỉ ${pathChange.changes.join(', ')}: đường đi không đổi nên bản mới giữ kết quả ${keptResultText}.`
            : pathChange.pathChanged ? `Bản mới ${pathChange.changes.join(', ')}: đường đi đã đổi nên cần gửi kiểm chứng và chờ Kỹ thuật chạy thử lại trước khi tạo Tour.`
            : `Bản mới ${pathChange.changes.join(', ')}. Bản đang dùng chưa có kết quả chạy thử, nên vẫn cần gửi kiểm chứng và chạy thử.`}
        </Notice></div>}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </section>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <SaveBlockedHint id="route-step-missing" tone={!last && problemByStep[step] ? 'danger' : 'neutral'} lead={!last && problemByStep[step] ? 'Chưa sang bước tiếp được' : 'Cần'}
          missing={last ? (firstOpen === -1 ? [] : [`hoàn tất bước ${firstOpen + 1}`]) : missingHere} />
        <Link to={routeId ? `/staff/manage/routes/${routeId}` : '/staff/manage/routes'} className={buttonClass('secondary')}>Hủy bỏ</Link>
        {step > 0 && <button type="button" className={buttonClass('secondary')} onClick={() => goTo(step - 1)}><ChevronLeft size={15} aria-hidden="true" />Quay lại</button>}
        {/* Distinct keys: if React reused the Next button as the submit button, the click that opens
            the review step would finish as a submit and save before anyone reviewed it. */}
        {last
          ? <>
            <button key="save" disabled={Boolean(busy) || firstOpen !== -1 || unchanged} aria-describedby={saveHint} type="submit" className={buttonClass('secondary')}>{busy === 'save' ? 'Đang lưu…' : 'Lưu, chưa gửi kiểm chứng'}</button>
            <button key="submit" type="button" disabled={Boolean(busy) || firstOpen !== -1 || unchanged} aria-describedby={saveHint} onClick={() => void save(null, true)} className={buttonClass('primary')}>{busy === 'submit' ? 'Đang xử lý…' : 'Lưu và gửi kiểm chứng'}</button>
          </>
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

const VOTE_SAVE_ERRORS: Record<string, string> = {
  ROUTE_VOTE_STOP_COUNT: `Tuyến cho Viewer chọn điểm tiếp theo cần từ ${MIN_VOTE_STOPS} đến ${MAX_VOTE_STOPS} điểm dừng. Thêm hoặc bỏ điểm ở bước 2 rồi lưu lại.`,
  ROUTE_VOTE_DWELL_TOO_SHORT: `Tuyến cho Viewer chọn điểm tiếp theo cần dừng ít nhất ${MIN_VOTE_DWELL_SECONDS} giây ở mỗi điểm để học sinh kịp bầu. Sửa thời gian dừng ở bước 2 rồi lưu lại.`,
  ROUTE_VOTE_END_MUST_RETURN: 'Tuyến cho Viewer chọn điểm tiếp theo phải quay về điểm bắt đầu. Chọn Quay về điểm bắt đầu ở bước 3 rồi lưu lại.',
  ROUTE_END_POSE_NOT_START: 'Điểm kết thúc chỉ được là điểm dừng cuối hoặc điểm bắt đầu. Chọn lại ở bước 3 rồi lưu lại.',
}

/** Says why a route save was refused; a stop-distance refusal names the stop (docs/lich-tour-theo-ca.md §6). */
function routeSaveError(cause: unknown) {
  const message = errorText(cause)
  // ADR-0065 refusals; these also say where in the form to fix them.
  const code = apiErrorCode(cause)
  if (code && VOTE_SAVE_ERRORS[code]) return VOTE_SAVE_ERRORS[code]
  if (cause instanceof ApiError && cause.status === 409 && cause.body.includes('ROUTE_STOP_TOO_CLOSE'))
    return message.includes('cần ít nhất') ? message : 'Điểm bắt đầu, điểm kết thúc hoặc hai điểm dừng liền nhau đặt quá gần nhau. Sửa ở bước 2 hoặc 3 rồi lưu lại.'
  // The server names the POI in Vietnamese ("POI {tên} chưa có thuyết minh đã duyệt."); say what to do next.
  if (apiErrorCode(cause) === 'POI_NARRATION_NOT_APPROVED')
    return `${message.startsWith('POI ') ? message : 'Một điểm dừng chưa có thuyết minh đã duyệt.'} Nhờ một Staff khác duyệt thuyết minh ở trang POI, hoặc bỏ điểm đó ở bước 2, rồi lưu lại.`
  // ADR-0061: "POI {tên} đã có trong tuyến. Mỗi POI chỉ được dùng một lần."
  if (apiErrorCode(cause) === 'ROUTE_DUPLICATE_POI')
    return `${message.startsWith('POI ') ? message : 'Một POI có hai điểm dừng trong tuyến. Mỗi POI chỉ được dùng một lần.'} Bỏ một trong hai điểm dừng ở bước 2 rồi lưu lại.`
  // ADR-0062: "POI {tên} đã ngưng dùng. Bỏ khỏi tuyến hoặc dùng lại POI." / a discarded POI.
  if (apiErrorCode(cause) === 'POI_RETIRED')
    return message.startsWith('POI ') ? message : 'Một điểm dừng dùng POI đã ngưng dùng. Bỏ điểm dừng đó ở bước 2 hoặc dùng lại POI ở trang POI.'
  if (apiErrorCode(cause) === 'POI_PROPOSAL_DISCARDED')
    return message.startsWith('POI ') ? message : 'Một điểm dừng dùng POI đã bị xoá. Bỏ điểm dừng đó ở bước 2 rồi lưu lại.'
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
