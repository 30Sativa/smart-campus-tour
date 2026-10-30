import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { AdminPage, Notice } from '../../../features/administration/AdminUi'
import { celebrate, notify } from '../../../components/ui/toast-store'
import { technicalApi, type PoiProposal } from '../../../features/technical/api/technical'
import { usePoiProposals } from '../../../features/technical/technical-hooks'
import { versionedRoutesApi, type VersionedRouteDraft } from '../../../features/administration/routes/versioned-api'

type StopDraft = { poiRevisionId: string; dwellSeconds: number; headSteps: Array<{ preset: 'FRONT' | 'LEFT' | 'RIGHT'; holdSeconds: number }> }
type Draft = { name: string; description: string; mapVersionId: string; startX: number; startY: number; startYaw: number; endMode: 'LAST_POI' | 'POSE'; endX: number | null; endY: number | null; endYaw: number | null }
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
  const toggle = (proposal: PoiProposal) => setStopsOverride(current => (current ?? stops).some(stop => stop.poiRevisionId === proposal.revision.id)
    ? (current ?? stops).filter(stop => stop.poiRevisionId !== proposal.revision.id)
    : [...(current ?? stops), { poiRevisionId: proposal.revision.id, dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 10 }] }])
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.name.trim() || !draft.mapVersionId || stops.length === 0) { setError('Nhập tên, chọn map version và ít nhất một POI đã PASS cho đúng map.'); return }
    const body: VersionedRouteDraft = { ...draft, name: draft.name.trim(), description: draft.description.trim() || null, requestId: crypto.randomUUID(), expectedCurrentRevision: source.data?.revisionNumber ?? 0, mapVersionId: draft.mapVersionId, stops }
    setBusy(true); setError(null)
    try {
      const route = routeId ? await versionedRoutesApi.revise(routeId, body) : await versionedRoutesApi.create(body)
      if (routeId) notify({ title: `Đã tạo revision mới cho “${body.name}”`, detail: 'Revision mới là bản nháp; gửi kiểm chứng lại trước khi dùng cho Tour.' })
      else celebrate({ title: `Đã tạo tuyến “${body.name}”`, detail: `${stops.length} POI trên map đã chọn. Tuyến đang là bản nháp: gửi kiểm chứng để kỹ thuật chạy thử trước khi dùng cho Tour.` })
      navigate(`/staff/manage/routes/${route.routeId}`, { replace: true })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được revision tuyến.') }
    finally { setBusy(false) }
  }
  if ((routeId && source.isPending) || proposals.isPending || maps.isPending) return <AdminPage><p className="p-8">Đang tải dữ liệu versioned…</p></AdminPage>
  if (source.error || proposals.error || maps.error) return <AdminPage><p role="alert" className="p-4 text-sm text-red-700">Không tải được tuyến, POI đã kiểm chứng hoặc map.</p></AdminPage>

  return <AdminPage>
    <Link to="/staff/manage/routes" className="mb-3 inline-flex text-sm text-[#2d719e]">← Danh sách tuyến versioned</Link>
    <PageHeader eyebrow="Tour Staff · Route revisions" title={routeId ? 'Tạo revision tuyến' : 'Tạo tuyến'} description="Mỗi tuyến tham chiếu chính xác map version và các POI revision có kết quả PASS cho map đó." />
    <div className="mb-4"><Notice tone="warn">Route revision và test-run chưa làm tuyến đủ điều kiện lập lịch: duration nguồn nội dung/audio, scheduling và READY còn pending. Không dùng measured duration làm cấu hình.</Notice></div>
    <form onSubmit={event => void save(event)} className="space-y-4">
      <section className={`${panelClass} grid gap-3 p-4 sm:grid-cols-2`}>
        <label className="text-sm">Tên tuyến<input className={`${inputClass} mt-1`} required maxLength={150} value={draft.name} onChange={e => updateDraft({ name: e.target.value })} /></label>
        <label className="text-sm">Map version<select className={`${inputClass} mt-1`} required value={draft.mapVersionId} onChange={e => { updateDraft({ mapVersionId: e.target.value }); setStopsOverride([]) }}><option value="">— Chọn map —</option>{maps.data?.map(({ map }) => <option key={map.id} value={map.id}>{map.mapKey} · v{map.versionNumber}</option>)}</select></label>
        <label className="text-sm sm:col-span-2">Mô tả<textarea className={`${inputClass} mt-1`} rows={2} maxLength={1000} value={draft.description} onChange={e => updateDraft({ description: e.target.value })} /></label>
        <h2 className="font-semibold sm:col-span-2">Điểm bắt đầu (m, rad)</h2>
        {(['startX', 'startY', 'startYaw'] as const).map(field => <label key={field} className="text-sm">{field}<input className={`${inputClass} mt-1`} type="number" step="any" value={draft[field]} onChange={e => updateDraft({ [field]: Number(e.target.value) })} /></label>)}
        <label className="text-sm">Điểm kết thúc<select className={`${inputClass} mt-1`} value={draft.endMode} onChange={e => updateDraft({ endMode: e.target.value as 'LAST_POI' | 'POSE', endX: null, endY: null, endYaw: null })}><option value="LAST_POI">POI cuối</option><option value="POSE">Pose riêng</option></select></label>
        {draft.endMode === 'POSE' && (['endX', 'endY', 'endYaw'] as const).map(field => <label key={field} className="text-sm">{field}<input className={`${inputClass} mt-1`} type="number" step="any" required value={draft[field] ?? ''} onChange={e => updateDraft({ [field]: Number(e.target.value) })} /></label>)}
      </section>
      <section className={`${panelClass} p-4`}><h2 className="font-semibold">POI đã kiểm chứng trên map này</h2><p className="mt-1 text-xs text-[#64748b]">Chỉ chọn đúng PoiRevisionId có effective PASS và cùng MapVersionId. Không truyền POI catalog ID.</p>
        {!draft.mapVersionId ? <p className="py-4 text-sm text-[#64748b]">Chọn map version trước.</p> : available.length ? <div className="mt-3 space-y-2">{available.map(poi => <label key={poi.revision.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" checked={stops.some(stop => stop.poiRevisionId === poi.revision.id)} onChange={() => toggle(poi)} /><span className="min-w-0 flex-1"><b>{poi.revision.name}</b> · r{poi.revision.revisionNumber}<span className="ml-2 text-xs text-emerald-700">PASS</span></span>{stops.some(stop => stop.poiRevisionId === poi.revision.id) && <input aria-label={`Dwell ${poi.revision.name}`} className={`${inputClass} w-24`} type="number" min={1} max={3600} value={stops.find(stop => stop.poiRevisionId === poi.revision.id)?.dwellSeconds ?? 30} onChange={e => setStopsOverride(current => (current ?? stops).map(stop => stop.poiRevisionId === poi.revision.id ? { ...stop, dwellSeconds: Number(e.target.value) } : stop))} />}</label>)}</div> : <p className="py-4 text-sm text-[#64748b]">Chưa có POI revision PASS cho map này. Cần hoàn tất kiểm chứng trước.</p>}
      </section>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end"><button disabled={busy} type="submit" className={buttonClass('primary')}>{busy ? 'Đang lưu…' : 'Lưu revision nháp'}</button></div>
    </form>
  </AdminPage>
}
