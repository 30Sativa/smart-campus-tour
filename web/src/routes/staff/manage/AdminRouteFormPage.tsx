import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Check } from 'lucide-react'
import { PageHeader, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, Notice, SkeletonRows } from '../../../features/administration/AdminUi'
import { usePois } from '../../../features/administration/pois/hooks'
import type { PoiListItem } from '../../../features/administration/pois/types'
import { useRoute, useSaveRoute } from '../../../features/administration/routes/hooks'
import { routeError, stopIssue } from '../../../features/administration/routes/route-messages'
import { RouteStopsEditor, type StopDraft } from '../../../features/administration/routes/RouteStopsEditor'
import type { RouteDetails, RouteInput } from '../../../features/administration/routes/types'
import { notify } from '../../../components/ui/toast-store'

type RouteDraft = Omit<RouteInput, 'startX' | 'startY' | 'startYaw'> & { startX: number | null; startY: number | null; startYaw: number | null }
const EMPTY: RouteDraft = { name: '', description: null, mapKey: '', mapFrame: '', startX: null, startY: null, startYaw: null, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null, stops: [] }
const STEPS = ['Thông tin & map', 'Điểm dừng', 'Bắt đầu & kết thúc', 'Xem lại & lưu'] as const
const STEP_HINTS = ['Nhập tên tuyến và chọn map.', 'Chọn ít nhất một POI và sửa các lỗi thời gian.', 'Nhập đủ pose bắt đầu (và pose kết thúc nếu có).', '']
// The POI API pages at most 100 rows; one page covers a campus catalog and keeps map/search filtering client-side.
const POI_PAGE_SIZE = 100

const mapId = (mapKey: string, mapFrame: string) => JSON.stringify([mapKey, mapFrame])
const coordOk = (v: number | null) => v != null && Number.isFinite(v) && Math.abs(v) <= 999999.9999
const yawOk = (v: number | null) => v != null && Number.isFinite(v) && Math.abs(v) <= 3.141593

export default function AdminRouteFormPage() {
  const { routeId } = useParams()
  const [params] = useSearchParams()
  const copyFrom = routeId ? undefined : params.get('copyFrom') ?? undefined
  const source = useRoute(routeId ?? copyFrom)
  if ((routeId || copyFrom) && source.isError) return <AdminPage><AdminErrorPanel title={routeError(source.error)} onRetry={() => void source.refetch()} /></AdminPage>
  if ((routeId || copyFrom) && !source.data) return <AdminPage><SkeletonRows rows={6} /></AdminPage>
  return <RouteForm key={routeId ?? copyFrom ?? 'new'} source={source.data} editing={Boolean(routeId)} />
}

function RouteForm({ source, editing }: { source?: RouteDetails; editing: boolean }) {
  const navigate = useNavigate()
  const save = useSaveRoute()
  const pois = usePois({ page: 1, size: POI_PAGE_SIZE, sort: 'name' })
  // Keep the original revision alongside the draft even if the query cache refreshes.
  const [version] = useState(source?.version)
  const [input, setInput] = useState<RouteDraft>(() => source ? { ...source, name: editing ? source.name : `${source.name.slice(0, 140)} (bản sao)` } : EMPTY)
  const [stops, setStops] = useState<StopDraft[]>(() => source?.stops.map(s => ({ ...s, headSteps: s.headSteps.map(h => ({ ...h })) })) ?? [])
  const [step, setStep] = useState(0)
  const [mapNotice, setMapNotice] = useState('')
  const [startPoiId, setStartPoiId] = useState('')
  const configurationLocked = editing && !source?.usage.canEditConfiguration
  const allLocked = editing && !source?.usage.canEditMetadataAndAvailability
  const patch = (values: Partial<RouteDraft>) => setInput(current => ({ ...current, ...values }))
  const backHref = editing && source ? `/staff/manage/routes/${source.id}` : '/staff/manage/routes'

  const allPois = pois.data?.data ?? []
  const mapPois = allPois.filter(p => p.mapKey === input.mapKey && p.mapFrame === input.mapFrame)
  const maps = new Map<string, { mapKey: string; mapFrame: string; count: number }>()
  if (input.mapKey) maps.set(mapId(input.mapKey, input.mapFrame), { mapKey: input.mapKey, mapFrame: input.mapFrame, count: 0 })
  for (const p of allPois) {
    const id = mapId(p.mapKey, p.mapFrame)
    const entry = maps.get(id) ?? { mapKey: p.mapKey, mapFrame: p.mapFrame, count: 0 }
    maps.set(id, { ...entry, count: entry.count + 1 })
  }

  const valid = [
    input.name.trim() !== '' && input.mapKey !== '' && input.mapFrame !== '',
    stops.length > 0 && stops.every(s => stopIssue(s) === null),
    coordOk(input.startX) && coordOk(input.startY) && yawOk(input.startYaw)
      && (input.endMode === 'LAST_POI' || (coordOk(input.endX) && coordOk(input.endY) && yawOk(input.endYaw))),
    true,
  ]
  // A locked itinerary is shown read-only, so only the editable first step gates navigation.
  const passable = (i: number) => valid[i] || (configurationLocked && i > 0)
  const reachable = (target: number) => STEPS.slice(0, target).every((_, i) => passable(i))
  const stepSummary = [
    input.mapKey ? `${input.mapKey} / ${input.mapFrame}` : 'Chưa chọn map',
    stops.length ? `${stops.length} điểm dừng` : 'Chưa chọn POI',
    valid[2] ? 'Đã có pose' : 'Chưa đủ pose',
    'Kiểm tra trước khi lưu',
  ]

  const chooseMap = (id: string) => {
    if (id === mapId(input.mapKey, input.mapFrame)) return
    const [mapKey, mapFrame] = id ? JSON.parse(id) as [string, string] : ['', '']
    const hadData = stops.length > 0 || input.startX != null || input.endX != null
    setMapNotice(hadData ? `Đã đổi map: ${stops.length} điểm dừng và pose bắt đầu/kết thúc của map cũ đã được xóa.` : '')
    setStops([])
    setStartPoiId('')
    patch({ mapKey, mapFrame, startX: null, startY: null, startYaw: null, endX: null, endY: null, endYaw: null })
  }
  const applyStartPoi = (poi: PoiListItem | undefined) => {
    setStartPoiId(poi?.id ?? '')
    if (poi) patch({ startX: poi.x, startY: poi.y, startYaw: poi.yaw })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (step < STEPS.length - 1) { if (passable(step)) setStep(step + 1); return }
    const configuration: RouteInput = {
      name: input.name, description: input.description, mapKey: input.mapKey, mapFrame: input.mapFrame,
      startX: input.startX!, startY: input.startY!, startYaw: input.startYaw!, endMode: input.endMode,
      endX: input.endX, endY: input.endY, endYaw: input.endYaw,
      stops: stops.map(({ poiId, dwellSeconds, headSteps }) => ({ poiId, dwellSeconds, headSteps })),
    }
    try {
      const id = await save.mutateAsync({ id: editing ? source?.id : undefined, version, input: configuration })
      notify({ title: `Đã lưu tuyến “${configuration.name}”`, detail: `${configuration.stops.length} điểm dừng. Nhân viên kỹ thuật cần xác nhận version này trước khi tạo Tour.` })
      navigate(`/staff/manage/routes/${id}`)
    } catch { /* Preserve the complete draft; display the backend conflict below. */ }
  }

  const poiError = pois.isError && <AdminErrorPanel title="Không thể tải POI." onRetry={() => void pois.refetch()} />
  const poiLoading = pois.isPending && <p className="py-4 text-sm" role="status">Đang tải POI…</p>
  const truncated = (pois.data?.pagination.totalItems ?? 0) > POI_PAGE_SIZE
    && <Notice tone="warn">Danh mục có hơn {POI_PAGE_SIZE} POI; chỉ {POI_PAGE_SIZE} POI đầu theo tên được hiển thị.</Notice>

  return <AdminPage>
    <Link to={backHref} className="mb-4 inline-block text-sm text-[#2d719e]">← Quay lại</Link>
    <PageHeader eyebrow="Tuyến" title={editing ? 'Chỉnh sửa tuyến' : source ? 'Sao chép tuyến' : 'Tạo tuyến'} description="Chọn POI và cấu hình thứ tự. Tuyến mới được lưu ở trạng thái không khả dụng." />
    {configurationLocked && <div className="mb-4"><Notice tone="info">Hành trình đã được tham chiếu nên bị khóa. Có thể sửa tên và mô tả khi không có Tour đã chốt hoặc đang chạy.</Notice></div>}
    {allLocked && <div className="mb-4"><Notice tone="warn">Tour đã chốt hoặc đang chạy đang sử dụng tuyến này. Mọi thay đổi bị khóa.</Notice></div>}

    <ol className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Các bước tạo tuyến">{STEPS.map((label, i) => {
      const state = i === step ? 'active' : i < step ? 'done' : 'todo'
      return <li key={label}><button type="button" disabled={i !== step && !reachable(i)} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}
        className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed ${state === 'active' ? 'border-[#2d719e] bg-white' : state === 'done' ? 'border-[#e2e8f0] bg-white hover:border-[#a8cde6]' : 'border-dashed border-[#cbd5e1] hover:border-[#a8cde6] disabled:hover:border-[#cbd5e1]'}`}>
        <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${state === 'active' ? 'bg-[#2d719e] text-white' : state === 'done' ? 'bg-[#edf8f1] text-[#236344]' : 'bg-[#f1f5f9] text-[#64748b]'}`}>{state === 'done' ? <Check size={14} aria-hidden="true" /> : i + 1}</span>
        <span className="min-w-0"><span className={`block text-sm font-semibold ${state === 'todo' ? 'text-[#64748b]' : 'text-[#173b59]'}`}>{label}</span><span className="block truncate text-xs text-[#64748b]">{stepSummary[i]}</span></span>
      </button></li>
    })}</ol>

    <form onSubmit={event => void submit(event)} className="space-y-5">
      {step === 0 && <fieldset disabled={save.isPending || allLocked} className={`${panelClass} space-y-4 p-5`}>
        <legend className="sr-only">Thông tin tuyến và map</legend>
        <label className="block text-sm">Tên tuyến<input required maxLength={150} className={inputClass} value={input.name} onChange={e => patch({ name: e.target.value })} /></label>
        <label className="block text-sm">Mô tả<textarea maxLength={1000} rows={3} className={inputClass} value={input.description ?? ''} onChange={e => patch({ description: e.target.value || null })} /></label>
        {poiError || poiLoading || <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Map<select aria-label="Map" required disabled={configurationLocked} className={inputClass} value={input.mapKey ? mapId(input.mapKey, input.mapFrame) : ''} onChange={e => chooseMap(e.target.value)}>
            <option value="">— Chọn map —</option>
            {[...maps].map(([id, m]) => <option key={id} value={id}>{m.mapKey} / {m.mapFrame} · {m.count} POI</option>)}
          </select></label>
          <label className="text-sm">MapFrame<input readOnly className={inputClass} value={input.mapFrame} placeholder="Tự điền theo map" /></label>
        </div>}
        {mapNotice && <Notice tone="warn">{mapNotice}</Notice>}
        {truncated}
      </fieldset>}

      {step === 1 && <fieldset disabled={save.isPending || configurationLocked || allLocked} className={`${panelClass} space-y-4 p-5`}>
        <legend className="sr-only">Điểm dừng</legend>
        <div><h2 className="text-[15px] font-semibold">Chọn điểm dừng trên {input.mapKey} / {input.mapFrame}</h2><p className="mt-1 text-sm text-[#64748b]">Dwell cố định theo tuyến. Thời gian giữ các góc nhìn cộng lại không vượt dwell.</p></div>
        {poiError || poiLoading || <RouteStopsEditor stops={stops} pois={mapPois} onChange={setStops} />}
        {truncated}
      </fieldset>}

      {step === 2 && <fieldset disabled={save.isPending || configurationLocked || allLocked} className={`${panelClass} space-y-5 p-5`}>
        <legend className="sr-only">Điểm bắt đầu và kết thúc</legend>
        <div className="space-y-3">
          <h2 className="text-[15px] font-semibold">Điểm bắt đầu</h2>
          <label className="block max-w-md text-sm">Lấy pose từ POI<select aria-label="Lấy pose từ POI" className={inputClass} value={startPoiId} onChange={e => applyStartPoi(mapPois.find(p => p.id === e.target.value))}>
            <option value="">— Nhập tay hoặc chọn POI —</option>
            {mapPois.map(p => <option key={p.id} value={p.id}>{p.name}{stops.some(s => s.poiId === p.id) ? ' (trong tuyến)' : ''}</option>)}
          </select></label>
          <p className="text-sm text-[#64748b]">Giá trị lấy từ POI vẫn sửa được; hãy kiểm tra với pose đã khảo sát.</p>
          <div className="grid gap-3 sm:grid-cols-3">{(['startX', 'startY', 'startYaw'] as const).map((field, i) => <PoseField key={field} label={`Start ${['x (m)', 'y (m)', 'yaw (rad)'][i]}`} value={input[field]} yaw={i === 2} onChange={value => { setStartPoiId(''); patch({ [field]: value }) }} />)}</div>
        </div>
        <label className="block max-w-md text-sm">Cách kết thúc<select aria-label="Cách kết thúc" className={inputClass} value={input.endMode} onChange={e => patch(e.target.value === 'LAST_POI' ? { endMode: 'LAST_POI', endX: null, endY: null, endYaw: null } : { endMode: 'POSE' })}><option value="LAST_POI">Kết thúc tại POI cuối</option><option value="POSE">Đi tới pose kết thúc riêng</option></select></label>
        {input.endMode === 'POSE' && <div className="grid gap-3 sm:grid-cols-3">{(['endX', 'endY', 'endYaw'] as const).map((field, i) => <PoseField key={field} label={`End ${['x (m)', 'y (m)', 'yaw (rad)'][i]}`} value={input[field]} yaw={i === 2} onChange={value => patch({ [field]: value })} />)}</div>}
      </fieldset>}

      {step === 3 && <section className={`${panelClass} space-y-5 p-5`} aria-label="Xem lại tuyến">
        <h2 className="text-[15px] font-semibold">Xem lại trước khi lưu</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Summary label="Tên tuyến" value={input.name} />
          <Summary label="Map / Frame" value={`${input.mapKey} / ${input.mapFrame}`} />
          <Summary label="Bắt đầu" value={`x ${input.startX}, y ${input.startY}, yaw ${input.startYaw}`} />
          <Summary label="Kết thúc" value={input.endMode === 'LAST_POI' ? 'Tại POI cuối' : `x ${input.endX}, y ${input.endY}, yaw ${input.endYaw}`} />
        </dl>
        <div>
          <p className="mb-2 text-sm font-semibold">{stops.length} điểm dừng · tổng dwell {stops.reduce((t, s) => t + s.dwellSeconds, 0)}s</p>
          <ol className="flex flex-wrap gap-2">{stops.map((s, i) => <li key={s.poiId} className="rounded-full border border-[#e2e8f0] bg-white px-3 py-1 text-[13px]">{i + 1}. {s.poiName} · {s.dwellSeconds}s</li>)}</ol>
        </div>
        <Notice tone="warn">Sau khi lưu tuyến, map và pose của POI được tham chiếu sẽ bị khóa theo quy tắc POI Management. Với waypoint đang thử, cần bỏ các tham chiếu còn sửa được hoặc tạo POI mới trước khi hiệu chỉnh pose.</Notice>
        <Notice tone="warn">Lưu tuyến chỉ kiểm tra dữ liệu. Map, vị trí và các chặng di chuyển cần được đội kỹ thuật kiểm chứng bằng robot thực tế.</Notice>
      </section>}

      {save.isError && <Notice tone="danger">{routeError(save.error)}</Notice>}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-[#e2e8f0] bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Link to={backHref} className={buttonClass('secondary')}>Hủy</Link>
        <span className="min-w-40 flex-1 text-right text-[13px] text-[#64748b]">{!passable(step) && STEP_HINTS[step]}</span>
        {step > 0 && <button type="button" className={buttonClass('secondary')} onClick={() => setStep(step - 1)}>← Quay lại</button>}
        {step < STEPS.length - 1
          ? <button type="button" className={buttonClass('primary')} disabled={!passable(step)} onClick={() => setStep(step + 1)}>Tiếp →</button>
          : <button type="submit" disabled={save.isPending || allLocked || stops.length === 0} className={buttonClass('primary')}>{save.isPending ? 'Đang lưu…' : 'Lưu tuyến'}</button>}
      </div>
    </form>
  </AdminPage>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#f8fafc] px-3 py-2.5"><dt className="text-xs text-[#64748b]">{label}</dt><dd className="mt-0.5 text-sm font-semibold break-words">{value}</dd></div>
}

function PoseField({ label, value, yaw, onChange }: { label: string; value: number | null; yaw: boolean; onChange: (value: number | null) => void }) {
  return <label className="text-sm">{label}<input required type="number" className={inputClass} step={yaw ? '0.000001' : '0.0001'} min={yaw ? -3.141593 : -999999.9999} max={yaw ? 3.141593 : 999999.9999} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} /></label>
}
