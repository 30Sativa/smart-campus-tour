import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, Notice, SkeletonRows } from '../../features/administration/AdminUi'
import { useRoute, useSaveRoute } from '../../features/administration/routes/hooks'
import { routeError } from '../../features/administration/routes/route-messages'
import { RouteStopsEditor, type StopDraft } from '../../features/administration/routes/RouteStopsEditor'
import type { RouteDetails, RouteInput } from '../../features/administration/routes/types'

type RouteDraft = Omit<RouteInput, 'startX' | 'startY' | 'startYaw'> & { startX: number | null; startY: number | null; startYaw: number | null }
const EMPTY: RouteDraft = { name: '', description: null, mapKey: '', mapFrame: '', startX: null, startY: null, startYaw: null, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null, stops: [] }

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
  // Keep the original revision alongside the draft even if the query cache refreshes.
  const [version] = useState(source?.version)
  const [input, setInput] = useState<RouteDraft>(() => source ? { ...source, name: editing ? source.name : `${source.name.slice(0, 140)} (bản sao)` } : EMPTY)
  const [stops, setStops] = useState<StopDraft[]>(() => source?.stops.map(s => ({ ...s, headSteps: s.headSteps.map(h => ({ ...h })) })) ?? [])
  const configurationLocked = editing && !source?.usage.canEditConfiguration
  const allLocked = editing && !source?.usage.canEditMetadataAndAvailability
  const patch = (values: Partial<RouteDraft>) => setInput(current => ({ ...current, ...values }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const configuration: RouteInput = {
      name: input.name, description: input.description, mapKey: input.mapKey, mapFrame: input.mapFrame,
      startX: input.startX!, startY: input.startY!, startYaw: input.startYaw!, endMode: input.endMode,
      endX: input.endX, endY: input.endY, endYaw: input.endYaw,
      stops: stops.map(({ poiId, dwellSeconds, headSteps }) => ({ poiId, dwellSeconds, headSteps })),
    }
    try {
      const id = await save.mutateAsync({ id: editing ? source?.id : undefined, version, input: configuration })
      navigate(`/admin/routes/${id}`)
    } catch { /* Preserve the complete draft; display the backend conflict below. */ }
  }
  return <AdminPage>
    <Link to={source && editing ? `/admin/routes/${source.id}` : '/admin/routes'} className="mb-4 inline-block text-sm text-[#2d719e]">← Quay lại</Link>
    <PageHeader eyebrow="Tuyến" title={editing ? 'Chỉnh sửa tuyến' : source ? 'Sao chép tuyến' : 'Tạo tuyến'} description="Chọn POI và cấu hình thứ tự. Tuyến mới được lưu ở trạng thái không khả dụng." />
    {configurationLocked && <div className="mb-4"><Notice tone="info">Hành trình đã được tham chiếu nên bị khóa. Có thể sửa tên và mô tả khi không có Tour đã chốt hoặc đang chạy.</Notice></div>}
    {allLocked && <div className="mb-4"><Notice tone="warn">Tour đã chốt hoặc đang chạy đang sử dụng tuyến này. Mọi thay đổi bị khóa.</Notice></div>}
    <form onSubmit={event => void submit(event)} className="space-y-5">
      <fieldset disabled={save.isPending || allLocked} className={`${panelClass} space-y-4 p-5`}>
        <legend className="sr-only">Thông tin tuyến</legend>
        <label className="block text-sm">Tên tuyến<input required maxLength={150} className={inputClass} value={input.name} onChange={e => patch({ name: e.target.value })} /></label>
        <label className="block text-sm">Mô tả<textarea maxLength={1000} rows={3} className={inputClass} value={input.description ?? ''} onChange={e => patch({ description: e.target.value || null })} /></label>
      </fieldset>
      <fieldset disabled={save.isPending || configurationLocked || allLocked} className={`${panelClass} space-y-5 p-5`}>
        <legend className="sr-only">Cấu hình hành trình</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">MapKey<input required maxLength={100} className={inputClass} value={input.mapKey} onChange={e => patch({ mapKey: e.target.value })} /></label>
          <label className="text-sm">MapFrame<input required maxLength={100} className={inputClass} value={input.mapFrame} onChange={e => patch({ mapFrame: e.target.value })} /></label>
        </div>
        <div><h2 className="mb-3 text-[15px] font-semibold">Điểm bắt đầu</h2><p className="mb-3 text-sm text-[#64748b]">Nhập pose đã khảo sát hoặc lấy từ một POI qua nút Dùng làm Start. Các giá trị ban đầu cần được bạn kiểm tra.</p><div className="grid gap-3 sm:grid-cols-3">{(['startX', 'startY', 'startYaw'] as const).map((field, i) => <PoseField key={field} label={`Start ${['x (m)', 'y (m)', 'yaw (rad)'][i]}`} value={input[field]} yaw={i === 2} onChange={value => patch({ [field]: value })} />)}</div></div>
        <label className="block text-sm">Cách kết thúc<select className={inputClass} value={input.endMode} onChange={e => patch(e.target.value === 'LAST_POI' ? { endMode: 'LAST_POI', endX: null, endY: null, endYaw: null } : { endMode: 'POSE' })}><option value="LAST_POI">Kết thúc tại POI cuối</option><option value="POSE">Đi tới pose kết thúc riêng</option></select></label>
        {input.endMode === 'POSE' && <div className="grid gap-3 sm:grid-cols-3">{(['endX', 'endY', 'endYaw'] as const).map((field, i) => <PoseField key={field} label={`End ${['x (m)', 'y (m)', 'yaw (rad)'][i]}`} value={input[field]} yaw={i === 2} onChange={value => patch({ [field]: value })} />)}</div>}
        <RouteStopsEditor stops={stops} mapKey={input.mapKey} mapFrame={input.mapFrame} onChange={setStops} onUseStart={poi => patch({ mapKey: poi.mapKey, mapFrame: poi.mapFrame, startX: poi.x, startY: poi.y, startYaw: poi.yaw })} />
      </fieldset>
      <Notice tone="warn">Lưu tuyến chỉ kiểm tra dữ liệu. Map, vị trí và các chặng di chuyển cần được đội kỹ thuật kiểm chứng bằng robot thực tế.</Notice>
      {save.isError && <Notice tone="danger">{routeError(save.error)}</Notice>}
      <div className="flex gap-3"><button type="submit" disabled={save.isPending || allLocked || stops.length === 0} className={buttonClass('primary')}>{save.isPending ? 'Đang lưu…' : 'Lưu tuyến'}</button><Link to={editing && source ? `/admin/routes/${source.id}` : '/admin/routes'} className={buttonClass('secondary')}>Hủy</Link></div>
    </form>
  </AdminPage>
}

function PoseField({ label, value, yaw, onChange }: { label: string; value: number | null; yaw: boolean; onChange: (value: number | null) => void }) {
  return <label className="text-sm">{label}<input required type="number" className={inputClass} step={yaw ? '0.000001' : '0.0001'} min={yaw ? -3.141593 : -999999.9999} max={yaw ? 3.141593 : 999999.9999} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} /></label>
}
