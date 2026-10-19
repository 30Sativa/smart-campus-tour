import { useState } from 'react'
import { Pagination, SearchField } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { AdminErrorPanel } from '../AdminUi'
import { usePois } from '../pois/hooks'
import { useDebouncedValue } from '../use-debounced-value'
import type { PoiListItem } from '../pois/types'
import type { HeadStep, RouteStopInput } from './types'

export type StopDraft = RouteStopInput & { poiName: string }
const PRESETS: { value: HeadStep['preset']; label: string }[] = [{ value: 'FRONT', label: 'Nhìn trước' }, { value: 'LEFT', label: 'Nhìn trái' }, { value: 'RIGHT', label: 'Nhìn phải' }]

export function RouteStopsEditor({ stops, mapKey, mapFrame, onChange, onUseStart }: {
  stops: StopDraft[]; mapKey: string; mapFrame: string
  onChange: (stops: StopDraft[]) => void; onUseStart: (poi: PoiListItem) => void
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const term = useDebouncedValue(search, 300)
  const pois = usePois({ search: term, page, size: 10, sort: 'name' })
  const changeStop = (index: number, patch: Partial<StopDraft>) => onChange(stops.map((s, i) => i === index ? { ...s, ...patch } : s))
  const move = (index: number, offset: number) => {
    const next = [...stops]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    onChange(next)
  }
  return <div className="space-y-5">
    <div><h2 className="text-[15px] font-semibold">Thứ tự điểm dừng</h2><p className="mt-1 text-sm text-[#64748b]">Dwell cố định theo tuyến. Thời gian giữ các góc nhìn cộng lại không vượt dwell.</p></div>
    {stops.length === 0 && <p className="text-sm text-[#64748b]">Chọn POI bên dưới để bắt đầu.</p>}
    <ol className="divide-y divide-[#e2e8f0]">{stops.map((stop, index) => <li key={stop.poiId} className="space-y-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{index + 1}. {stop.poiName}</h3><div className="flex gap-1">
        <button type="button" className={buttonClass('ghost', 'sm')} aria-label={`Đưa ${stop.poiName} lên`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
        <button type="button" className={buttonClass('ghost', 'sm')} aria-label={`Đưa ${stop.poiName} xuống`} disabled={index === stops.length - 1} onClick={() => move(index, 1)}>↓</button>
        <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => onChange(stops.filter((_, i) => i !== index))}>Bỏ {stop.poiName}</button>
      </div></div>
      <label className="block max-w-52 text-sm">Thời gian dừng {index + 1} (giây)<input type="number" min={1} max={2147483647} required className={inputClass} value={stop.dwellSeconds || ''} onChange={e => changeStop(index, { dwellSeconds: Number(e.target.value) })} /></label>
      <div className="space-y-2">{stop.headSteps.map((step, stepIndex) => <div key={stepIndex} className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Góc nhìn {index + 1}.{stepIndex + 1}<select className={inputClass} value={step.preset} onChange={e => changeStop(index, { headSteps: stop.headSteps.map((s, i) => i === stepIndex ? { ...s, preset: e.target.value as HeadStep['preset'] } : s) })}>{PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
        <label className="max-w-40 text-sm">Giữ {index + 1}.{stepIndex + 1} (giây)<input required type="number" min={1} max={2147483647} className={inputClass} value={step.holdSeconds || ''} onChange={e => changeStop(index, { headSteps: stop.headSteps.map((s, i) => i === stepIndex ? { ...s, holdSeconds: Number(e.target.value) } : s) })} /></label>
        <button type="button" className={buttonClass('ghost', 'sm')} aria-label={`Bỏ góc nhìn ${index + 1}.${stepIndex + 1}`} onClick={() => changeStop(index, { headSteps: stop.headSteps.filter((_, i) => i !== stepIndex) })}>Bỏ góc</button>
      </div>)}</div>
      <button type="button" className={buttonClass('secondary', 'sm')} disabled={stop.headSteps.length >= 100} onClick={() => changeStop(index, { headSteps: [...stop.headSteps, { preset: 'FRONT', holdSeconds: 1 }] })}>Thêm góc nhìn</button>
    </li>)}</ol>
    <div className="border-t border-[#e2e8f0] pt-4">
      <h2 className="mb-3 text-[15px] font-semibold">Thêm POI hiện có</h2>
      <p className="mb-3 text-sm text-[#64748b]">Sau khi lưu tuyến, map và pose của POI được tham chiếu sẽ bị khóa theo quy tắc POI Management. Với waypoint đang thử, cần bỏ các tham chiếu còn sửa được hoặc tạo POI mới trước khi hiệu chỉnh pose.</p>
      <SearchField value={search} onChange={v => { setSearch(v); setPage(1) }} label="Tìm POI cho tuyến" placeholder="Tên hoặc mô tả POI" />
      {pois.isError ? <AdminErrorPanel title="Không thể tải POI." onRetry={() => void pois.refetch()} /> : pois.isPending ? <p className="py-4 text-sm" role="status">Đang tải POI…</p> : <>
        {pois.data?.data.length === 0 && <p className="py-4 text-sm">Không có POI phù hợp.</p>}
        <ul className="divide-y divide-[#e2e8f0]">{pois.data?.data.map(poi => {
          const mismatched = Boolean(mapKey && (poi.mapKey !== mapKey || poi.mapFrame !== mapFrame))
          const selected = stops.some(s => s.poiId === poi.id)
          return <li key={poi.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{poi.name}</p><p className="text-xs text-[#64748b]">{poi.mapKey} / {poi.mapFrame} · {poi.isActive ? 'Khả dụng' : 'Chưa khả dụng'}{mismatched && ' · Khác map/frame'}</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass('ghost', 'sm')} onClick={() => onUseStart(poi)}>Dùng làm Start: {poi.name}</button>
              <button type="button" className={buttonClass('secondary', 'sm')} disabled={mismatched || selected || stops.length >= 100} onClick={() => onChange([...stops, { poiId: poi.id, poiName: poi.name, dwellSeconds: 0, headSteps: [{ preset: 'FRONT', holdSeconds: 0 }] }])}>{selected ? 'Đã chọn' : `Thêm ${poi.name}`}</button></div>
          </li>
        })}</ul>
        {pois.data && <Pagination page={page} pageCount={Math.max(1, pois.data.pagination.totalPages)} total={pois.data.pagination.totalItems} pageSize={10} onPage={setPage} label="POI" />}
      </>}
    </div>
  </div>
}
