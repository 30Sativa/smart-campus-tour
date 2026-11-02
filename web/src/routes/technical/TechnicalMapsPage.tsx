import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { Activity, CircleCheck, CircleX, FileArchive, Layers, LoaderCircle, Upload } from 'lucide-react'
import { PageHeader, StatStrip, StatTile, panelClass } from '../../components/ui/ConsolePrimitives'
import { Modal } from '../../components/ui/Drawer'
import { buttonClass, inputClass, labelClass } from '../../components/ui/ui-classes'
import { MapVersionTable } from '../../features/technical/MapVersionTable'
import { RobotPicker } from '../../features/technical/RobotPicker'
import { CheckRow, TechnicalPage } from '../../features/technical/TechnicalUi'
import { useMapAreas, useMapVersions, usePhysicalRobots, useRecordDeployment, useUploadMap } from '../../features/technical/technical-hooks'
import { errorText, mapUploadFieldErrors } from '../../features/technical/technical-format'
import type { MapAreaOption, MapVersionItem } from '../../features/technical/api/technical'

const shortSha = (sha: string) => (sha.length > 16 ? `${sha.slice(0, 8)}…${sha.slice(-4)}` : sha)

/**
 * Map versions: a figure strip, the version table, and two centered dialogs (upload a
 * package, record an on-robot check) so the table stays the page.
 */
export default function TechnicalMapsPage() {
  const maps = useMapVersions()
  const robots = usePhysicalRobots()
  const [uploading, setUploading] = useState(false)
  const [uploadArea, setUploadArea] = useState<MapAreaOption | null>(null)
  const [checking, setChecking] = useState<MapVersionItem | null>(null)
  const items = maps.data ?? []
  const passed = items.filter((item) => item.canUseForPoiPreparation).length
  const failed = items.filter((item) => item.technicalCheckStatus === 'FAILED').length
  const unchecked = items.filter((item) => item.technicalCheckStatus === 'PENDING').length

  return (
    <TechnicalPage>
      <PageHeader
        eyebrow="Bản đồ"
        title="Quản lý bản đồ"
        description="Theo dõi bản đồ đã tải lên và kết quả kiểm tra của kỹ thuật."
        action={<button type="button" className={buttonClass('primary')} onClick={() => setUploading(true)}><Upload size={15} aria-hidden="true" />Tải lên bản đồ mới</button>}
      />

      {!maps.isPending && !maps.error && (
        <div className="mb-3">
          <StatStrip label="Tình trạng bản đồ" columns="sm:grid-cols-4">
            <StatTile icon={Layers} label="Phiên bản đã tải lên" value={items.length} />
            <StatTile icon={CircleCheck} label="Đủ điều kiện tạo POI" value={passed} />
            <StatTile icon={Activity} label="Chờ kỹ thuật kiểm tra" value={unchecked} tone="warn" />
            <StatTile icon={CircleX} label="Kiểm tra chưa đạt" value={failed} tone="danger" />
          </StatStrip>
        </div>
      )}

      {maps.isPending ? <section className={panelClass}><p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]" aria-busy="true"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải…</p></section>
        : maps.error ? <section className={panelClass}><p role="alert" className="p-4 text-[13px] text-[#b23e31]">{errorText(maps.error)}</p></section>
        : items.length ? <MapVersionTable items={items} robots={robots} onUpload={area => { setUploadArea(area); setUploading(true) }} onCheck={setChecking} />
        : <section className={panelClass}><p className="px-4 py-8 text-center text-[13px] text-[#64748b]">Chưa có phiên bản bản đồ. Tải package đầu tiên lên để bắt đầu.</p></section>}

      <UploadModal key={uploadArea?.areaKey ?? 'new-area'} open={uploading} initialArea={uploadArea} onClose={() => { setUploading(false); setUploadArea(null) }} />
      <DeploymentModal key={checking?.map.id ?? 'closed'} item={checking} onClose={() => setChecking(null)} />
    </TechnicalPage>
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
  const areaReady = !areas.isPending && !areas.isError && (mode === 'new' ? !duplicateNewKey && Boolean(areaKey && areaName.trim()) : Boolean(matchingArea))
  const missing = !packageFile ? 'Chọn tệp bản đồ (.zip) để tải lên.' : !areaReady && !duplicateNewKey ? (mode === 'new' ? 'Nhập tên khu vực.' : 'Chọn khu vực.') : null
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
    <Modal open={open} title={initialArea ? `Tải phiên bản mới · ${initialArea.displayName}` : 'Tải lên bản đồ mới'} description="Sau khi tải lên, hãy nạp bản đồ lên robot và ghi kết quả kiểm tra." onClose={close}
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
            <option value="">— Chọn khu vực —</option>{areas.data?.map(area => <option key={area.areaKey} value={area.areaKey}>{area.displayName} · {area.areaKey}</option>)}
          </select>{areaKey && <p className="mt-1 text-xs text-[#64748b]">Bản đồ sẽ được lưu thành phiên bản mới của khu vực này.</p>}
        </div> : <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <div><label className={labelClass} htmlFor="map-area-name">Tên khu vực</label><input id="map-area-name" aria-invalid={Boolean(uploadErrors.areaName)} className={`${inputClass} mt-1`} required maxLength={150} value={areaName} onChange={event => { const value = event.target.value; setAreaName(value); if (!keyEdited) setAreaKey(areaKeyFrom(value)); fieldChanged() }} placeholder="Thư viện tầng 1" />{uploadErrors.areaName && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{uploadErrors.areaName}</p>}</div>
          <div><label className={labelClass} htmlFor="map-area-key">Mã khu vực</label><input id="map-area-key" aria-describedby="map-area-key-help" aria-invalid={Boolean(uploadErrors.areaKey) || duplicateNewKey} className={`${inputClass} mt-1 font-mono`} required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={areaKey} onChange={event => { setAreaKey(event.target.value); setKeyEdited(true); fieldChanged() }} placeholder="thu-vien-tang-1" /><p id="map-area-key-help" className="mt-1 text-xs text-[#64748b]">Tự tạo từ tên, có thể sửa.</p></div>
          {uploadErrors.areaKey && <p role="alert" className="text-xs text-[#b23e18] sm:col-span-2">{uploadErrors.areaKey}</p>}
          {duplicateNewKey && <p role="alert" className="text-xs text-[#b23e18] sm:col-span-2">Mã khu vực đã tồn tại. Chuyển sang “Khu vực đã có” và chọn {matchingArea?.displayName} · {matchingArea?.areaKey}.</p>}
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

function DeploymentModal({ item, onClose }: { item: MapVersionItem | null; onClose: () => void }) {
  const deployment = useRecordDeployment()
  const robots = usePhysicalRobots(Boolean(item))
  const [robotCode, setRobotCode] = useState('')
  const [note, setNote] = useState('')
  const [localizationPassed, setLocalizationPassed] = useState(false)
  const [displayPassed, setDisplayPassed] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const map = item?.map
  const selectedRobot = robots.data?.find(robot => robot.robotCode === robotCode)
  const connectionUnconfirmed = selectedRobot?.connectionStatus === 'UNCONFIRMED'
  const attemptedPass = localizationPassed && displayPassed
  const passBlocked = attemptedPass && connectionUnconfirmed
  const changed = () => { deployment.reset(); setRequestId(crypto.randomUUID()) }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!map || !robotCode || !note.trim()) return
    deployment.mutate({ mapVersionId: map.id, requestId, robotCode, packageSha256: map.packageSha256, localizationPassed, displayPassed, evidenceNote: note }, {
      onSuccess: onClose,
      onError: cause => { if (cause instanceof ApiError && cause.status === 404) void robots.refetch() },
    })
  }
  if (!map) return null
  return (
    <Modal open title={`Ghi kết quả kiểm tra · ${map.areaName} v${map.versionNumber}`} description={`Chỉ ghi khi robot đã nạp đúng tệp này (checksum ${shortSha(map.packageSha256)}).`} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={onClose}>Hủy</button><button type="submit" form="map-check-form" className={buttonClass('primary')} disabled={deployment.isPending || robots.isPending || robots.isError || !robots.data?.length || !robotCode || !note.trim() || passBlocked}>Lưu kết quả kiểm tra</button></div>}>
      <form id="map-check-form" className="space-y-3.5" onSubmit={submit}>
        <div><RobotPicker id="map-check-robot" label="Robot kiểm tra" value={robotCode} onChange={value => { setRobotCode(value); changed() }} robots={robots} emptyText="Chưa có robot vật lý được đăng ký. Cần hoàn tất cấu hình robot trước khi ghi kết quả kiểm tra." />{passBlocked && <p role="status" className="mt-1 text-sm text-[#b23e18]">Robot chưa xác nhận kết nối. Hãy bật kết nối trên robot rồi bấm Cập nhật trạng thái để lưu kết quả đạt. Nếu kiểm tra thực tế không đạt, bỏ chọn mục chưa đạt là lưu được ngay.</p>}</div>
        <div className="space-y-2"><CheckRow checked={localizationPassed} onChange={value => { setLocalizationPassed(value); changed() }}>Localization đạt</CheckRow><CheckRow checked={displayPassed} onChange={value => { setDisplayPassed(value); changed() }}>Map hiển thị đúng</CheckRow></div>
        <div><label className={labelClass} htmlFor="map-check-note">Bằng chứng kiểm tra</label><textarea id="map-check-note" rows={4} className={`${inputClass} mt-1`} required maxLength={2000} value={note} onChange={event => { setNote(event.target.value); changed() }} placeholder="Ghi nhận quan sát thực tế, sai lệch, ảnh chụp màn hình đã lưu ở đâu…" /></div>
        {deployment.error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errorText(deployment.error)}</p>}
      </form>
    </Modal>
  )
}
