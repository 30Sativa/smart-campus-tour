import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { MapPinOff, Plus } from 'lucide-react'
import { PageHeader, SearchField, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass, rowClass, tdClass, thClass } from '../../../components/ui/ui-classes'
import { KpiRow, KpiTile } from '../../../components/ui/Charts'
import { AdminErrorPanel, AdminPage, EmptyState, Notice, SkeletonRows } from '../../../features/administration/AdminUi'
import { ToneBadge } from '../../../features/technical/TechnicalUi'
import { useMapVersions, usePoiProposals } from '../../../features/technical/technical-hooks'
import type { MapVersionItem, PoiProposal } from '../../../features/technical/api/technical'
import { cameraPresetLabel, mapCheckLabel } from '../../../features/technical/poi-labels'
import { rosToImage } from '../../../features/administration/pois/map/occupancy-grid'
import { useMapRaster } from '../../../features/administration/pois/map/use-map-raster'

type Filter = 'all' | 'PASS' | 'WAIT' | 'FAIL'
const statusOf = (p: PoiProposal): Exclude<Filter, 'all'> => p.revision.navigationStatus === 'PASS' ? 'PASS' : p.revision.navigationStatus === 'FAIL' ? 'FAIL' : 'WAIT'
const STATUS: Record<Exclude<Filter, 'all'>, { label: string; chip: string; pin: string }> = {
  PASS: { label: 'Đã kiểm chứng', chip: 'border-[#cde9dc] bg-[#effbf5] text-[#1f7a55]', pin: '#1f7a55' },
  WAIT: { label: 'Chưa kiểm chứng', chip: 'border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06]', pin: '#d69412' },
  FAIL: { label: 'Không đạt · cần sửa', chip: 'border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31]', pin: '#b23e31' },
}

/**
 * POI proposals: the figures, the list with a status filter, and the points on
 * their map beside it. Staff proposes; only Technical Staff records a check.
 */
export default function StaffManagePoisPage() {
  const proposals = usePoiProposals()
  const mapVersions = useMapVersions()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [deployedOnly, setDeployedOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedMap, setSelectedMap] = useState('')
  const everyProposal = useMemo(() => proposals.data ?? [], [proposals.data])
  const deployedMaps = new Set(mapVersions.data?.filter(item => item.currentlyDeployedOn.length > 0).map(item => item.map.id))
  const all = deployedOnly ? everyProposal.filter(p => deployedMaps.has(p.revision.mapVersionId)) : everyProposal
  const maps = [...new Map(all.map(p => [p.revision.mapVersionId, { id: p.revision.mapVersionId, key: p.revision.mapKey }])).values()]
  const mapVersionId = maps.some(map => map.id === selectedMap) ? selectedMap : maps[0]?.id ?? ''
  const scoped = all.filter(p => p.revision.mapVersionId === mapVersionId)
  const count = (f: Exclude<Filter, 'all'>) => scoped.filter((p) => statusOf(p) === f).length
  const rows = scoped.filter((p) => (filter === 'all' || statusOf(p) === filter) && `${p.revision.name} ${p.revision.purpose}`.toLowerCase().includes(search.trim().toLowerCase()))
  const mapItems = mapVersions.data ?? []
  const blocked = !mapVersions.isPending && !mapVersions.error && !mapItems.some(item => item.canUseForPoiPreparation)
  const mapName = (id: string, fallback: string) => {
    const found = mapItems.find(item => item.map.id === id)?.map
    return found ? `${found.areaName} · v${found.versionNumber}` : fallback
  }

  return <AdminPage>
    <PageHeader eyebrow="Chuẩn bị Tour · POI" title="Điểm tham quan (POI)" description="Đánh dấu các điểm robot sẽ dừng trên bản đồ rồi gửi kỹ thuật viên kiểm chứng. Chỉ điểm đã đạt mới dùng được khi tạo tuyến."
      action={blocked
        ? <span title="Cần ít nhất một bản đồ đạt kiểm tra kỹ thuật"><button type="button" disabled className={buttonClass('primary')}><Plus size={15} aria-hidden="true" />Tạo điểm mới</button></span>
        : <Link to="/staff/manage/pois/new" className={buttonClass('primary')}><Plus size={15} aria-hidden="true" />Tạo điểm mới</Link>} />
    <div role="group" aria-label="Lọc theo robot đang triển khai" className="mb-3 inline-flex flex-wrap gap-0.5 rounded-[10px] bg-[#eef2f6] p-[3px]">
      {([[false, 'Tất cả'], [true, 'Trên bản đồ robot đang triển khai']] as const).map(([value, label]) => <button key={label} type="button" aria-pressed={deployedOnly === value} onClick={() => setDeployedOnly(value)}
        className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${deployedOnly === value ? 'bg-white text-[#173b59] shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-[#475569]'}`}>{label}</button>)}
    </div>
    {deployedOnly && mapVersions.isError && <div className="mb-3"><Notice tone="danger">Không tải được thông tin triển khai bản đồ.</Notice></div>}
    {maps.length > 0 && <label className="mb-5 block max-w-sm text-xs font-semibold text-[#475569]">Bản đồ / Phiên bản
      <select aria-label="Bản đồ / Phiên bản" value={mapVersionId} onChange={e => setSelectedMap(e.target.value)} className={`${inputClass} mt-2`}>
        {maps.map(map => <option key={map.id} value={map.id}>{map.key} · {map.id.slice(0, 8)}</option>)}
      </select>
    </label>}
    {proposals.data && <KpiRow label="Tổng hợp POI">
      <KpiTile label="Đề xuất" value={scoped.length} note={`${scoped.filter((p) => !p.revision.isSubmitted).length} bản nháp`} />
      <KpiTile label="Đã kiểm chứng" value={count('PASS')} />
      <KpiTile label="Chờ kỹ thuật" value={count('WAIT')} tone={count('WAIT') ? 'warn' : 'plain'} />
      <KpiTile label="Không đạt" value={count('FAIL')} tone={count('FAIL') ? 'danger' : 'plain'} />
    </KpiRow>}
    <div className="grid items-start gap-3 min-[1600px]:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
      <section className={`${panelClass} overflow-hidden`} aria-label="Danh sách đề xuất POI">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#eef1f4] px-3 py-2">
          <div role="group" aria-label="Lọc theo trạng thái" className="inline-flex flex-wrap gap-0.5 rounded-[10px] bg-[#eef2f6] p-[3px]">
            {([['all', 'Tất cả', scoped.length], ['PASS', 'Đã kiểm chứng', count('PASS')], ['WAIT', 'Chờ kỹ thuật', count('WAIT')], ['FAIL', 'Không đạt', count('FAIL')]] as const).map(([key, label, n]) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${filter === key ? 'bg-white text-[#173b59] shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-[#475569]'}`}>{label} <span className="text-[11px] text-[#94a3b8]">{n}</span></button>
            ))}
          </div>
          <SearchField value={search} onChange={setSearch} label="Tìm POI" placeholder="Tìm POI" className="ml-auto w-full sm:w-56" />
        </div>
        {proposals.isPending ? <SkeletonRows rows={4} /> : proposals.error ? <AdminErrorPanel title="Không tải được đề xuất POI." onRetry={() => void proposals.refetch()} /> : !rows.length ?
          (blocked && !everyProposal.length ? <NoEligibleMap maps={mapItems} /> : <EmptyState title={all.length || deployedOnly ? 'Không có POI khớp bộ lọc' : 'Chưa có đề xuất POI'} description={all.length || deployedOnly ? 'Đổi trạng thái hoặc từ khóa để tìm điểm tham quan.' : 'Tạo đề xuất từ một phiên bản bản đồ đã tải lên.'} />) :
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left">
            <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>POI</th><th className={thClass}>Bản đồ</th><th className={thClass}>Camera</th><th className={thClass}>Trạng thái</th><th className={thClass}><span className="sr-only">Mở</span></th></tr></thead>
            <tbody className="divide-y divide-[#eef1f4]">{rows.map((p) => { const st = STATUS[statusOf(p)]; return <tr key={p.id} className={rowClass}>
              <td className={tdClass}><b className="font-semibold text-[#0f172a]">{p.revision.name}</b><p className="text-[11.5px] text-[#64748b]">{p.revision.purpose}</p></td>
              <td className={tdClass}>{mapName(p.revision.mapVersionId, p.revision.mapKey)}<p className="text-[11.5px] text-[#64748b]">Phiên bản {p.currentRevision}</p></td>
              <td className={tdClass}>{cameraPresetLabel[p.revision.cameraPreset] ?? p.revision.cameraPreset}</td>
              <td className={tdClass}><span className={`inline-flex rounded-full border px-2 py-px text-[11px] font-bold whitespace-nowrap ${st.chip}`}>{st.label}</span>{!p.revision.isSubmitted && <span className="ml-1 text-[11px] text-[#64748b]">bản nháp</span>}</td>
              <td className={`${tdClass} text-right`}><Link to={`/staff/manage/pois/${p.id}`} className={buttonClass('secondary', 'sm')}>Mở</Link></td>
            </tr> })}</tbody>
          </table></div>}
      </section>
      {proposals.isSuccess && <PoiMap mapVersionId={mapVersionId} proposals={rows} onOpen={(id) => navigate(`/staff/manage/pois/${id}`)} />}
    </div>
  </AdminPage>
}

/** No map has passed its technical check yet, so there is nowhere to place a POI. */
function NoEligibleMap({ maps }: { maps: MapVersionItem[] }) {
  return <div className="px-6 py-10 text-center">
    <MapPinOff size={28} className="mx-auto text-[#b7791f]" aria-hidden="true" />
    <h2 className="mt-3 text-[15px] font-semibold text-[#0f172a]">Chưa thể tạo điểm tham quan</h2>
    <p className="mx-auto mt-1 max-w-md text-sm text-[#64748b]">Cần ít nhất một bản đồ đã được kỹ thuật viên kiểm tra đạt.</p>
    {maps.length > 0
      ? <ul className="mx-auto mt-4 max-w-md divide-y divide-[#eef1f4] rounded-xl border border-[#e2e8f0] text-left text-sm">
        {maps.map(item => <li key={item.map.id} className="flex items-center justify-between gap-3 px-3 py-2"><span className="text-[#334155]">{item.map.areaName} · v{item.map.versionNumber}</span><ToneBadge tone={item.technicalCheckStatus === 'FAILED' ? 'danger' : 'warn'}>{mapCheckLabel(item.technicalCheckStatus)}</ToneBadge></li>)}
      </ul>
      : <p className="mt-3 text-sm text-[#64748b]">Hệ thống chưa có bản đồ nào được tải lên.</p>}
  </div>
}

/** The listed POIs on their map, coloured by check status; a point opens its proposal. */
function PoiMap({ proposals, mapVersionId, onOpen }: { proposals: PoiProposal[]; mapVersionId: string; onOpen: (id: string) => void }) {
  const { map, error, retry } = useMapRaster(mapVersionId)
  if (!mapVersionId) return <section className={`${panelClass} p-6 text-center text-[13px] text-[#64748b]`} aria-label="Bản đồ POI">Chưa có bản đồ cho các POI đang lọc.</section>
  if (error) return <section aria-label="Bản đồ POI"><AdminErrorPanel title="Không tải được bản đồ." description={error} onRetry={retry} /></section>
  if (!map) return <section className={`${panelClass} overflow-hidden`} aria-label="Bản đồ POI"><SkeletonRows rows={6} label="Đang tải bản đồ" /></section>
  const points = proposals.map((p) => ({ p, at: rosToImage(map, { x: p.revision.x, y: p.revision.y }) }))
  const us = points.map((pt) => pt.at.u), vs = points.map((pt) => pt.at.v)
  const pad = 140
  const x0 = Math.max(0, (us.length ? Math.min(...us) - pad : 0)), y0 = Math.max(0, (vs.length ? Math.min(...vs) - pad : 0))
  const w = Math.max(Math.min(map.width, (us.length ? Math.max(...us) + pad : map.width)) - x0, Math.min(200, map.width))
  const h = Math.max(Math.min(map.height, (vs.length ? Math.max(...vs) + pad : map.height)) - y0, Math.min(200, map.height))
  // Uploaded rasters differ in size, so markers scale with the view rather than with image pixels.
  const unit = Math.max(w, h) / 700
  return (
    <section className={`${panelClass} overflow-hidden`} aria-label="Bản đồ POI">
      <div className="flex items-center justify-between border-b border-[#eef1f4] px-3.5 py-2.5"><h2 className="text-[13px] font-semibold text-[#0f172a]">Bản đồ {map.mapKey}</h2><span className="text-[11.5px] text-[#64748b]">bấm một điểm để mở</span></div>
      <svg viewBox={`${x0} ${y0} ${w} ${h}`} className="block max-h-[560px] w-full bg-[#e2eaf2]" role="img" aria-label={`Bản đồ ${map.mapKey} với ${points.length} POI`}>
        <image href={map.imageUrl} x={0} y={0} width={map.width} height={map.height} style={{ imageRendering: 'pixelated' }} opacity={0.85} />
        {points.map(({ p, at }) => (
          <g key={p.id} role="link" tabIndex={0} aria-label={`${p.revision.name}, ${STATUS[statusOf(p)].label}`} onClick={() => onOpen(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p.id) }} className="cursor-pointer focus:outline-2 focus:outline-[#173b59]">
            <circle cx={at.u} cy={at.v} r={12 * unit} fill={STATUS[statusOf(p)].pin} stroke="#fff" strokeWidth={4 * unit} />
            <text x={at.u} y={at.v + 34 * unit} textAnchor="middle" fontSize={22 * unit} fontWeight={600} fill="#0f172a" stroke="#fff" strokeWidth={7 * unit} paintOrder="stroke">{p.revision.name}</text>
          </g>
        ))}
      </svg>
    </section>
  )
}
