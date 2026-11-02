import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Clock, FileText, Maximize2, MapPinOff, Minus, Pencil, Plus } from 'lucide-react'
import { SearchField } from '../../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, EmptyState, Notice, SkeletonRows } from '../../../features/administration/AdminUi'
import { ToneBadge } from '../../../features/technical/TechnicalUi'
import { useMapVersions, usePoiProposals } from '../../../features/technical/technical-hooks'
import type { MapVersionItem, PoiProposal } from '../../../features/technical/api/technical'
import { NARRATION_NEEDED, cameraPresetLabel, mapCheckLabel, mapVersionLabel, verificationMethodLabel } from '../../../features/technical/poi-labels'
import { rosToImage } from '../../../features/administration/pois/map/occupancy-grid'
import { useMapRaster } from '../../../features/administration/pois/map/use-map-raster'

type Status = 'DRAFT' | 'WAIT' | 'PASS' | 'FAIL'
type Filter = 'all' | Status
const statusOf = (p: PoiProposal): Status => !p.revision.isSubmitted ? 'DRAFT' : p.revision.navigationStatus === 'PASS' ? 'PASS' : p.revision.navigationStatus === 'FAIL' ? 'FAIL' : 'WAIT'
/**
 * Labels carry a muted tint per state (grey draft, sand waiting, soft blue passed,
 * soft red to fix). On the map every point is grey except a failed one (red) and
 * the chosen one (blue).
 */
const NEUTRAL_CHIP = 'bg-[#f1f5f9] text-[#475569]'
const NEUTRAL_PIN = '#7c8ba1'
const FAIL_PIN = '#e05a4f'
const SELECTED_PIN = '#3b82f6'
const STATUS: Record<Status, { label: string; legend: string; chip: string; pin: string }> = {
  DRAFT: { label: 'Bản nháp', legend: 'Nháp', chip: NEUTRAL_CHIP, pin: NEUTRAL_PIN },
  WAIT: { label: 'Chờ kỹ thuật', legend: 'Chờ kiểm chứng', chip: 'bg-[#fbf5e8] text-[#8a6a2e]', pin: NEUTRAL_PIN },
  PASS: { label: 'Đã đạt', legend: 'Đạt', chip: 'bg-[#edf3fc] text-[#3f62a0]', pin: NEUTRAL_PIN },
  FAIL: { label: 'Cần sửa', legend: 'Không đạt', chip: 'bg-[#fbeeec] text-[#a4473d]', pin: FAIL_PIN },
}
const ORDER: Status[] = ['DRAFT', 'WAIT', 'PASS', 'FAIL']
const card = 'ct-panel min-w-0 rounded-[15px] bg-white shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]'
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2'
const column = 'text-xs font-semibold text-[#718096]'

/**
 * POI proposals on one map version: a status filter, the numbered list, the
 * same numbers on the map, and the chosen point's facts below the map. Staff
 * proposes; only Technical Staff records a check.
 */
export default function StaffManagePoisPage() {
  const proposals = usePoiProposals()
  const mapVersions = useMapVersions()
  const [filter, setFilter] = useState<Filter>('all')
  const [deployedOnly, setDeployedOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedMap, setSelectedMap] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const everyProposal = useMemo(() => proposals.data ?? [], [proposals.data])
  const deployedMaps = new Set(mapVersions.data?.filter(item => item.currentlyDeployedOn.length > 0).map(item => item.map.id))
  const all = deployedOnly ? everyProposal.filter(p => deployedMaps.has(p.revision.mapVersionId)) : everyProposal
  const maps = [...new Map(all.map(p => [p.revision.mapVersionId, { id: p.revision.mapVersionId, key: p.revision.mapKey }])).values()]
  const mapVersionId = maps.some(map => map.id === selectedMap) ? selectedMap : maps[0]?.id ?? ''
  const scoped = all.filter(p => p.revision.mapVersionId === mapVersionId)
  const number = new Map(scoped.map((p, index) => [p.id, index + 1]))
  const count = (f: Status) => scoped.filter((p) => statusOf(p) === f).length
  const rows = scoped.filter((p) => (filter === 'all' || statusOf(p) === filter) && `${p.revision.name} ${p.revision.purpose}`.toLowerCase().includes(search.trim().toLowerCase()))
  const selected = rows.find(p => p.id === chosen) ?? rows[0]
  const mapItems = mapVersions.data ?? []
  const blocked = !mapVersions.isPending && !mapVersions.error && !mapItems.some(item => item.canUseForPoiPreparation)
  const mapName = (id: string, fallback: string) => {
    const found = mapItems.find(item => item.map.id === id)?.map
    return found ? mapVersionLabel(found) : fallback
  }
  const currentKey = maps.find(map => map.id === mapVersionId)?.key

  return <AdminPage>
    <header className="mb-5">
      <h1 className="text-xl leading-tight font-bold text-[#2d3748] sm:text-2xl">Điểm tham quan (POI)</h1>
      <p className="mt-1 text-sm text-[#718096]">Chọn điểm để xem vị trí, nội dung và tình trạng kiểm chứng. Chỉ điểm đã đạt mới dùng được khi tạo tuyến.</p>
    </header>

    <div className={`${card} mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5`}>
      {maps.length > 0 && <label className="flex flex-wrap items-center gap-3 text-sm text-[#718096]">Bản đồ / Phiên bản
        <select aria-label="Bản đồ / Phiên bản" value={mapVersionId} onChange={e => { setSelectedMap(e.target.value); setChosen(null) }} className={`min-h-10 min-w-56 rounded-xl border border-[#e2e8f0] bg-white px-3 text-sm font-semibold text-[#2d3748] ${focus}`}>
          {maps.map(map => <option key={map.id} value={map.id}>{mapName(map.id, map.key)}</option>)}
        </select>
      </label>}
      {currentKey && <span className="rounded-lg bg-[#f1f5f9] px-2.5 py-1 font-mono text-xs text-[#475569]">{currentKey}</span>}
      <span aria-hidden="true" className="hidden h-6 w-px bg-[#e2e8f0] sm:block" />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-[#2d3748]">
        <input type="checkbox" checked={deployedOnly} onChange={e => setDeployedOnly(e.target.checked)} className="size-4 rounded border-[#cbd5e1] accent-[#3b82f6]" />
        Chỉ bản đồ đang triển khai
      </label>
      <span className="ml-auto">{blocked
        ? <span title="Cần ít nhất một bản đồ đạt kiểm tra kỹ thuật"><button type="button" disabled className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo điểm mới</button></span>
        : <Link to="/staff/manage/pois/new" className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo điểm mới</Link>}</span>
    </div>
    {deployedOnly && mapVersions.isError && <div className="mb-3"><Notice tone="danger">Không tải được thông tin triển khai bản đồ.</Notice></div>}

    <div role="group" aria-label="Lọc theo trạng thái" className="mb-4 flex flex-wrap gap-1.5">
      {([['all', 'Tất cả', scoped.length], ...ORDER.map(key => [key, STATUS[key].label, count(key)] as const)] as const).map(([key, label, n]) => (
        <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key as Filter)}
          className={`inline-flex min-h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${focus} ${filter === key ? 'bg-[#edf3fb] text-[#4a6fa5]' : 'text-[#718096] hover:bg-white hover:text-[#2d3748]'}`}>
          {label}<span className={`rounded-full px-1.5 text-xs tabular-nums ${filter === key ? 'bg-white text-[#4a6fa5]' : 'bg-[#eef2f6] text-[#718096]'}`}>{n}</span>
        </button>
      ))}
    </div>

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className={card} aria-label="Danh sách đề xuất POI">
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
          <h2 className="text-lg font-bold text-[#2d3748]">Danh sách điểm</h2>
          <SearchField value={search} onChange={setSearch} label="Tìm POI" placeholder="Tìm tên, mục đích POI…" className="ml-auto w-full sm:w-64" />
        </div>
        {proposals.isPending ? <SkeletonRows rows={4} /> : proposals.error ? <AdminErrorPanel title="Không tải được đề xuất POI." onRetry={() => void proposals.refetch()} /> : !rows.length ?
          (blocked && !everyProposal.length ? <NoEligibleMap maps={mapItems} /> : <EmptyState title={all.length || deployedOnly ? 'Không có POI khớp bộ lọc' : 'Chưa có đề xuất POI'} description={all.length || deployedOnly ? 'Đổi trạng thái hoặc từ khóa để tìm điểm tham quan.' : 'Tạo đề xuất từ một phiên bản bản đồ đã tải lên.'} />) :
          <>
            <div aria-hidden="true" className="hidden grid-cols-[44px_minmax(0,1fr)_96px_128px_20px] gap-x-4 border-y border-[#e2e8f0] bg-[#f8fafc] px-5 py-2.5 md:grid">
              <span className={column}>POI</span><span /><span className={column}>Camera</span><span className={column}>Trạng thái</span><span />
            </div>
            <ul aria-label="Điểm tham quan" className="divide-y divide-[#eef2f6]">{rows.map((p) => {
              const st = STATUS[statusOf(p)]
              const active = p.id === selected?.id
              return <li key={p.id} className={`grid grid-cols-[44px_minmax(0,1fr)_20px] items-center gap-x-4 gap-y-1.5 px-5 py-3 transition-colors md:grid-cols-[44px_minmax(0,1fr)_96px_128px_20px] ${active ? 'bg-[#f5f9ff]' : 'hover:bg-[#f8fafc]'}`}>
                <button type="button" onClick={() => setChosen(p.id)} aria-pressed={active} aria-label={`Chọn ${p.revision.name}`}
                  className={`grid size-9 place-items-center rounded-full text-sm font-bold tabular-nums transition-colors ${focus} ${active ? 'bg-[#edf3fb] text-[#4a6fa5]' : 'bg-[#f1f5f9] text-[#2d3748]'}`}>{number.get(p.id)}</button>
                <button type="button" onClick={() => setChosen(p.id)} className={`min-w-0 rounded-md text-left ${focus}`}>
                  <b className="block truncate text-sm font-semibold text-[#2d3748]">{p.revision.name}</b>
                  <span className="block truncate text-xs text-[#718096]">{p.revision.purpose}</span>
                  {p.sourcePoiId && !p.revision.narrationText && <span className="mt-1 block"><ToneBadge tone="warn">{NARRATION_NEEDED}</ToneBadge></span>}
                </button>
                <span className="col-start-2 text-sm text-[#2d3748] md:col-start-auto">{cameraPresetLabel[p.revision.cameraPreset] ?? p.revision.cameraPreset}</span>
                <span className="col-start-2 md:col-start-auto">
                  <span className={`inline-flex rounded-lg px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${st.chip}`}>{st.label}</span>
                  {p.revision.verificationMethod && <span className="mt-0.5 block text-[11px] text-[#718096]">{verificationMethodLabel[p.revision.verificationMethod]}</span>}
                </span>
                <Link to={`/staff/manage/pois/${p.id}`} aria-label={`Mở ${p.revision.name}`} className={`col-start-3 row-start-1 grid size-7 place-items-center rounded-lg text-[#a0aec0] hover:bg-[#eef2f6] hover:text-[#2d3748] md:col-start-auto md:row-start-auto ${focus}`}><ChevronRight size={18} aria-hidden="true" /></Link>
              </li>
            })}</ul>
          </>}
        {proposals.isSuccess && <p className="border-t border-[#eef2f6] px-5 py-3.5 text-xs text-[#718096]">{scoped.length} điểm trên bản đồ đang chọn{rows.length !== scoped.length ? `, đang hiển thị ${rows.length}` : ''}</p>}
      </section>

      {proposals.isSuccess && <div className="flex min-w-0 flex-col gap-4">
        <PoiMap mapVersionId={mapVersionId} mapLabel={mapName(mapVersionId, currentKey ?? '')} proposals={rows} number={number} selectedId={selected?.id} onSelect={setChosen} />
        {selected && <SelectedPoi proposal={selected} index={number.get(selected.id) ?? 0} />}
      </div>}
    </div>
  </AdminPage>
}

/** The chosen point: what it is, its check, and where to change it. */
function SelectedPoi({ proposal, index }: { proposal: PoiProposal; index: number }) {
  const st = STATUS[statusOf(proposal)]
  const facts: Array<[string, string]> = [
    ['Phiên bản POI', `v${proposal.currentRevision}`],
    ['Kiểm chứng', st.legend],
    ['Góc camera', cameraPresetLabel[proposal.revision.cameraPreset] ?? proposal.revision.cameraPreset],
    ['Thuyết minh', proposal.revision.narrationText ? 'Đã có nội dung' : 'Chưa có nội dung'],
  ]
  return (
    <section className={`${card} p-5`} aria-label="Điểm đang chọn">
      <h2 className="text-base font-bold text-[#2d3748]">Điểm đang chọn</h2>
      <div className="mt-3 flex items-start gap-3.5">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-[#edf3fb] text-base font-bold text-[#4a6fa5] tabular-nums">{index}</span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2"><b className="text-base font-bold text-[#2d3748]">{proposal.revision.name}</b><span className={`rounded-lg px-2.5 py-0.5 text-xs font-semibold ${st.chip}`}>{st.label}</span></p>
          <p className="mt-0.5 text-sm text-[#718096]">{proposal.revision.purpose}</p>
        </div>
      </div>
      <dl className="mt-4 grid overflow-hidden rounded-xl border border-[#e2e8f0] text-[13px] sm:grid-cols-2">
        {facts.map(([label, value], i) => (
          <div key={label} className={`flex gap-3 px-3.5 py-2.5 ${i % 2 ? 'sm:border-l sm:border-[#e2e8f0]' : ''} ${i > 1 ? 'border-t border-[#e2e8f0]' : i === 1 ? 'border-t border-[#e2e8f0] sm:border-t-0' : ''}`}>
            <dt className="w-28 shrink-0 text-[#718096]">{label}</dt><dd className="min-w-0 font-semibold text-[#2d3748]">{value}</dd>
          </div>
        ))}
      </dl>
      <Link to={`/staff/manage/pois/${proposal.id}`} className={`mt-3 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-[#2d3748] hover:underline ${focus}`}><FileText size={15} aria-hidden="true" className="text-[#718096]" />Xem kết quả kiểm chứng<ChevronRight size={15} aria-hidden="true" /></Link>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link to={`/staff/manage/pois/${proposal.id}`} className={buttonClass('primary')}><Pencil size={15} aria-hidden="true" />Chỉnh sửa đề xuất</Link>
        <Link to={`/staff/manage/pois/${proposal.id}`} className={buttonClass('secondary')}><Clock size={15} aria-hidden="true" />Xem lịch sử</Link>
        <span className="text-xs text-[#a0aec0] sm:ml-auto">Staff chuẩn bị đề xuất; kỹ thuật viên kiểm chứng.</span>
      </div>
    </section>
  )
}

/** No map has passed its technical check yet, so there is nowhere to place a POI. */
function NoEligibleMap({ maps }: { maps: MapVersionItem[] }) {
  return <div className="px-6 py-10 text-center">
    <MapPinOff size={28} className="mx-auto text-[#b7791f]" aria-hidden="true" />
    <h2 className="mt-3 text-[15px] font-semibold text-[#0f172a]">Chưa thể tạo điểm tham quan</h2>
    <p className="mx-auto mt-1 max-w-md text-sm text-[#64748b]">Cần ít nhất một bản đồ đã được kỹ thuật viên kiểm tra đạt.</p>
    {maps.length > 0
      ? <ul className="mx-auto mt-4 max-w-md divide-y divide-[#eef1f4] rounded-xl border border-[#e2e8f0] text-left text-sm">
        {maps.map(item => <li key={item.map.id} className="flex items-center justify-between gap-3 px-3 py-2"><span className="text-[#334155]">{mapVersionLabel(item.map)}</span><ToneBadge tone={item.technicalCheckStatus === 'FAILED' ? 'danger' : 'warn'}>{mapCheckLabel(item.technicalCheckStatus)}</ToneBadge></li>)}
      </ul>
      : <p className="mt-3 text-sm text-[#64748b]">Hệ thống chưa có bản đồ nào được tải lên.</p>}
  </div>
}

/** The listed POIs on their map, numbered like the list and coloured by check state; a point selects it. */
function PoiMap({ proposals, mapVersionId, mapLabel, number, selectedId, onSelect }: { proposals: PoiProposal[]; mapVersionId: string; mapLabel: string; number: Map<string, number>; selectedId?: string; onSelect: (id: string) => void }) {
  const { map, error, retry } = useMapRaster(mapVersionId)
  const [zoom, setZoom] = useState(1)
  const frame = useRef<HTMLElement>(null)
  if (!mapVersionId) return <section className={`${card} p-6 text-center text-[13px] text-[#718096]`} aria-label="Bản đồ POI">Chưa có bản đồ cho các POI đang lọc.</section>
  if (error) return <section aria-label="Bản đồ POI"><AdminErrorPanel title="Không tải được bản đồ." description={error} onRetry={retry} /></section>
  if (!map) return <section className={`${card} overflow-hidden`} aria-label="Bản đồ POI"><SkeletonRows rows={6} label="Đang tải bản đồ" /></section>
  const points = proposals.map((p) => ({ p, at: rosToImage(map, { x: p.revision.x, y: p.revision.y }) }))
  const us = points.map((pt) => pt.at.u), vs = points.map((pt) => pt.at.v)
  const pad = 140
  const x0 = Math.max(0, (us.length ? Math.min(...us) - pad : 0)), y0 = Math.max(0, (vs.length ? Math.min(...vs) - pad : 0))
  const w = Math.max(Math.min(map.width, (us.length ? Math.max(...us) + pad : map.width)) - x0, Math.min(200, map.width))
  const h = Math.max(Math.min(map.height, (vs.length ? Math.max(...vs) + pad : map.height)) - y0, Math.min(200, map.height))
  // Zoom keeps the centre of the fitted view.
  const zw = w / zoom, zh = h / zoom, zx = x0 + (w - zw) / 2, zy = y0 + (h - zh) / 2
  // Uploaded rasters differ in size, so markers scale with the view rather than with image pixels.
  const unit = Math.max(zw, zh) / 640
  const tool = `grid size-9 place-items-center rounded-xl border border-[#e2e8f0] bg-white text-[#475569] transition-colors hover:bg-[#f8fafc] disabled:opacity-40 ${focus}`
  return (
    <section ref={frame} className={`${card} overflow-hidden p-4`} aria-label="Bản đồ POI">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1"><h2 className="text-lg font-bold text-[#2d3748]">Bản đồ điểm tham quan</h2><p className="text-xs text-[#718096]">{mapLabel || map.mapKey}</p></div>
        <button type="button" className={tool} aria-label="Toàn màn hình" onClick={() => { void (document.fullscreenElement ? document.exitFullscreen() : frame.current?.requestFullscreen?.()) }}><Maximize2 size={16} aria-hidden="true" /></button>
        <button type="button" className={tool} aria-label="Phóng to" disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z * 1.5))}><Plus size={16} aria-hidden="true" /></button>
        <button type="button" className={tool} aria-label="Thu nhỏ" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z / 1.5))}><Minus size={16} aria-hidden="true" /></button>
      </div>
      <svg viewBox={`${zx} ${zy} ${zw} ${zh}`} className="block max-h-[460px] w-full rounded-xl bg-[#eef2f6]" role="img" aria-label={`Bản đồ ${map.mapKey} với ${points.length} POI`}>
        <image href={map.imageUrl} x={0} y={0} width={map.width} height={map.height} style={{ imageRendering: 'pixelated' }} opacity={0.9} />
        {points.map(({ p, at }) => {
          const active = p.id === selectedId
          const n = number.get(p.id) ?? 0
          const r = (active ? 15 : 12) * unit
          return (
            <g key={p.id} role="button" tabIndex={0} aria-pressed={active} aria-label={`${n}. ${p.revision.name}, ${STATUS[statusOf(p)].label}`} onClick={() => onSelect(p.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id) } }} className="cursor-pointer focus:outline-none">
              <circle cx={at.u} cy={at.v} r={r} fill={active ? SELECTED_PIN : STATUS[statusOf(p)].pin} stroke="#fff" strokeWidth={3 * unit} />
              {active && <circle cx={at.u} cy={at.v} r={r + 6 * unit} fill="none" stroke={SELECTED_PIN} strokeOpacity={0.35} strokeWidth={5 * unit} />}
              <text x={at.u} y={at.v + 5 * unit} textAnchor="middle" fontSize={14 * unit} fontWeight={700} fill="#fff">{n}</text>
              {active && <g>
                <rect x={at.u + r + 8 * unit} y={at.v - 13 * unit} width={(p.revision.name.length * 8.4 + 34) * unit} height={26 * unit} rx={6 * unit} fill="#fff" stroke="#e2e8f0" strokeWidth={unit} />
                <text x={at.u + r + 18 * unit} y={at.v + 5 * unit} fontSize={14 * unit} fontWeight={600} fill="#2d3748">{n} · {p.revision.name}</text>
              </g>}
            </g>
          )
        })}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#718096]">
        {([[NEUTRAL_PIN, 'Điểm tham quan'], [FAIL_PIN, 'Không đạt, cần sửa'], [SELECTED_PIN, 'Đang chọn']] as const).map(([color, label]) => <span key={label} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: color }} />{label}</span>)}
        <span className="ml-auto">Chọn điểm trên bản đồ hoặc trong danh sách</span>
      </div>
    </section>
  )
}
