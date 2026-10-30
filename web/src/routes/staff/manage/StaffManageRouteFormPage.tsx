import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { ToneBadge } from '../../../features/technical/TechnicalUi'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { celebrate, notify } from '../../../components/ui/toast-store'
import { technicalApi, type MapVersionItem, type PoiProposal } from '../../../features/technical/api/technical'
import { errorText } from '../../../features/technical/technical-format'
import { usePoiProposals } from '../../../features/technical/technical-hooks'
import { versionedRoutesApi, type VersionedRouteDraft } from '../../../features/administration/routes/versioned-api'

type StopDraft = { poiRevisionId: string; dwellSeconds: number; headSteps: Array<{ preset: 'FRONT' | 'LEFT' | 'RIGHT'; holdSeconds: number }> }
type Draft = { name: string; description: string; mapVersionId: string; startX: number; startY: number; startYaw: number; endMode: 'LAST_POI' | 'POSE'; endX: number | null; endY: number | null; endYaw: number | null }
const startFields = { startX: 'X (m)', startY: 'Y (m)', startYaw: 'Hướng yaw (rad)' } as const
const endFields = { endX: 'X kết thúc (m)', endY: 'Y kết thúc (m)', endYaw: 'Hướng yaw kết thúc (rad)' } as const
const moveButton = 'grid size-8 shrink-0 place-items-center rounded-lg text-[#2d78a9] hover:bg-[#e9f5ff] disabled:text-[#c3d0db] disabled:hover:bg-transparent'
const empty: Draft = { name: '', description: '', mapVersionId: '', startX: 0, startY: 0, startYaw: 0, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null }

export default function StaffManageRouteFormPage() {
  const { routeId } = useParams()
  const navigate = useNavigate()
  const source = useQuery({ queryKey: ['versioned-routes', routeId], queryFn: () => versionedRoutesApi.get(routeId!), enabled: Boolean(routeId) })
  const proposals = usePoiProposals()
  const maps = useQuery({ queryKey: ['technical', 'maps'], queryFn: technicalApi.listMaps })
  const [draftOverride, setDraftOverride] = useState<Draft | null>(null)
  const [stopsOverride, setStopsOverride] = useState<StopDraft[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const draft: Draft = draftOverride ?? (source.data ? {
    name: source.data.name, description: source.data.description ?? '', mapVersionId: source.data.mapVersionId,
    startX: source.data.startX, startY: source.data.startY, startYaw: source.data.startYaw,
    endMode: source.data.endMode, endX: source.data.endX, endY: source.data.endY, endYaw: source.data.endYaw,
  } : empty)
  const stops = stopsOverride ?? source.data?.stops.map(stop => ({
    poiRevisionId: stop.poiRevisionId, dwellSeconds: stop.dwellSeconds, headSteps: stop.headSteps,
  })) ?? []
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
  const chosenMap = maps.data?.find(item => item.map.id === draft.mapVersionId)
  const mapNotReady = Boolean(chosenMap && !chosenMap.canUseForPoiPreparation)
  const moveStop = (index: number, offset: number) => setStopsOverride(current => {
    const next = [...(current ?? stops)]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    return next
  })
  const toggle = (proposal: PoiProposal) => setStopsOverride(current => (current ?? stops).some(stop => stop.poiRevisionId === proposal.revision.id)
    ? (current ?? stops).filter(stop => stop.poiRevisionId !== proposal.revision.id)
    : [...(current ?? stops), { poiRevisionId: proposal.revision.id, dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 10 }] }])
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.name.trim() || !draft.mapVersionId || stops.length === 0) { setError('Nhập tên, chọn bản đồ và ít nhất một POI đã đạt trên bản đồ đó.'); return }
    const body: VersionedRouteDraft = { ...draft, name: draft.name.trim(), description: draft.description.trim() || null, requestId: crypto.randomUUID(), expectedCurrentRevision: source.data?.revisionNumber ?? 0, mapVersionId: draft.mapVersionId, stops }
    setBusy(true); setError(null)
    try {
      const route = routeId ? await versionedRoutesApi.revise(routeId, body) : await versionedRoutesApi.create(body)
      if (routeId) notify({ title: `Đã tạo phiên bản mới cho “${body.name}”`, detail: 'Phiên bản mới là bản nháp; gửi kiểm chứng lại trước khi dùng cho Tour.' })
      else celebrate({ title: `Đã tạo tuyến “${body.name}”`, detail: `${stops.length} POI trên map đã chọn. Tuyến đang là bản nháp: gửi kiểm chứng để kỹ thuật chạy thử trước khi dùng cho Tour.` })
      navigate(`/staff/manage/routes/${route.routeId}`, { replace: true })
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  if ((routeId && source.isPending) || proposals.isPending || maps.isPending) return <AdminPage><p className="p-8">Đang tải dữ liệu…</p></AdminPage>
  if (source.error || proposals.error || maps.error) return <AdminPage><p role="alert" className="p-4 text-sm text-red-700">Không tải được tuyến, POI đã kiểm chứng hoặc map.</p></AdminPage>

  return <AdminPage>
    <Link to="/staff/manage/routes" className="mb-3 inline-flex text-sm text-[#2d719e]">← Danh sách tuyến</Link>
    <PageHeader eyebrow="Tuyến" title={routeId ? 'Tạo phiên bản mới của tuyến' : 'Tạo tuyến'} description="Tuyến gắn với đúng một phiên bản bản đồ và chỉ gồm các POI đã đạt kiểm chứng trên bản đồ đó." />
    <div className="mb-4"><Notice tone="warn">Tuyến lưu xong chưa xếp lịch Tour được: hệ thống chưa có thời lượng nội dung/audio đã duyệt và chức năng xếp lịch còn đang chờ.</Notice></div>
    <form onSubmit={event => void save(event)} className="space-y-4">
      <section className={`${panelClass} grid gap-3 p-4 sm:grid-cols-2`}>
        <label className="text-sm">Tên tuyến<input className={`${inputClass} mt-1`} required maxLength={150} value={draft.name} onChange={e => updateDraft({ name: e.target.value })} /></label>
        <div className="text-sm"><label htmlFor="route-map">Phiên bản bản đồ</label><select id="route-map" className={`${inputClass} mt-1`} required value={draft.mapVersionId} onChange={e => { updateDraft({ mapVersionId: e.target.value }); setStopsOverride([]) }}><option value="">— Chọn bản đồ —</option>{mapOptions.map(item => <option key={item.map.id} value={item.map.id} disabled={mapBlock(item) !== null}>{item.map.areaName} v{item.map.versionNumber} · {item.map.mapKey}{mapBlock(item) ? ` (${mapBlock(item)})` : ''}</option>)}</select>{mapNotReady ? <p role="alert" className="mt-1 text-xs text-[#b23e31]">Bản đồ này không còn kiểm tra kỹ thuật đạt nên không lưu được tuyến. Nhờ Kỹ thuật kiểm tra lại hoặc chọn bản đồ khác.</p> : <p className="mt-1 text-xs text-[#64748b]">Chỉ chọn được bản đồ đạt kiểm tra kỹ thuật và đã có POI đạt kiểm chứng.</p>}</div>
        <label className="text-sm sm:col-span-2">Mô tả<textarea className={`${inputClass} mt-1`} rows={2} maxLength={1000} value={draft.description} onChange={e => updateDraft({ description: e.target.value })} /></label>
        <h2 className="font-semibold sm:col-span-2">Điểm bắt đầu (m, rad)</h2>
        {(['startX', 'startY', 'startYaw'] as const).map(field => <label key={field} className="text-sm">{startFields[field]}<input className={`${inputClass} mt-1`} type="number" step="any" value={draft[field]} onChange={e => updateDraft({ [field]: Number(e.target.value) })} /></label>)}
        <label className="text-sm">Điểm kết thúc<select className={`${inputClass} mt-1`} value={draft.endMode} onChange={e => updateDraft({ endMode: e.target.value as 'LAST_POI' | 'POSE', endX: null, endY: null, endYaw: null })}><option value="LAST_POI">POI cuối</option><option value="POSE">Vị trí riêng</option></select></label>
        {draft.endMode === 'POSE' && (['endX', 'endY', 'endYaw'] as const).map(field => <label key={field} className="text-sm">{endFields[field]}<input className={`${inputClass} mt-1`} type="number" step="any" required value={draft[field] ?? ''} onChange={e => updateDraft({ [field]: Number(e.target.value) })} /></label>)}
      </section>
      <section className={`${panelClass} p-4`}><h2 className="font-semibold">Điểm dừng</h2><p className="mt-1 text-xs text-[#64748b]">Tick POI đã đạt kiểm chứng trên bản đồ này. Robot đi theo thứ tự đánh số, dùng mũi tên để đổi thứ tự.</p>
        {!draft.mapVersionId ? <p className="py-4 text-sm text-[#64748b]">Chọn bản đồ trước.</p> : available.length ? <ol className="mt-3 space-y-2">{orderedPois.map(poi => {
          const index = stops.findIndex(stop => stop.poiRevisionId === poi.revision.id)
          const selected = index >= 0
          return <li key={poi.revision.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3 text-sm ${selected ? 'border-[#bcd7ea] bg-[#f5fafd]' : 'border-[#e2e8f0]'}`}>
            <label className="flex min-w-0 flex-1 basis-56 cursor-pointer items-center gap-3">
              <input type="checkbox" className="size-4 shrink-0 accent-[#2d719e]" checked={selected} onChange={() => toggle(poi)} />
              {selected && <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#173b5f] text-xs font-semibold text-white">{index + 1}</span>}
              <span className="min-w-0 break-words"><span className="font-semibold text-[#0f172a]">{poi.revision.name}</span> <span className="text-xs text-[#64748b]">phiên bản {poi.revision.revisionNumber}</span></span>
              <ToneBadge tone="ok">Đã đạt</ToneBadge>
            </label>
            {selected && <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-[#64748b]">Dừng<span className="w-20 shrink-0"><input aria-label={`Thời gian dừng ${poi.revision.name} (giây)`} className={inputClass} type="number" min={1} max={3600} value={stops[index].dwellSeconds} onChange={e => setStopsOverride(current => (current ?? stops).map(stop => stop.poiRevisionId === poi.revision.id ? { ...stop, dwellSeconds: Number(e.target.value) } : stop))} /></span>giây</label>
              <button type="button" className={moveButton} aria-label={`Đưa ${poi.revision.name} lên`} disabled={index === 0} onClick={() => moveStop(index, -1)}><ChevronUp size={16} aria-hidden="true" /></button>
              <button type="button" className={moveButton} aria-label={`Đưa ${poi.revision.name} xuống`} disabled={index === stops.length - 1} onClick={() => moveStop(index, 1)}><ChevronDown size={16} aria-hidden="true" /></button>
            </div>}
          </li>
        })}</ol> : <p className="py-4 text-sm text-[#64748b]">Chưa có POI đạt kiểm chứng trên bản đồ này.</p>}
      </section>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end"><button disabled={busy || mapNotReady} type="submit" className={buttonClass('primary')}>{busy ? 'Đang lưu…' : 'Lưu bản nháp'}</button></div>
    </form>
  </AdminPage>
}
