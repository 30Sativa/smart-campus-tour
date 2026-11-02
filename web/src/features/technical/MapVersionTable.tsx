import { useState } from 'react'
import { Pagination, SearchField, panelClass } from '../../components/ui/ConsolePrimitives'
import { Modal } from '../../components/ui/Drawer'
import type { StatusTone } from '../../components/ui/status-tone'
import { buttonClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { usePagination } from '../../components/ui/use-pagination'
import { useMapRaster } from '../administration/pois/map/use-map-raster'
import { DetailFact, ToneBadge, ViewDetailButton } from './TechnicalUi'
import type { MapAreaOption, MapVersionItem } from './api/technical'
import { stamp } from './technical-format'

type Actions = { onUpload: (area: MapAreaOption) => void; onCheck: (item: MapVersionItem) => void }

type SortField = 'area' | 'version' | 'uploaded' | 'status' | 'robot'

const PAGE_SIZE = 10
const TONE_RANK: Partial<Record<StatusTone, number>> = { danger: 0, warn: 1, ok: 2 }
const byName = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' })

/** File validity, the technical check and POI eligibility read as one answer: can this version be used yet? */
function versionStatus(item: MapVersionItem): { tone: StatusTone; label: string; detail: string | null } {
  if (item.map.validationStatus !== 'VALID') return { tone: 'danger', label: 'Tệp không hợp lệ', detail: item.preparationBlockReason }
  if (item.technicalCheckStatus === 'PENDING') return { tone: 'warn', label: 'Chờ kiểm tra', detail: item.preparationBlockReason }
  if (item.technicalCheckStatus === 'FAILED') return { tone: 'danger', label: 'Kiểm tra chưa đạt', detail: item.preparationBlockReason }
  return { tone: 'ok', label: 'Đạt kiểm tra', detail: item.canUseForPoiPreparation ? 'Dùng được để tạo POI' : item.preparationBlockReason }
}

/** Ascending order of each column; status starts with what needs attention. */
const COMPARE: Record<SortField, (a: MapVersionItem, b: MapVersionItem) => number> = {
  area: (a, b) => byName.compare(a.map.areaName, b.map.areaName) || b.map.versionNumber - a.map.versionNumber,
  version: (a, b) => a.map.versionNumber - b.map.versionNumber,
  uploaded: (a, b) => a.map.uploadedAt.localeCompare(b.map.uploadedAt),
  status: (a, b) => (TONE_RANK[versionStatus(a).tone] ?? 3) - (TONE_RANK[versionStatus(b).tone] ?? 3),
  robot: (a, b) => byName.compare(a.currentlyDeployedOn[0]?.robotCode ?? '\uffff', b.currentlyDeployedOn[0]?.robotCode ?? '\uffff'),
}

function SortHeading({ field, label, sort, onSort }: { field: SortField; label: string; sort: { field: SortField; descending: boolean } | null; onSort: (field: SortField) => void }) {
  const direction = sort?.field !== field ? 'none' : sort.descending ? 'descending' : 'ascending'
  return (
    <th scope="col" aria-sort={direction} className={thClass}>
      <button type="button" aria-label={`Sắp xếp theo ${label}`} onClick={() => onSort(field)} className="inline-flex items-center gap-1.5 rounded-md text-left hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]">
        {label}<span className="text-[#94a3b8]" aria-hidden="true">{direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕'}</span>
      </button>
    </th>
  )
}

/** The uploaded raster itself, so the technician can see which floor plan this version is before loading it on a robot. */
function MapPreview({ mapVersionId, label }: { mapVersionId: string; label: string }) {
  const { map, error, retry } = useMapRaster(mapVersionId)
  if (error) return <div role="alert" className="flex flex-col items-center gap-2 rounded-xl bg-[#fff6f4] px-4 py-8 text-center text-[13px] text-[#b23e18]"><p>{error}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={retry}>Tải lại bản đồ</button></div>
  if (!map) return <p role="status" className="flex h-64 items-center justify-center rounded-xl bg-[#f1f5f9] text-[13px] text-[#64748b]">Đang tải bản đồ…</p>
  return <img src={map.imageUrl} alt={`Bản đồ ${label}`} width={map.width} height={map.height} className="mx-auto block h-auto max-h-[420px] w-auto max-w-full rounded-xl border border-[#e2e8f0] bg-[#eef2f6]" style={{ imageRendering: 'pixelated' }} />
}

/** What the table leaves out. The checksum is here so the file on the robot can be compared with the one uploaded. */
function MapVersionDetail({ item, onClose, onUpload, onCheck }: { item: MapVersionItem; onClose: () => void } & Actions) {
  const { map, preparationEvidence: evidence, currentlyDeployedOn: robots } = item
  const status = versionStatus(item)
  return (
    <Modal open size="lg" title={`${map.areaName} v${map.versionNumber}`} description={map.areaKey} onClose={onClose}
      footer={<div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={buttonClass('secondary')} onClick={() => { onClose(); onUpload({ areaKey: map.areaKey, displayName: map.areaName }) }}>Tải phiên bản mới</button>
        <button type="button" className={buttonClass('primary')} onClick={() => { onClose(); onCheck(item) }}>Ghi kết quả kiểm tra</button>
      </div>}>
      <MapPreview mapVersionId={map.id} label={`${map.areaName} v${map.versionNumber}`} />
      <dl className="mt-3 divide-y divide-[#f1f5f9]">
        <DetailFact label="Trạng thái"><ToneBadge tone={status.tone}>{status.label}</ToneBadge>{status.detail && <span className="mt-1 block text-xs text-[#64748b]">{status.detail}</span>}</DetailFact>
        <DetailFact label="Kiểm tra gần nhất">{evidence ? stamp(evidence.checkedAt) : 'Chưa có'}</DetailFact>
        <DetailFact label="Robot đang triển khai">{robots.length ? robots.map(robot => robot.robotCode).join(', ') : 'Chưa có'}</DetailFact>
        <DetailFact label="Tệp"><span className="break-all">{map.packageFileName}</span></DetailFact>
        <DetailFact label="Thông số bản đồ">{map.imageWidth}×{map.imageHeight} · {map.resolution} m/ô</DetailFact>
        <DetailFact label="Checksum tệp"><span className="font-mono text-xs break-all">{map.packageSha256}</span><span className="mt-1 block text-xs text-[#64748b]">Dùng để đối chiếu tệp ZIP đã nạp lên robot với tệp đã tải lên.</span></DetailFact>
      </dl>
    </Modal>
  )
}

/** One line per version, only what decides the next step. The rest opens from the eye. */
export function MapVersionTable({ items, onUpload, onCheck }: { items: MapVersionItem[] } & Actions) {
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState<MapVersionItem | null>(null)
  const [sort, setSort] = useState<{ field: SortField; descending: boolean } | null>(null)
  const term = search.trim().toLowerCase()
  const rows = items.filter(({ map }) => map.areaName.toLowerCase().includes(term) || map.areaKey.toLowerCase().includes(term))
  const sorted = sort ? [...rows].sort((a, b) => (sort.descending ? -1 : 1) * COMPARE[sort.field](a, b)) : rows
  const paged = usePagination(sorted, PAGE_SIZE, `${term}|${sort?.field}|${sort?.descending}`)
  const toggleSort = (field: SortField) => setSort(sort?.field === field ? { field, descending: !sort.descending } : { field, descending: false })

  return (
    <section className={panelClass} aria-label="Danh sách phiên bản bản đồ">
      <div className="flex flex-col gap-3 border-b border-[#f1f5f9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-[15px] font-semibold text-[#0f172a]">Danh sách phiên bản bản đồ</h2><p className="text-xs text-[#64748b]">Mỗi lần tải lên tạo một phiên bản mới của khu vực.</p></div>
        <SearchField value={search} onChange={setSearch} label="Tìm khu vực" placeholder="Tìm theo khu vực" className="sm:w-64" />
      </div>
      {rows.length === 0 ? <p className="px-4 py-8 text-center text-[13px] text-[#64748b]">Không có khu vực nào phù hợp.</p> : <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="border-b border-[#e2e8f0]"><tr><SortHeading field="area" label="Khu vực" sort={sort} onSort={toggleSort} /><SortHeading field="version" label="Phiên bản" sort={sort} onSort={toggleSort} /><SortHeading field="uploaded" label="Tải lên lúc" sort={sort} onSort={toggleSort} /><SortHeading field="status" label="Trạng thái" sort={sort} onSort={toggleSort} /><SortHeading field="robot" label="Robot đang triển khai" sort={sort} onSort={toggleSort} /><th scope="col" className={`${thClass} text-center`}>Thao tác</th></tr></thead>
            <tbody className="divide-y divide-[#eef1f4]">
              {paged.rows.map(item => {
                const { map, currentlyDeployedOn: robots } = item
                const status = versionStatus(item)
                return (
                  <tr key={map.id} className={rowClass}>
                    <td className={tdClass}><span className="font-semibold text-[#0f172a]">{map.areaName}</span><p className="font-mono text-[11.5px] text-[#64748b]">{map.areaKey}</p></td>
                    <td className={`${tdClass} font-mono`}>v{map.versionNumber}</td>
                    <td className={`${tdClass} whitespace-nowrap text-[13px] text-[#64748b]`}>{stamp(map.uploadedAt)}</td>
                    <td className={tdClass}><ToneBadge tone={status.tone}>{status.label}</ToneBadge></td>
                    <td className={tdClass}>{robots.length ? <span className="flex flex-wrap gap-1">{robots.map(robot => <ToneBadge key={robot.robotCode} tone="ok">{robot.robotCode}</ToneBadge>)}</span> : <span className="text-[#94a3b8]">-</span>}</td>
                    <td className={tdClass}><div className="flex items-center justify-center gap-2">
                      <button type="button" className={buttonClass(item.technicalCheckStatus === 'PENDING' ? 'primary' : 'secondary', 'sm')} onClick={() => onCheck(item)}>Ghi kết quả kiểm tra</button>
                      <ViewDetailButton label={`Xem chi tiết ${map.areaName} v${map.versionNumber}`} onClick={() => setViewing(item)} />
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onPage={paged.setPage} label="Phân trang phiên bản bản đồ" />
      </>}
      {viewing && <MapVersionDetail item={viewing} onClose={() => setViewing(null)} onUpload={onUpload} onCheck={onCheck} />}
    </section>
  )
}
