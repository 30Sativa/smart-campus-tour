import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { SearchField } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import type { PoiListItem } from '../pois/types'
import { stopIssue } from './route-messages'
import type { HeadStep, RouteStopInput } from './types'

export type StopDraft = RouteStopInput & { poiName: string }
export const MAX_STOPS = 100
const PRESETS: { value: HeadStep['preset']; label: string }[] = [{ value: 'FRONT', label: 'Nhìn trước' }, { value: 'LEFT', label: 'Nhìn trái' }, { value: 'RIGHT', label: 'Nhìn phải' }]
const iconButton = 'grid size-9 shrink-0 place-items-center rounded-lg text-[#2d78a9] hover:bg-[#e9f5ff] disabled:text-[#c3d0db] disabled:hover:bg-transparent'

/** Picker for the POIs of one map (left) and the ordered stop list (right). */
export function RouteStopsEditor({ stops, pois, onChange }: { stops: StopDraft[]; pois: PoiListItem[]; onChange: (stops: StopDraft[]) => void }) {
  const [search, setSearch] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)
  const term = search.trim().toLowerCase()
  const shown = pois.filter(p => (!onlyActive || p.isActive) && (!term || p.name.toLowerCase().includes(term)))
  const selected = new Set(stops.map(s => s.poiId))
  const totalDwell = stops.reduce((sum, s) => sum + (s.dwellSeconds > 0 ? s.dwellSeconds : 0), 0)
  const toggle = (poi: PoiListItem) => onChange(selected.has(poi.id)
    ? stops.filter(s => s.poiId !== poi.id)
    : [...stops, { poiId: poi.id, poiName: poi.name, dwellSeconds: 0, headSteps: [{ preset: 'FRONT', holdSeconds: 0 }] }])
  const changeStop = (index: number, patch: Partial<StopDraft>) => onChange(stops.map((s, i) => i === index ? { ...s, ...patch } : s))
  const changeStep = (index: number, stepIndex: number, patch: Partial<HeadStep>) =>
    changeStop(index, { headSteps: stops[index].headSteps.map((h, i) => i === stepIndex ? { ...h, ...patch } : h) })
  const move = (index: number, offset: number) => {
    const next = [...stops]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    onChange(next)
  }

  return <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
    <section aria-label="POI trên map" className="overflow-hidden rounded-xl border border-[#e2e8f0]">
      <div className="space-y-3 border-b border-[#e2e8f0] bg-[#f8fafc] p-3">
        <SearchField value={search} onChange={setSearch} label="Tìm POI cho tuyến" placeholder="Tên POI" />
        <div className="flex items-center justify-between gap-2 text-xs text-[#64748b]">
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[#2d719e]" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} />Chỉ POI khả dụng</label>
          <span>{shown.length} / {pois.length} POI</span>
        </div>
      </div>
      {shown.length === 0 ? <p className="p-6 text-center text-sm text-[#64748b]">Không có POI phù hợp.</p> :
        <ul className="max-h-96 divide-y divide-[#eef2f6] overflow-y-auto">{shown.map(poi => {
          const checked = selected.has(poi.id)
          return <li key={poi.id}><label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-[#f8fafc]">
            <input type="checkbox" aria-label={`Chọn ${poi.name}`} className="size-4 shrink-0 accent-[#2d719e]" checked={checked} disabled={!checked && stops.length >= MAX_STOPS} onChange={() => toggle(poi)} />
            <span className="min-w-0 flex-1 truncate font-medium">{poi.name}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${poi.isActive ? 'bg-[#edf8f1] text-[#236344]' : 'bg-[#f1f5f9] text-[#475569]'}`}>{poi.isActive ? 'Khả dụng' : 'Chưa khả dụng'}</span>
          </label></li>
        })}</ul>}
    </section>

    <section aria-label="Thứ tự điểm dừng" className="overflow-hidden rounded-xl border border-[#e2e8f0]">
      <div className="flex items-center justify-between gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-3 py-3 text-sm">
        <h3 className="font-semibold">Thứ tự điểm dừng ({stops.length})</h3>
        <span className="text-xs text-[#64748b]">Tổng dwell {totalDwell}s</span>
      </div>
      {stops.length === 0 ? <p className="p-6 text-center text-sm text-[#64748b]">Chưa có điểm dừng. Tick POI ở danh sách bên trái.</p> :
        <ol className="max-h-[32rem] divide-y divide-[#eef2f6] overflow-y-auto">{stops.map((stop, index) => {
          const n = index + 1
          const issue = stopIssue(stop)
          return <li key={stop.poiId} className="space-y-2 p-3">
            <div className="flex items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#173b5f] text-xs font-semibold text-white">{n}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{stop.poiName}</span>
              <label className="flex items-center gap-1 text-xs text-[#64748b]">Dwell
                <input aria-label={`Thời gian dừng ${n} (giây)`} type="number" min={1} max={2147483647} className={`${inputClass} w-20 px-2 py-1.5`} value={stop.dwellSeconds || ''} onChange={e => changeStop(index, { dwellSeconds: Number(e.target.value) })} />
              </label>
              <button type="button" className={iconButton} aria-label={`Đưa ${stop.poiName} lên`} disabled={index === 0} onClick={() => move(index, -1)}><ChevronUp size={16} aria-hidden="true" /></button>
              <button type="button" className={iconButton} aria-label={`Đưa ${stop.poiName} xuống`} disabled={index === stops.length - 1} onClick={() => move(index, 1)}><ChevronDown size={16} aria-hidden="true" /></button>
              <button type="button" className={iconButton} aria-label={`Bỏ ${stop.poiName}`} onClick={() => onChange(stops.filter((_, i) => i !== index))}><X size={16} aria-hidden="true" /></button>
            </div>
            <div className="space-y-1.5 pl-8">
              {stop.headSteps.map((step, stepIndex) => <div key={stepIndex} className="flex items-center gap-2">
                <select aria-label={`Góc nhìn ${n}.${stepIndex + 1}`} className={`${inputClass} w-32 px-2 py-1.5`} value={step.preset} onChange={e => changeStep(index, stepIndex, { preset: e.target.value as HeadStep['preset'] })}>{PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
                <input aria-label={`Giữ ${n}.${stepIndex + 1} (giây)`} type="number" min={1} max={2147483647} placeholder="giây" className={`${inputClass} w-20 px-2 py-1.5`} value={step.holdSeconds || ''} onChange={e => changeStep(index, stepIndex, { holdSeconds: Number(e.target.value) })} />
                <button type="button" className={iconButton} aria-label={`Bỏ góc nhìn ${n}.${stepIndex + 1}`} onClick={() => changeStop(index, { headSteps: stop.headSteps.filter((_, i) => i !== stepIndex) })}><X size={14} aria-hidden="true" /></button>
              </div>)}
              <button type="button" className={buttonClass('ghost', 'sm')} disabled={stop.headSteps.length >= 100} onClick={() => changeStop(index, { headSteps: [...stop.headSteps, { preset: 'FRONT', holdSeconds: 0 }] })}><Plus size={14} aria-hidden="true" />Thêm góc nhìn</button>
              {issue && <p className="text-xs font-medium text-[#b42318]">{issue}</p>}
            </div>
          </li>
        })}</ol>}
    </section>
  </div>
}
