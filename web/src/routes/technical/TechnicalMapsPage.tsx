import { useState, type FormEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { ApiError } from '../../api/client'
import { Activity, CircleCheck, CircleX, Layers, LoaderCircle, Upload } from 'lucide-react'
import { PageHeader, PanelHead, StatStrip, StatTile, panelClass } from '../../components/ui/ConsolePrimitives'
import { Drawer } from '../../components/ui/Drawer'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { CheckRow, Note, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { useMapAreas, useMapVersions, usePhysicalRobots, useRecordDeployment, useUploadMap } from '../../features/technical/technical-hooks'
import { errorText, mapUploadFieldErrors, stamp } from '../../features/technical/technical-format'
import type { MapAreaOption, MapVersionItem, PhysicalRobotConnectionStatus } from '../../features/technical/api/technical'

const shortSha = (sha: string) => (sha.length > 16 ? `${sha.slice(0, 8)}…${sha.slice(-4)}` : sha)
const connectionStatusLabel = (status: PhysicalRobotConnectionStatus) => ({
  UNCONFIRMED: 'Chưa xác nhận kết nối',
  CONNECTED: 'Đã xác nhận · Đang kết nối',
  DISCONNECTED: 'Đã xác nhận · Mất kết nối',
  AWAITING_DATA: 'Đã xác nhận · Chưa nhận dữ liệu',
})[status]

/**
 * Map versions: a figure strip, the version table, and two drawers (upload a
 * package, record an on-robot check) so the table stays the page.
 */
export default function TechnicalMapsPage() {
  const maps = useMapVersions()
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

      <section className={panelClass} aria-label="Danh sách phiên bản bản đồ">
        <PanelHead title="Danh sách phiên bản bản đồ" description="Trạng thái tệp, kết quả kỹ thuật và điều kiện tạo POI được tính theo cùng quy tắc." />
        {maps.isPending ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]" aria-busy="true"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải…</p> : maps.error ? <p role="alert" className="p-4 text-[13px] text-[#b23e31]">{errorText(maps.error)}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left">
              <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Khu vực</th><th className={thClass}>Mã khu vực</th><th className={thClass}>Phiên bản</th><th className={thClass}>Tệp</th><th className={thClass}>Tình trạng tệp</th><th className={thClass}>Kiểm tra kỹ thuật</th><th className={thClass}>Điều kiện tạo POI</th><th className={thClass}><span className="sr-only">Thao tác</span></th></tr></thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {items.map((item) => {
                  const { map, preparationEvidence } = item
                  return (
                    <tr key={map.id} className={rowClass}>
                      <td className={tdClass}>{map.areaName}</td>
                      <td className={`${tdClass} font-mono`}>{map.areaKey}</td>
                      <td className={`${tdClass} font-mono`}>v{map.versionNumber}</td>
                      <td className={tdClass}>{map.packageFileName}<details className="mt-1 text-[11.5px] text-[#64748b]"><summary className="cursor-pointer">Chi tiết package</summary><p className="mt-1 font-mono" title={map.packageSha256}>SHA-256 {map.packageSha256}</p><p>{map.imageWidth}×{map.imageHeight} · {map.resolution} m/ô · {map.frameId}</p></details></td>
                      <td className={tdClass}><ToneBadge tone={map.validationStatus === 'VALID' ? 'ok' : 'danger'}>{map.validationStatus === 'VALID' ? 'Tệp hợp lệ' : 'Tệp không hợp lệ'}</ToneBadge><p className="mt-0.5 text-[11.5px] text-[#64748b]">{stamp(map.uploadedAt)}</p></td>
                      <td className={tdClass}>{preparationEvidence ? <><ToneBadge tone={item.technicalCheckStatus === 'PASSED' ? 'ok' : 'danger'}>{item.technicalCheckStatus === 'PASSED' ? 'Đạt' : 'Không đạt'}</ToneBadge><p className="mt-0.5 text-[11.5px] text-[#64748b]">{preparationEvidence.robotCode} · {stamp(preparationEvidence.checkedAt)}</p></> : <ToneBadge tone="warn">Chưa có kết quả kiểm tra</ToneBadge>}</td>
                      <td className={tdClass}><ToneBadge tone={item.canUseForPoiPreparation ? 'ok' : 'warn'}>{item.canUseForPoiPreparation ? 'Đã có kiểm tra kỹ thuật đạt' : item.technicalCheckStatus === 'FAILED' ? 'Kiểm tra chưa đạt' : 'Chờ kỹ thuật kiểm tra'}</ToneBadge>{item.preparationBlockReason && <p className="mt-0.5 text-[11.5px] text-[#64748b]">{item.preparationBlockReason}</p>}</td>
                      <td className={`${tdClass} text-right`}><div className="flex justify-end gap-2"><button className={buttonClass('secondary', 'sm')} type="button" onClick={() => { setUploadArea({ areaKey: map.areaKey, displayName: map.areaName }); setUploading(true) }}>Tải phiên bản mới</button><button className={buttonClass('secondary', 'sm')} type="button" onClick={() => setChecking(item)}>Ghi kết quả kiểm tra</button></div></td>
                    </tr>
                  )
                })}
                {!items.length && <tr><td className={`${tdClass} py-8 text-center text-[#64748b]`} colSpan={8}>Chưa có phiên bản bản đồ. Tải package đầu tiên lên để bắt đầu.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="mt-3"><Note>Tải lên chỉ lưu bản đồ trên hệ thống. Kỹ thuật cần nạp đúng phiên bản lên robot, kiểm tra và ghi kết quả tại đây. Web không tự nạp bản đồ lên robot.</Note></div>

      <UploadDrawer key={uploadArea?.areaKey ?? 'new-area'} open={uploading} initialArea={uploadArea} onClose={() => { setUploading(false); setUploadArea(null) }} />
      <DeploymentDrawer key={checking?.map.id ?? 'closed'} item={checking} onClose={() => setChecking(null)} />
    </TechnicalPage>
  )
}

function UploadDrawer({ open, initialArea, onClose }: { open: boolean; initialArea: MapAreaOption | null; onClose: () => void }) {
  const upload = useUploadMap()
  const areas = useMapAreas(open)
  const [mode, setMode] = useState<'new' | 'existing'>(initialArea ? 'existing' : 'new')
  const [areaKey, setAreaKey] = useState(initialArea?.areaKey ?? '')
  const [areaName, setAreaName] = useState(initialArea?.displayName ?? '')
  const [packageFile, setPackageFile] = useState<File | null>(null)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const uploadErrors = upload.error ? mapUploadFieldErrors(upload.error) : {}
  const matchingArea = areas.data?.find(area => area.areaKey === areaKey)
  const duplicateNewKey = mode === 'new' && Boolean(matchingArea)
  const areaReady = !areas.isPending && !areas.isError && (mode === 'new' ? !duplicateNewKey : Boolean(matchingArea))
  const fieldChanged = () => { upload.reset(); setRequestId(crypto.randomUUID()) }
  const close = () => { upload.reset(); onClose() }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!packageFile || !areaReady) return
    upload.mutate({ areaKey, areaName, requestId, package: packageFile }, { onSuccess: () => {
      setPackageFile(null); setAreaKey(''); setAreaName(''); setMode('new'); setRequestId(crypto.randomUUID()); close()
    } })
  }
  return (
    <Drawer open={open} title="Tải lên bản đồ mới" description="Tải package ZIP lên hệ thống. Tệp hợp lệ chưa có nghĩa là bản đồ đã được kỹ thuật kiểm tra." onClose={close}
      footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={close}>Hủy</button><button type="submit" form="map-upload-form" className={buttonClass('primary')} disabled={!packageFile || !areaReady || upload.isPending}>{upload.isPending ? 'Đang tải…' : 'Tải lên bản đồ'}</button></div>}>
      <form id="map-upload-form" className="space-y-3.5" onSubmit={submit}>
        <fieldset className="grid gap-2 sm:grid-cols-2"><legend className={labelClass}>Khu vực</legend>
          <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="radio" name="map-area-mode" checked={mode === 'new'} onChange={() => { setMode('new'); setAreaKey(''); setAreaName(''); fieldChanged() }} />Khu vực mới</label>
          <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="radio" name="map-area-mode" checked={mode === 'existing'} onChange={() => { setMode('existing'); setAreaKey(''); setAreaName(''); fieldChanged() }} />Khu vực đã có</label>
        </fieldset>
        {areas.isPending && <p role="status" className="text-sm text-[#64748b]">Đang tải danh sách khu vực…</p>}
        {areas.isError && <div role="alert" className="space-y-2 text-sm text-[#b23e18]"><p>{errorText(areas.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void areas.refetch()}>Tải lại danh sách khu vực</button></div>}
        {!areas.isPending && !areas.isError && mode === 'existing' && areas.data?.length === 0 && <p role="status" className="text-sm text-[#64748b]">Chưa có khu vực. Chọn “Khu vực mới” để tạo khu vực đầu tiên.</p>}
        {mode === 'existing' ? <div>
          <label className={labelClass} htmlFor="map-existing-area">Chọn khu vực</label>
          <select id="map-existing-area" className={`${inputClass} mt-1`} required value={areaKey} disabled={areas.isPending || areas.isError || !areas.data?.length} onChange={event => { const selected = areas.data?.find(area => area.areaKey === event.target.value); setAreaKey(selected?.areaKey ?? ''); setAreaName(selected?.displayName ?? ''); fieldChanged() }}>
            <option value="">— Chọn khu vực —</option>{areas.data?.map(area => <option key={area.areaKey} value={area.areaKey}>{area.displayName} · {area.areaKey}</option>)}
          </select>{areaKey && <p className="mt-1 text-xs text-[#64748b]">Mã và tên khu vực đã lưu được giữ nguyên.</p>}
        </div> : <>
          <div><label className={labelClass} htmlFor="map-area-key">Mã khu vực</label><input id="map-area-key" aria-describedby="map-area-key-help" aria-invalid={Boolean(uploadErrors.areaKey) || duplicateNewKey} className={`${inputClass} mt-1`} required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={areaKey} onChange={event => { setAreaKey(event.target.value); fieldChanged() }} placeholder="library-floor-1" />{uploadErrors.areaKey && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{uploadErrors.areaKey}</p>}{duplicateNewKey && <p role="alert" className="mt-1 text-xs text-[#b23e18]">Mã khu vực đã tồn tại. Chuyển sang “Khu vực đã có” và chọn {matchingArea?.displayName} · {matchingArea?.areaKey}.</p>}<p id="map-area-key-help" className="mt-1 text-xs text-[#64748b]">Chữ thường không dấu, số và dấu gạch nối; bắt đầu/kết thúc bằng chữ hoặc số.</p></div>
          <div><label className={labelClass} htmlFor="map-area-name">Tên khu vực</label><input id="map-area-name" aria-invalid={Boolean(uploadErrors.areaName)} className={`${inputClass} mt-1`} required maxLength={150} value={areaName} onChange={event => { setAreaName(event.target.value); fieldChanged() }} />{uploadErrors.areaName && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{uploadErrors.areaName}</p>}</div>
        </>}
        <div><label className={labelClass} htmlFor="map-package">Package map (.zip)</label><input id="map-package" aria-describedby="map-package-help" aria-invalid={Boolean(uploadErrors.package)} className={`${inputClass} mt-1`} required type="file" accept=".zip,application/zip" onChange={event => { setPackageFile(event.target.files?.[0] ?? null); fieldChanged() }} />{uploadErrors.package && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{uploadErrors.package}</p>}<p id="map-package-help" className="mt-1 text-xs text-[#64748b]">ZIP chứa trực tiếp một file ROS YAML và một file PGM được YAML tham chiếu; không đặt trong thư mục con.</p></div>
        {uploadErrors.form && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e18]">{uploadErrors.form}</p>}
        <Note tone="warn">Tải lên chỉ lưu map trên hệ thống. Kết quả kiểm tra là ghi nhận kiểm tra đã thực hiện; web không tự nạp map hoặc điều khiển robot.</Note>
      </form>
    </Drawer>
  )
}

function DeploymentDrawer({ item, onClose }: { item: MapVersionItem | null; onClose: () => void }) {
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
  if (!map) return <Drawer open={false} title="Kiểm tra bản đồ" onClose={onClose}><div /></Drawer>
  return (
    <Drawer open title={`Kiểm tra ${map.mapKey} trên robot`} description={`Checksum ${shortSha(map.packageSha256)}. Chỉ ghi khi robot đã nạp đúng package này.`} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={onClose}>Hủy</button><button type="submit" form="map-check-form" className={buttonClass('primary')} disabled={deployment.isPending || robots.isPending || robots.isError || !robots.data?.length || !robotCode || !note.trim() || passBlocked}>Lưu kết quả kiểm tra</button></div>}>
      <form id="map-check-form" className="space-y-3.5" onSubmit={submit}>
        <div><div className="flex items-end justify-between gap-2"><label className={labelClass} htmlFor="map-check-robot">Robot kiểm tra</label>{!robots.isPending && !robots.isError && <button type="button" className={buttonClass('secondary', 'sm')} disabled={robots.isFetching} onClick={() => void robots.refetch()}><RefreshCw size={13} aria-hidden="true" />{robots.isFetching ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}</button>}</div><select id="map-check-robot" className={`${inputClass} mt-1`} required value={robotCode} disabled={robots.isPending || robots.isError || !robots.data?.length} onChange={event => { setRobotCode(event.target.value); changed() }}><option value="">— Chọn robot vật lý —</option>{robots.data?.map(robot => { const status = connectionStatusLabel(robot.connectionStatus); return <option key={robot.id} value={robot.robotCode}>{robot.displayName ? `${robot.displayName} · ` : ''}{robot.robotCode} · {status}</option> })}</select>{robots.isPending && <p role="status" className="mt-1 text-sm text-[#64748b]">Đang tải danh sách robot…</p>}{robots.isError && <div role="alert" className="mt-1 text-sm text-[#b23e18]"><p>{errorText(robots.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void robots.refetch()}>Tải lại danh sách robot</button></div>}{!robots.isPending && !robots.isError && robots.data?.length === 0 && <div role="status" className="mt-1 text-sm text-[#b23e18]"><p>Chưa có robot vật lý được đăng ký. Cần hoàn tất cấu hình robot trước khi ghi kết quả kiểm tra.</p><Link className="mt-1 inline-block font-semibold text-[#1d4ed8] underline" to="/technical/robots">Đăng ký robot</Link></div>}{passBlocked && <p role="status" className="mt-1 text-sm text-[#b23e18]">Robot chưa xác nhận kết nối. Hãy chạy bridge Fleet Sync bằng khóa hiện tại trước khi ghi PASS; bạn vẫn có thể ghi FAIL sau khi quan sát thực tế.</p>}</div>
        <div className="space-y-2"><CheckRow checked={localizationPassed} onChange={value => { setLocalizationPassed(value); changed() }}>Localization đạt</CheckRow><CheckRow checked={displayPassed} onChange={value => { setDisplayPassed(value); changed() }}>Map hiển thị đúng</CheckRow></div>
        <div><label className={labelClass} htmlFor="map-check-note">Bằng chứng kiểm tra</label><textarea id="map-check-note" rows={4} className={`${inputClass} mt-1`} required maxLength={2000} value={note} onChange={event => { setNote(event.target.value); changed() }} placeholder="Ghi nhận quan sát thực tế, sai lệch, ảnh chụp màn hình đã lưu ở đâu…" /></div>
        {deployment.error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errorText(deployment.error)}</p>}
        <Note tone="warn">Lưu kết quả là ghi nhận kiểm tra đã thực hiện. Hệ thống không tự nạp map hoặc điều khiển robot.</Note>
      </form>
    </Drawer>
  )
}
