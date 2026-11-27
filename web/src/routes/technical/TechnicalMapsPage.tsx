import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Activity, Bot, CircleCheck, FileArchive, Layers, LoaderCircle, Upload } from 'lucide-react'
import { PageHeader, StatStrip, StatTile, panelClass } from '../../components/ui/ConsolePrimitives'
import { Modal } from '../../components/ui/Drawer'
import { EmptyState } from '../../components/ui/EmptyState'
import { buttonClass, inputClass, labelClass } from '../../components/ui/ui-classes'
import { MapVersionTable } from '../../features/technical/MapVersionTable'
import { TechnicalPage } from '../../features/technical/TechnicalUi'
import { areaLabel, duplicateAreaNames, sameAreaName } from '../../features/technical/poi-labels'
import { RetireMapDialog } from '../../features/technical/RetireMapDialog'
import { formatDateTime } from '../../components/ui/date-time'
import { useAllMapVersions, useMapAreas, useMapLabel, useReopenMap, useUploadMap } from '../../features/technical/technical-hooks'
import { errorText, mapText, mapUploadFieldErrors } from '../../features/technical/technical-format'
import type { MapAreaOption, MapVersionItem } from '../../features/technical/api/technical'

/**
 * Map versions: a figure strip, the version table and the upload dialog, so the table stays the page. Nothing here
 * records a deployment check: that belongs to the robot's setup dialog, which "Gán cho robot…" opens.
 */
export default function TechnicalMapsPage() {
  const maps = useAllMapVersions()
  const [searchParams] = useSearchParams()
  const [uploading, setUploading] = useState(false)
  const [uploadArea, setUploadArea] = useState<MapAreaOption | null>(null)
  const [retiring, setRetiring] = useState<MapVersionItem | null>(null)
  const [tab, setTab] = useState<'active' | 'retired'>('active')
  // An area's row shows its newest version still in use, so retiring the newest one falls back to the one before (ADR-0041).
  const items = (maps.data ?? []).filter(item => !isRetired(item))
  const retired = (maps.data ?? []).filter(isRetired)
  const usable = items.filter((item) => item.canUseForPoiPreparation)
  const passed = usable.length
  // A version POIs can be written on but no robot holds yet: nothing on it can be checked on site (2.8).
  const usableWithoutRobot = usable.filter(item => !item.runningRobot).length
  // A robot assigned but not ready cannot run anything on the map, so the figure counts only ready ones.
  const ready = items.filter(item => item.runningRobot?.readiness.state === 'READY').length
  const unchecked = items.filter((item) => item.technicalCheckStatus === 'PENDING').length

  return (
    <TechnicalPage>
      <PageHeader
        eyebrow="Chuẩn bị"
        title="Bản đồ"
        description="Tải bản đồ lên rồi gán cho robot. Gán và kiểm tra triển khai làm trong hộp Thiết lập của robot."
        action={<button type="button" className={buttonClass('primary')} onClick={() => setUploading(true)}><Upload size={15} aria-hidden="true" />Tải lên bản đồ mới</button>}
      />

      {!maps.isPending && !maps.error && (
        <div className="mb-3">
          <StatStrip label="Tình trạng bản đồ" columns="sm:grid-cols-4">
            <StatTile icon={Layers} label="Phiên bản đã tải lên" value={items.length} />
            <StatTile icon={CircleCheck} label="Dùng được để soạn POI" value={passed} hint={usableWithoutRobot ? mapText.noRobotYet(usableWithoutRobot) : undefined} />
            <StatTile icon={Bot} label="Có robot sẵn sàng" value={ready} />
            <StatTile icon={Activity} label="Chưa từng kiểm tra triển khai" value={unchecked} tone="warn" />
          </StatStrip>
        </div>
      )}

      <div role="group" aria-label="Lọc theo tình trạng sử dụng" className="mb-3 inline-flex gap-0.5 rounded-[10px] bg-[#eef2f6] p-[3px]">
        {([['active', 'Đang dùng'], ['retired', 'Ngừng sử dụng']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tab === value ? 'bg-white text-[#173b59] shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-[#475569]'}`}>{label}{value === 'retired' && retired.length > 0 ? ` (${retired.length})` : ''}</button>)}
      </div>

      {maps.isPending ? <section className={panelClass}><p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]" aria-busy="true"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải…</p></section>
        : maps.error ? <section className={panelClass}><p role="alert" className="p-4 text-[13px] text-[#b23e31]">{errorText(maps.error)}</p></section>
        : tab === 'retired' ? <RetiredMapList items={retired} />
        : items.length ? <MapVersionTable items={items} initialMapVersionId={searchParams.get('map')} onUpload={area => { setUploadArea(area); setUploading(true) }} onRetire={setRetiring} />
        : <section className={panelClass}><EmptyState variant="empty" title={retired.length ? 'Không có bản đồ đang dùng' : 'Chưa có bản đồ'} description={retired.length ? 'Mọi phiên bản đã ngừng sử dụng. Mở lại ở tab Ngừng sử dụng hoặc tải phiên bản mới.' : 'Tải tệp bản đồ đầu tiên lên để bắt đầu.'} /></section>}

      <UploadModal key={uploadArea?.areaKey ?? 'new-area'} open={uploading} initialArea={uploadArea} onClose={() => { setUploading(false); setUploadArea(null) }} />
      {retiring && <RetireMapDialog key={retiring.map.id} map={retiring.map} onClose={() => setRetiring(null)} />}
    </TechnicalPage>
  )
}

const isRetired = (item: MapVersionItem) => item.map.status === 'RETIRED'

/** One row per retired version, newest retirement first; history stays readable and "Mở lại" lifts only the stop. */
function RetiredMapList({ items }: { items: MapVersionItem[] }) {
  const reopen = useReopenMap()
  const mapVersionLabel = useMapLabel()
  const sorted = [...items].sort((a, b) => (b.map.retiredAt ?? '').localeCompare(a.map.retiredAt ?? ''))
  if (!sorted.length) return <section className={panelClass}><EmptyState variant="empty" title="Không có phiên bản ngừng sử dụng" description="Phiên bản bị ngừng sẽ hiện ở đây, kèm lý do và người ngừng." /></section>
  return (
    <section className={panelClass} aria-label="Phiên bản bản đồ ngừng sử dụng">
      {reopen.error && <p role="alert" className="m-3 rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errorText(reopen.error)}</p>}
      <ul className="divide-y divide-[#eef1f4]">
        {sorted.map(({ map }) => <li key={map.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-[#0f172a]">{mapVersionLabel(map)}</p>
            <p className="text-[12.5px] text-[#64748b]">Ngừng {map.retiredAt ? formatDateTime(map.retiredAt) : ''}{map.retiredByName ? ` · ${map.retiredByName}` : ''}</p>
            {map.retirementReason && <p className="mt-0.5 break-words text-[13px] text-[#334155]">Lý do: {map.retirementReason}</p>}
          </div>
          <button type="button" className={`${buttonClass('secondary', 'sm')} self-start sm:self-auto`} aria-label={`Mở lại ${mapVersionLabel(map)}`} disabled={reopen.isPending} onClick={() => { reopen.reset(); reopen.mutate(map) }}>Mở lại</button>
        </li>)}
      </ul>
    </section>
  )
}

/** Lower-case ASCII slug for the area key, derived from the Vietnamese area name. */
function areaKeyFrom(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

const formatSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

function UploadModal({ open, initialArea, onClose }: { open: boolean; initialArea: MapAreaOption | null; onClose: () => void }) {
  const upload = useUploadMap()
  const areas = useMapAreas(open)
  const [mode, setMode] = useState<'new' | 'existing'>(initialArea ? 'existing' : 'new')
  const [areaKey, setAreaKey] = useState(initialArea?.areaKey ?? '')
  const [areaName, setAreaName] = useState(initialArea?.displayName ?? '')
  const [keyEdited, setKeyEdited] = useState(false)
  const [packageFile, setPackageFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const uploadErrors = upload.error ? mapUploadFieldErrors(upload.error) : {}
  const matchingArea = areas.data?.find(area => area.areaKey === areaKey)
  const duplicateNewKey = mode === 'new' && Boolean(matchingArea)
  // The server refuses a new area whose name, trimmed and ignoring case, another area has (MAP_AREA_NAME_TAKEN); say so while typing.
  const takenNameArea = mode === 'new' && areaName.trim() ? areas.data?.find(area => sameAreaName(area.displayName, areaName)) : undefined
  const areaReady = !areas.isPending && !areas.isError && (mode === 'new' ? !duplicateNewKey && !takenNameArea && Boolean(areaKey && areaName.trim()) : Boolean(matchingArea))
  const missing = !packageFile ? 'Chọn tệp bản đồ (.zip) để tải lên.' : !areaReady && !duplicateNewKey && !takenNameArea ? (mode === 'new' ? 'Nhập tên khu vực.' : 'Chọn khu vực.') : null
  const fieldChanged = () => { upload.reset(); setRequestId(crypto.randomUUID()) }
  const switchMode = (next: 'new' | 'existing') => { setMode(next); setAreaKey(''); setAreaName(''); setKeyEdited(false); fieldChanged() }
  const pickFile = (file: File | null | undefined) => { setPackageFile(file ?? null); fieldChanged() }
  const close = () => { upload.reset(); onClose() }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!packageFile || !areaReady) return
    upload.mutate({ areaKey, areaName: areaName.trim(), requestId, package: packageFile }, { onSuccess: () => {
      setPackageFile(null); setAreaKey(''); setAreaName(''); setMode('new'); setKeyEdited(false); setRequestId(crypto.randomUUID()); close()
    } })
  }
  const segment = (active: boolean) => `flex-1 cursor-pointer rounded-md px-3 py-1.5 text-center text-[13px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#2563eb] ${active ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#334155]'}`
  return (
    <Modal open={open} title={initialArea ? `Tải phiên bản mới · ${areaLabel(initialArea.displayName, initialArea.areaKey, duplicateAreaNames((areas.data ?? []).map(area => ({ areaKey: area.areaKey, name: area.displayName }))))}` : 'Tải lên bản đồ mới'} description="Sau khi tải lên, mở chi tiết bản đồ và bấm Gán cho robot." onClose={close}
      footer={<div className="flex items-center justify-end gap-3">{missing && <p className="mr-auto text-xs text-[#64748b]">{missing}</p>}<button type="button" className={buttonClass('secondary')} onClick={close}>Hủy</button><button type="submit" form="map-upload-form" className={buttonClass('primary')} disabled={!packageFile || !areaReady || upload.isPending}>{upload.isPending ? 'Đang tải…' : 'Tải lên bản đồ'}</button></div>}>
      <form id="map-upload-form" className="space-y-4" onSubmit={submit}>
        <fieldset>
          <legend className={labelClass}>Khu vực</legend>
          <div className="mt-1 flex gap-1 rounded-lg bg-[#f1f5f9] p-1">
            <label className={segment(mode === 'new')}><input className="sr-only" type="radio" name="map-area-mode" checked={mode === 'new'} onChange={() => switchMode('new')} />Khu vực mới</label>
            <label className={segment(mode === 'existing')}><input className="sr-only" type="radio" name="map-area-mode" checked={mode === 'existing'} onChange={() => switchMode('existing')} />Khu vực đã có</label>
          </div>
        </fieldset>
        {areas.isPending && <p role="status" className="text-sm text-[#64748b]">Đang tải danh sách khu vực…</p>}
        {areas.isError && <div role="alert" className="space-y-2 text-sm text-[#b23e18]"><p>{errorText(areas.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void areas.refetch()}>Tải lại danh sách khu vực</button></div>}
        {!areas.isPending && !areas.isError && mode === 'existing' && areas.data?.length === 0 && <p role="status" className="text-sm text-[#64748b]">Chưa có khu vực nào. Chọn “Khu vực mới” để tạo khu vực đầu tiên.</p>}
        {mode === 'existing' ? <div>
          <label className={labelClass} htmlFor="map-existing-area">Chọn khu vực</label>
          <select title="" id="map-existing-area" className={`${inputClass} mt-1`} required value={areaKey} disabled={areas.isPending || areas.isError || !areas.data?.length} onChange={event => { const selected = areas.data?.find(area => area.areaKey === event.target.value); setAreaKey(selected?.areaKey ?? ''); setAreaName(selected?.displayName ?? ''); fieldChanged() }}>
            <option value="">Chọn khu vực</option>{areas.data?.map(area => <option key={area.areaKey} value={area.areaKey}>{area.displayName} · {area.areaKey}</option>)}
          </select>{areaKey && <p className="mt-1 text-xs text-[#64748b]">Bản đồ sẽ được lưu thành phiên bản mới của khu vực này.</p>}
        </div> : <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <div><label className={labelClass} htmlFor="map-area-name">Tên khu vực</label><input id="map-area-name" aria-invalid={Boolean(uploadErrors.areaName) || Boolean(takenNameArea)} className={`${inputClass} mt-1`} required maxLength={150} value={areaName} onChange={event => { const value = event.target.value; setAreaName(value); if (!keyEdited) setAreaKey(areaKeyFrom(value)); fieldChanged() }} placeholder="Thư viện tầng 1" />{takenNameArea ? <p role="alert" className="mt-1 text-xs text-[#b23e18]">Đã có khu vực tên {takenNameArea.displayName} ({takenNameArea.areaKey}). Chọn Khu vực đã có hoặc đặt tên khác.</p> : uploadErrors.areaName && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{uploadErrors.areaName}</p>}</div>
          <div><label className={labelClass} htmlFor="map-area-key">Mã khu vực</label><input id="map-area-key" aria-describedby="map-area-key-help" aria-invalid={Boolean(uploadErrors.areaKey) || duplicateNewKey} className={`${inputClass} mt-1 font-mono`} required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={areaKey} onChange={event => { setAreaKey(event.target.value); setKeyEdited(true); fieldChanged() }} placeholder="thu-vien-tang-1" /><p id="map-area-key-help" className="mt-1 text-xs text-[#64748b]">Tự tạo từ tên, có thể sửa.</p></div>
          {uploadErrors.areaKey && <p role="alert" className="text-xs text-[#b23e18] sm:col-span-2">{uploadErrors.areaKey}</p>}
          {duplicateNewKey && matchingArea !== takenNameArea && <p role="alert" className="text-xs text-[#b23e18] sm:col-span-2">Mã khu vực đã tồn tại. Chuyển sang “Khu vực đã có” và chọn {matchingArea?.displayName} · {matchingArea?.areaKey}.</p>}
        </div>}
        <div>
          <span className={labelClass} id="map-package-label">Tệp bản đồ (.zip)</span>
          <label htmlFor="map-package" onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); pickFile(event.dataTransfer.files?.[0]) }}
            className={`mt-1 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#2563eb] ${uploadErrors.package ? 'border-[#e8a69c] bg-[#fff6f4]' : dragging ? 'border-[#2d719e] bg-[#eef6fc]' : packageFile ? 'border-[#b8dec9] bg-[#f3fbf6]' : 'border-[#cbd5e1] bg-[#fafbfc] hover:border-[#94a3b8]'}`}>
            <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${packageFile ? 'bg-[#dff3e8] text-[#1f7a55]' : 'bg-[#eef2f6] text-[#64748b]'}`}>{packageFile ? <FileArchive size={18} aria-hidden="true" /> : <Upload size={18} aria-hidden="true" />}</span>
            <span className="min-w-0 flex-1 text-[13px]">{packageFile ? <><span className="block truncate font-semibold text-[#0f172a]">{packageFile.name}</span><span className="text-[#64748b]">{formatSize(packageFile.size)} · bấm để chọn tệp khác</span></> : <><span className="block font-semibold text-[#334155]">Kéo thả tệp .zip vào đây</span><span className="text-[#64748b]">hoặc bấm để chọn từ máy</span></>}</span>
            <input id="map-package" aria-labelledby="map-package-label" aria-describedby="map-package-help" aria-invalid={Boolean(uploadErrors.package)} className="sr-only" required type="file" accept=".zip,application/zip" onChange={event => pickFile(event.target.files?.[0])} />
          </label>
          {uploadErrors.package && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{uploadErrors.package}</p>}
          <p id="map-package-help" className="mt-1 text-xs text-[#64748b]">Gồm 1 tệp .yaml và 1 tệp .pgm đặt ngay trong ZIP (không để trong thư mục con).</p>
        </div>
        {uploadErrors.form && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e18]">{uploadErrors.form}</p>}
      </form>
    </Modal>
  )
}
