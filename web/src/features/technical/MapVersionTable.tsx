import { useState } from 'react'
import { Link } from 'react-router'
import { Pagination, SearchField, panelClass } from '../../components/ui/ConsolePrimitives'
import { Modal } from '../../components/ui/Drawer'
import type { StatusTone } from '../../components/ui/status-tone'
import { buttonClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { usePagination } from '../../components/ui/use-pagination'
import { useMapRaster } from '../administration/pois/map/use-map-raster'
import { DetailFact, ToneBadge, ViewDetailButton } from './TechnicalUi'
import type { MapAreaOption, MapVersionItem, PhysicalRobotOption } from './api/technical'
import { areaLabel, duplicateAreaNames, mapVersionLabel } from './poi-labels'
import { formatDateTime } from '../../components/ui/date-time'
import { EmptyState } from '../../components/ui/EmptyState'

type Actions = { onUpload: (area: MapAreaOption) => void; onCheck: (item: MapVersionItem) => void }
/** Registered robots, only to say which one holds an area; the assignment itself is edited on the robot page. */
type RobotList = { data?: PhysicalRobotOption[]; isPending: boolean; isError: boolean }

/** One area: its newest version leads the row; older versions stay reachable from the detail. */
type AreaRow = { latest: MapVersionItem; versions: MapVersionItem[]; robots: { robotCode: string; versionNumber: number }[] }

type SortField = 'area' | 'version' | 'uploaded' | 'file' | 'run'

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

/** The "Tệp bản đồ" column: did the uploaded package pass the server's file checks. */
function fileStatus(item: MapVersionItem): { tone: StatusTone; label: string } {
  return item.map.validationStatus === 'VALID' ? { tone: 'ok', label: 'Hợp lệ' } : { tone: 'danger', label: 'Không hợp lệ' }
}

/**
 * The "Chạy thử trên robot" column, from what the list already returns: robots whose latest deployment check passed
 * on a version of this area, else the newest version's own check (a failure or an earlier pass), else nothing yet.
 */
function runState(area: AreaRow): { tone: StatusTone; robots: AreaRow['robots']; failedOn: string | null; passedOn: string | null } {
  const { latest, robots } = area
  if (robots.length) return { tone: robots.some(robot => robot.versionNumber === latest.map.versionNumber) ? 'ok' : 'warn', robots, failedOn: null, passedOn: null }
  if (latest.technicalCheckStatus === 'FAILED') return { tone: 'danger', robots, failedOn: latest.latestDeployment?.robotCode ?? null, passedOn: null }
  if (latest.technicalCheckStatus === 'PASSED' && latest.preparationEvidence) return { tone: 'ok', robots, failedOn: null, passedOn: latest.preparationEvidence.robotCode }
  return { tone: 'warn', robots, failedOn: null, passedOn: null }
}

/** Groups versions by area in the order the API first lists each area. */
function groupByArea(items: MapVersionItem[]): AreaRow[] {
  const areas = new Map<string, MapVersionItem[]>()
  for (const item of items) areas.set(item.map.areaKey, [...(areas.get(item.map.areaKey) ?? []), item])
  return [...areas.values()].map(group => {
    const versions = [...group].sort((a, b) => b.map.versionNumber - a.map.versionNumber)
    const robots = versions.flatMap(item => item.currentlyDeployedOn.map(robot => ({ robotCode: robot.robotCode, versionNumber: item.map.versionNumber })))
    return { latest: versions[0], versions, robots }
  })
}

/** Ascending order of each column; status starts with what needs attention. */
const COMPARE: Record<SortField, (a: AreaRow, b: AreaRow) => number> = {
  area: (a, b) => byName.compare(a.latest.map.areaName, b.latest.map.areaName) || byName.compare(a.latest.map.areaKey, b.latest.map.areaKey),
  version: (a, b) => a.latest.map.versionNumber - b.latest.map.versionNumber,
  uploaded: (a, b) => a.latest.map.uploadedAt.localeCompare(b.latest.map.uploadedAt),
  file: (a, b) => (TONE_RANK[fileStatus(a.latest).tone] ?? 3) - (TONE_RANK[fileStatus(b.latest).tone] ?? 3),
  run: (a, b) => (TONE_RANK[runState(a).tone] ?? 3) - (TONE_RANK[runState(b).tone] ?? 3) || byName.compare(a.robots[0]?.robotCode ?? '￿', b.robots[0]?.robotCode ?? '￿'),
}

function SortHeading({ field, label, sort, onSort, className = '' }: { field: SortField; label: string; sort: { field: SortField; descending: boolean } | null; onSort: (field: SortField) => void; className?: string }) {
  const direction = sort?.field !== field ? 'none' : sort.descending ? 'descending' : 'ascending'
  return (
    <th scope="col" aria-sort={direction} className={`${thClass} ${className}`}>
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

/**
 * What the table leaves out, for one version of the area. The checksum is here so the file on the robot
 * can be compared with the one uploaded; the version list switches which version the dialog shows.
 */
function MapVersionDetail({ area, itemId, robotList, onSelect, onClose, onUpload, onCheck }: { area: AreaRow; itemId: string; robotList: RobotList; onSelect: (id: string) => void; onClose: () => void } & Actions) {
  const item = area.versions.find(version => version.map.id === itemId) ?? area.latest
  const { map, preparationEvidence: evidence, currentlyDeployedOn: robots } = item
  const status = versionStatus(item)
  const isLatest = item === area.latest
  // Read-only here: assignment is changed only on the robot page, so it has one place to edit.
  const assigned = robotList.data?.filter(robot => area.versions.some(version => version.map.id === robot.assignedMapVersionId)) ?? []
  return (
    <Modal open size="lg" title={mapVersionLabel(map)} description={isLatest ? `${map.areaKey} · phiên bản mới nhất` : `${map.areaKey} · phiên bản cũ, mới nhất là phiên bản ${area.latest.map.versionNumber}`} onClose={onClose}
      footer={<div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={buttonClass('secondary')} onClick={() => { onClose(); onUpload({ areaKey: map.areaKey, displayName: map.areaName }) }}>Tải phiên bản mới</button>
        <button type="button" className={buttonClass('primary')} onClick={() => { onClose(); onCheck(item) }}>Ghi kết quả kiểm tra</button>
      </div>}>
      <MapPreview mapVersionId={map.id} label={mapVersionLabel(map)} />
      <dl className="mt-3 divide-y divide-[#f1f5f9]">
        <DetailFact label="Trạng thái"><ToneBadge tone={status.tone}>{status.label}</ToneBadge>{status.detail && <span className="mt-1 block text-xs text-[#64748b]">{status.detail}</span>}</DetailFact>
        <DetailFact label="Kiểm tra gần nhất">{evidence ? formatDateTime(evidence.checkedAt) : 'Chưa có'}</DetailFact>
        <DetailFact label="Robot được gán">
          {robotList.isPending ? 'Đang tải…' : robotList.isError ? 'Không tải được danh sách robot' : assigned.length
            ? <span className="flex flex-wrap gap-x-3 gap-y-1">{assigned.map(robot => <Link key={robot.id} to={`/technical/robots?robot=${robot.id}`} className="font-semibold text-[#1d4ed8] underline">{robot.displayName ? `${robot.displayName} · ` : ''}{robot.robotCode} · phiên bản {robot.assignedVersionNumber}</Link>)}</span>
            : 'Chưa có robot nào được gán khu vực này'}
          <span className="mt-1 block text-xs text-[#64748b]">Gán hoặc đổi bản đồ ở trang Robot.</span>
        </DetailFact>
        <DetailFact label="Robot kiểm tra đạt">{robots.length ? robots.map(robot => robot.robotCode).join(', ') : 'Chưa có'}<span className="mt-1 block text-xs text-[#64748b]">Lần kiểm tra triển khai gần nhất của robot đạt trên phiên bản này. Khác với robot được gán.</span></DetailFact>
        <DetailFact label="Tệp"><span className="break-all">{map.packageFileName}</span></DetailFact>
        <DetailFact label="Thông số bản đồ">{map.imageWidth}×{map.imageHeight} · {map.resolution} m/ô</DetailFact>
        <DetailFact label="Checksum tệp"><span className="font-mono text-xs break-all">{map.packageSha256}</span><span className="mt-1 block text-xs text-[#64748b]">Dùng để đối chiếu tệp ZIP đã nạp lên robot với tệp đã tải lên.</span></DetailFact>
      </dl>
      {area.versions.length > 1 && <section className="mt-4" aria-label="Lịch sử phiên bản">
        <h3 className="text-[13px] font-semibold text-[#334155]">Lịch sử phiên bản</h3>
        <p className="text-xs text-[#64748b]">Phiên bản cũ được giữ lại vì POI và kết quả kiểm tra gắn với đúng tệp đã dùng.</p>
        <ul className="mt-2 divide-y divide-[#f1f5f9] rounded-xl border border-[#e2e8f0]">
          {area.versions.map(version => {
            const versionState = versionStatus(version)
            const current = version.map.id === map.id
            return (
              <li key={version.map.id} className={`flex items-center gap-3 px-3 py-2 text-[13px] ${current ? 'bg-[#eff6ff]' : ''}`}>
                <span className="w-24 font-semibold text-[#0f172a]">Phiên bản {version.map.versionNumber}</span>
                <span className="text-[#64748b]">{formatDateTime(version.map.uploadedAt)}</span>
                <ToneBadge tone={versionState.tone}>{versionState.label}</ToneBadge>
                {version.currentlyDeployedOn.length > 0 && <span className="text-xs text-[#1f7a55]">{version.currentlyDeployedOn.map(robot => robot.robotCode).join(', ')}</span>}
                <span className="ml-auto">{current
                  ? <span className="text-xs font-semibold text-[#2563eb]">Đang xem</span>
                  : <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => onSelect(version.map.id)}>Xem phiên bản {version.map.versionNumber}</button>}</span>
              </li>
            )
          })}
        </ul>
      </section>}
    </Modal>
  )
}

/** One line per area, led by its newest version: only what decides the next step. The rest opens from the eye. */
export function MapVersionTable({ items, robots, onUpload, onCheck }: { items: MapVersionItem[]; robots: RobotList } & Actions) {
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState<{ areaKey: string; itemId: string } | null>(null)
  const [sort, setSort] = useState<{ field: SortField; descending: boolean } | null>(null)
  const term = search.trim().toLowerCase()
  const areas = groupByArea(items)
  const rows = areas.filter(({ latest: { map } }) => map.areaName.toLowerCase().includes(term) || map.areaKey.toLowerCase().includes(term))
  const sorted = sort ? [...rows].sort((a, b) => (sort.descending ? -1 : 1) * COMPARE[sort.field](a, b)) : rows
  const paged = usePagination(sorted, PAGE_SIZE, `${term}|${sort?.field}|${sort?.descending}`)
  const toggleSort = (field: SortField) => setSort(sort?.field === field ? { field, descending: !sort.descending } : { field, descending: false })
  const viewedArea = viewing && areas.find(area => area.latest.map.areaKey === viewing.areaKey)
  const duplicates = duplicateAreaNames(areas.map(area => ({ areaKey: area.latest.map.areaKey, name: area.latest.map.areaName })))
  // People know robots by name; the code stays the fallback while the robot list loads.
  const robotName = (code: string) => robots.data?.find(robot => robot.robotCode === code)?.displayName || code

  return (
    <section className={panelClass} aria-label="Danh sách bản đồ theo khu vực">
      <div className="flex flex-col gap-3 border-b border-[#f1f5f9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[15px] font-semibold text-[#0f172a]">Danh sách bản đồ</h2>
        <SearchField value={search} onChange={setSearch} label="Tìm khu vực" placeholder="Tìm theo khu vực" className="sm:w-64" />
      </div>
      {rows.length === 0 ? <EmptyState variant="noMatch" title="Không có khu vực nào phù hợp" onClear={() => setSearch('')} /> : <>
        <div className="overflow-x-auto">
          {/* Below xl the version and upload time fold under the area name, so the table fits a narrow screen without scrolling. */}
          <table className="w-full text-left">
            <thead className="border-b border-[#e2e8f0]"><tr><SortHeading field="area" label="Khu vực" sort={sort} onSort={toggleSort} /><SortHeading field="version" label="Phiên bản" sort={sort} onSort={toggleSort} className="hidden xl:table-cell" /><SortHeading field="uploaded" label="Tải lên lúc" sort={sort} onSort={toggleSort} className="hidden xl:table-cell" /><SortHeading field="file" label="Tệp bản đồ" sort={sort} onSort={toggleSort} /><SortHeading field="run" label="Chạy thử trên robot" sort={sort} onSort={toggleSort} /><th scope="col" className={`${thClass} text-center`}>Thao tác</th></tr></thead>
            <tbody className="divide-y divide-[#eef1f4]">
              {paged.rows.map(area => {
                const { latest, versions } = area
                const { map } = latest
                const file = fileStatus(latest)
                const run = runState(area)
                return (
                  <tr key={map.areaKey} className={rowClass}>
                    <td className={tdClass}><span className="font-semibold text-[#0f172a]">{areaLabel(map.areaName, map.areaKey, duplicates)}</span>
                      <p className="text-[11.5px] text-[#64748b] xl:hidden">Phiên bản {map.versionNumber}{versions.length > 1 ? ` (${versions.length - 1} bản cũ)` : ''} · {formatDateTime(map.uploadedAt)}</p></td>
                    <td className={`${tdClass} hidden xl:table-cell`}><span className="font-semibold">{map.versionNumber}</span>{versions.length > 1 && <p className="text-[11.5px] text-[#64748b]">{versions.length - 1} bản cũ</p>}</td>
                    <td className={`${tdClass} hidden whitespace-nowrap text-[13px] text-[#64748b] xl:table-cell`}>{formatDateTime(map.uploadedAt)}</td>
                    <td className={tdClass}><ToneBadge tone={file.tone}>{file.label}</ToneBadge></td>
                    <td className={tdClass}>{run.robots.length ? <span className="flex flex-wrap gap-1">{run.robots.map(robot => robot.versionNumber === map.versionNumber
                      ? <ToneBadge key={robot.robotCode} tone="ok">{robotName(robot.robotCode)}</ToneBadge>
                      : <ToneBadge key={robot.robotCode} tone="warn">{robotName(robot.robotCode)} · đang ở phiên bản {robot.versionNumber}</ToneBadge>)}</span>
                      : run.tone === 'danger' ? <ToneBadge tone="danger">{run.failedOn ? `Không đạt · ${robotName(run.failedOn)}` : 'Không đạt'}</ToneBadge>
                        : run.passedOn ? <ToneBadge tone="ok">{robotName(run.passedOn)}</ToneBadge>
                          : <span className="text-[13px] text-muted">Chưa có</span>}</td>
                    <td className={tdClass}><div className="flex items-center justify-center gap-2">
                      <button type="button" className={buttonClass(latest.technicalCheckStatus === 'PENDING' ? 'primary' : 'secondary', 'sm')} onClick={() => onCheck(latest)}>Ghi kết quả kiểm tra</button>
                      <ViewDetailButton label={`Xem chi tiết ${mapVersionLabel(map)}`} onClick={() => setViewing({ areaKey: map.areaKey, itemId: map.id })} />
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onPage={paged.setPage} label="Phân trang danh sách bản đồ" />
      </>}
      {viewedArea && viewing && <MapVersionDetail area={viewedArea} itemId={viewing.itemId} robotList={robots} onSelect={itemId => setViewing({ ...viewing, itemId })} onClose={() => setViewing(null)} onUpload={onUpload} onCheck={onCheck} />}
    </section>
  )
}
