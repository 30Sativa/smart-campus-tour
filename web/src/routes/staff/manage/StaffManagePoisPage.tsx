import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { FileText, Maximize2, MapPinOff, Minus, Pencil, Plus, Send } from 'lucide-react'
import { SearchField } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
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
const STATUS: Record<Status, { label: string; chip: string; pin: string }> = {
  DRAFT: { label: 'Bản nháp', chip: NEUTRAL_CHIP, pin: NEUTRAL_PIN },
  WAIT: { label: 'Chờ kỹ thuật', chip: 'bg-[#fbf5e8] text-[#8a6a2e]', pin: NEUTRAL_PIN },
  PASS: { label: 'Đã đạt', chip: 'bg-[#edf3fc] text-[#3f62a0]', pin: NEUTRAL_PIN },
  FAIL: { label: 'Cần sửa', chip: 'bg-[#fbeeec] text-[#a4473d]', pin: FAIL_PIN },
}
const ORDER: Status[] = ['DRAFT', 'WAIT', 'PASS', 'FAIL']
const card = 'ct-panel min-w-0 rounded-[15px] bg-white shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]'
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2'

/**
 * POI proposals on one map version: one toolbar, the map, and a numbered list
 * whose chosen row opens its facts and next step. Same numbers on map and list. Staff
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
  const listRef = useRef<HTMLUListElement>(null)
  // A point chosen on the map may sit below the fold of the list, so bring its row into view.
  useEffect(() => { listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' }) }, [selected?.id])
  const mapItems = mapVersions.data ?? []
  const blocked = !mapVersions.isPending && !mapVersions.error && !mapItems.some(item => item.canUseForPoiPreparation)
  const mapName = (id: string, fallback: string) => {
    const found = mapItems.find(item => item.map.id === id)?.map
    return found ? mapVersionLabel(found) : fallback
  }
  const currentKey = maps.find(map => map.id === mapVersionId)?.key

  return <AdminPage>
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl leading-tight font-bold text-[#2d3748] sm:text-2xl">Điểm tham quan (POI)</h1>
        <p className="mt-1 text-sm text-[#718096]">Chọn điểm trên bản đồ hoặc trong danh sách. Chỉ điểm đã đạt mới dùng được khi tạo tuyến.</p>
      </div>
      {blocked
        // The reason is printed, not a hover tooltip, so it reaches touch screens and screen readers too.
        ? <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1"><span id="poi-create-blocked" className="text-xs text-[#b7791f]">Chưa có bản đồ nào đạt kiểm tra kỹ thuật</span><button type="button" disabled aria-describedby="poi-create-blocked" className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo điểm mới</button></span>
        : <Link to="/staff/manage/pois/new" className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo điểm mới</Link>}
    </header>

    {/* One toolbar for everything that narrows the view: map, robot filter, search and status. */}
    <div className={`${card} mb-4 px-4 py-3`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        {maps.length > 0 && <select title="" aria-label="Bản đồ / Phiên bản" value={mapVersionId} onChange={e => { setSelectedMap(e.target.value); setChosen(null) }} className={`${inputClass} font-semibold sm:w-auto sm:min-w-64 sm:max-w-full`}>
          {maps.map(map => <option key={map.id} value={map.id}>{mapName(map.id, map.key)}</option>)}
        </select>}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[#2d3748]">
          <input type="checkbox" checked={deployedOnly} onChange={e => setDeployedOnly(e.target.checked)} className="size-4 rounded border-[#cbd5e1] accent-[#3b82f6]" />
          Chỉ bản đồ đang chạy trên robot
        </label>
        <SearchField value={search} onChange={setSearch} label="Tìm POI" placeholder="Tìm tên, mục đích POI…" className="w-full sm:ml-auto sm:w-64" />
      </div>
      <div role="group" aria-label="Lọc theo trạng thái" className="mt-2.5 flex flex-wrap gap-1.5 border-t border-[#eef2f6] pt-2.5">
        {([['all', 'Tất cả', scoped.length], ...ORDER.map(key => [key, STATUS[key].label, count(key)] as const)] as const).map(([key, label, n]) => (
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key as Filter)}
            className={`inline-flex min-h-8 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${focus} ${filter === key ? 'bg-[#edf3fb] text-[#4a6fa5]' : 'text-[#718096] hover:bg-[#f8fafc] hover:text-[#2d3748]'}`}>
            {label}<span className={`rounded-full px-1.5 text-xs tabular-nums ${filter === key ? 'bg-white text-[#4a6fa5]' : 'bg-[#eef2f6] text-[#718096]'}`}>{n}</span>
          </button>
        ))}
      </div>
    </div>
    {deployedOnly && mapVersions.isError && <div className="mb-3"><Notice tone="danger">Không tải được thông tin triển khai bản đồ.</Notice></div>}

    {/* The map leads because POIs are places; the chosen point opens inside the list instead of a card below it. */}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      {proposals.isSuccess && <div className="min-w-0 xl:sticky xl:top-4">
        <PoiMap mapVersionId={mapVersionId} mapLabel={mapName(mapVersionId, currentKey ?? '')} proposals={rows} framed={scoped} number={number} selectedId={selected?.id} onSelect={setChosen} />
      </div>}

      {/* Beside the map the list is as tall as the map card and scrolls inside, so many POIs never stretch the page. */}
      <section className={`${card} flex min-w-0 flex-col xl:max-h-[calc(min(70vh,620px)+8.75rem)]`} aria-label="Danh sách đề xuất POI">
        <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-2">
          <h2 className="text-base font-bold text-[#2d3748]">Danh sách điểm</h2>
          {proposals.isSuccess && <span className="text-xs text-[#718096]">{scoped.length} điểm{rows.length !== scoped.length ? `, đang hiện ${rows.length}` : ''}</span>}
        </div>
        {proposals.isPending ? <SkeletonRows rows={4} /> : proposals.error ? <AdminErrorPanel title="Không tải được đề xuất POI." onRetry={() => void proposals.refetch()} /> : !rows.length ?
          (blocked && !everyProposal.length ? <NoEligibleMap maps={mapItems} /> : <EmptyState title={all.length || deployedOnly ? 'Không có POI khớp bộ lọc' : 'Chưa có đề xuất POI'} description={all.length || deployedOnly ? 'Đổi trạng thái hoặc từ khóa để tìm điểm tham quan.' : 'Tạo đề xuất từ một phiên bản bản đồ đã tải lên.'} />) :
          <ul ref={listRef} aria-label="Điểm tham quan" className="min-h-0 divide-y divide-[#eef2f6] overflow-y-auto border-t border-[#eef2f6]">{rows.map((p) => {
            const st = STATUS[statusOf(p)]
            const active = p.id === selected?.id
            return <li key={p.id} data-active={active} className={active ? 'bg-[#f5f9ff]' : ''}>
              <button type="button" onClick={() => setChosen(p.id)} aria-pressed={active} aria-label={`Chọn ${p.revision.name}`}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${focus} ${active ? '' : 'hover:bg-[#f8fafc]'}`}>
                <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums ${active ? 'bg-[#3b82f6] text-white' : 'bg-[#f1f5f9] text-[#2d3748]'}`}>{number.get(p.id)}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm font-semibold text-[#2d3748]">{p.revision.name}</b>
                  <span className="block truncate text-xs text-[#718096]">{p.revision.purpose}</span>
                  {p.sourcePoiId && !p.revision.narrationText && <span className="mt-1 block"><ToneBadge tone="warn">{NARRATION_NEEDED}</ToneBadge></span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className={`inline-flex rounded-lg px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${st.chip}`}>{st.label}</span>
                  {p.revision.verificationMethod && <span className="mt-0.5 block text-[11px] text-[#718096]">{verificationMethodLabel[p.revision.verificationMethod]}</span>}
                </span>
              </button>
              {active && <PoiDetail proposal={p} />}
            </li>
          })}</ul>}
      </section>
    </div>
  </AdminPage>
}

/** What the status means for Staff, and the one thing to do next. Every action opens the proposal page. */
const NEXT_STEP: Record<Status, { text: string; action: string; icon: typeof Send }> = {
  DRAFT: { text: 'Chưa gửi kiểm chứng. Hoàn tất nội dung rồi gửi để kỹ thuật viên kiểm tra trên robot.', action: 'Mở để gửi kiểm chứng', icon: Send },
  WAIT: { text: 'Đã gửi, đang chờ kỹ thuật viên kiểm tra trên robot.', action: 'Xem đề xuất', icon: FileText },
  PASS: { text: 'Đã đạt kiểm chứng, dùng được khi tạo tuyến.', action: 'Xem đề xuất', icon: FileText },
  FAIL: { text: 'Kỹ thuật viên ghi không đạt. Xem lý do, sửa rồi gửi lại.', action: 'Xem lý do và sửa', icon: Pencil },
}
const NEXT_TONE: Record<Status, string> = { DRAFT: 'bg-[#f8fafc] text-[#475569]', WAIT: 'bg-[#fbf5e8] text-[#7a5c22]', PASS: 'bg-[#edf3fc] text-[#3f62a0]', FAIL: 'bg-[#fbeeec] text-[#a4473d]' }

/** The chosen point, opened under its own row: its facts and the next step. */
function PoiDetail({ proposal }: { proposal: PoiProposal }) {
  const status = statusOf(proposal)
  // An imported POI is Staff's to finish whatever its check says: a route cannot use it without narration (ADR-0038).
  const needsNarration = Boolean(proposal.sourcePoiId && !proposal.revision.narrationText)
  const next = needsNarration
    ? { text: `Nhập từ tệp ghi pose trên robot. Đặt tên và viết thuyết minh để dùng được trong tuyến.${status === 'WAIT' ? ' Kỹ thuật vẫn đang kiểm tra vị trí.' : ''}`, action: 'Bổ sung thuyết minh', icon: Pencil }
    : NEXT_STEP[status]
  const tone = needsNarration ? NEXT_TONE.WAIT : NEXT_TONE[status]
  const facts: Array<[string, string]> = [
    ['Góc camera', cameraPresetLabel[proposal.revision.cameraPreset] ?? proposal.revision.cameraPreset],
    ['Phiên bản POI', `${proposal.currentRevision}`],
    ['Thuyết minh', proposal.revision.narrationText ? 'Đã có nội dung' : 'Chưa có nội dung'],
    ['Cách kiểm chứng', proposal.revision.verificationMethod ? verificationMethodLabel[proposal.revision.verificationMethod] ?? '-' : '-'],
  ]
  return (
    <section aria-label="Điểm đang chọn" className="space-y-3 px-4 pb-4 pl-15">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
        {facts.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-[#718096]">{label}</dt><dd className="truncate font-semibold text-[#2d3748]">{value}</dd></div>)}
      </dl>
      <p className={`rounded-xl px-3.5 py-2.5 text-[13px] ${tone}`}>{next.text}</p>
      <Link to={`/staff/manage/pois/${proposal.id}`} className={buttonClass('primary', 'sm')}><next.icon size={14} aria-hidden="true" />{next.action}</Link>
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
function PoiMap({ proposals, framed, mapVersionId, mapLabel, number, selectedId, onSelect }: { proposals: PoiProposal[]; framed: PoiProposal[]; mapVersionId: string; mapLabel: string; number: Map<string, number>; selectedId?: string; onSelect: (id: string) => void }) {
  const { map, error, retry } = useMapRaster(mapVersionId)
  const [zoom, setZoom] = useState(1)
  const frame = useRef<HTMLElement>(null)
  if (!mapVersionId) return <section className={`${card} p-6 text-center text-[13px] text-[#718096]`} aria-label="Bản đồ POI">Chưa có bản đồ cho các POI đang lọc.</section>
  if (error) return <section aria-label="Bản đồ POI"><AdminErrorPanel title="Không tải được bản đồ." description={error} onRetry={retry} /></section>
  if (!map) return <section className={`${card} overflow-hidden`} aria-label="Bản đồ POI"><SkeletonRows rows={6} label="Đang tải bản đồ" /></section>
  const points = proposals.map((p) => ({ p, at: rosToImage(map, { x: p.revision.x, y: p.revision.y }) }))
  // The frame fits every POI on this version, not just the filtered ones, so changing tab or search never re-zooms the map.
  const framePoints = framed.map((p) => rosToImage(map, { x: p.revision.x, y: p.revision.y }))
  const us = framePoints.map((pt) => pt.u), vs = framePoints.map((pt) => pt.v)
  // Crop to the POIs with a margin proportional to their spread, so unexplored grey does not fill the frame.
  const spread = us.length ? Math.max(Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs)) : 0
  const pad = Math.max(40, spread * 0.2)
  const x0 = Math.max(0, (us.length ? Math.min(...us) - pad : 0)), y0 = Math.max(0, (vs.length ? Math.min(...vs) - pad : 0))
  const w = Math.max(Math.min(map.width, (us.length ? Math.max(...us) + pad : map.width)) - x0, Math.min(200, map.width))
  const h = Math.max(Math.min(map.height, (vs.length ? Math.max(...vs) + pad : map.height)) - y0, Math.min(200, map.height))
  // Zoom keeps the centre of the fitted view.
  const zw = w / zoom, zh = h / zoom, zx = x0 + (w - zw) / 2, zy = y0 + (h - zh) / 2
  // Uploaded rasters differ in size, so markers scale with the view rather than with image pixels.
  const unit = Math.max(zw, zh) / 560
  const tool = `grid size-9 place-items-center rounded-xl border border-[#e2e8f0] bg-white text-[#475569] transition-colors hover:bg-[#f8fafc] disabled:opacity-40 ${focus}`
  return (
    <section ref={frame} className={`${card} overflow-hidden p-4`} aria-label="Bản đồ POI">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1"><h2 className="text-lg font-bold text-[#2d3748]">Bản đồ điểm tham quan</h2><p className="text-xs text-[#718096]">{mapLabel || map.mapKey}</p></div>
        <button type="button" className={tool} aria-label="Toàn màn hình" onClick={() => { void (document.fullscreenElement ? document.exitFullscreen() : frame.current?.requestFullscreen?.()) }}><Maximize2 size={16} aria-hidden="true" /></button>
        <button type="button" className={tool} aria-label="Phóng to" disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z * 1.5))}><Plus size={16} aria-hidden="true" /></button>
        <button type="button" className={tool} aria-label="Thu nhỏ" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z / 1.5))}><Minus size={16} aria-hidden="true" /></button>
      </div>
      <svg viewBox={`${zx} ${zy} ${zw} ${zh}`} className="block h-[min(70vh,620px)] w-full rounded-xl bg-[#eef2f6]" role="img" aria-label={`Bản đồ ${map.mapKey} với ${points.length} POI`}>
        <image href={map.imageUrl} x={0} y={0} width={map.width} height={map.height} style={{ imageRendering: 'pixelated' }} opacity={0.9} />
        {/* The chosen pin is drawn last so a point at the same spot never covers it. */}
        {[...points].sort((a, b) => Number(a.p.id === selectedId) - Number(b.p.id === selectedId)).map(({ p, at }) => {
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
        {([[NEUTRAL_PIN, 'Điểm tham quan'], [FAIL_PIN, STATUS.FAIL.label], [SELECTED_PIN, 'Đang chọn']] as const).map(([color, label]) => <span key={label} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: color }} />{label}</span>)}
        <span className="ml-auto">Chọn điểm trên bản đồ hoặc trong danh sách</span>
      </div>
    </section>
  )
}
