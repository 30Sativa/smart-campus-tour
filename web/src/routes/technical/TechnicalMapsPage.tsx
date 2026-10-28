import { useState, type FormEvent } from 'react'
import { Activity, CircleCheck, CircleX, Layers, LoaderCircle, Upload } from 'lucide-react'
import { PageHeader, PanelHead, StatStrip, StatTile, panelClass } from '../../components/ui/ConsolePrimitives'
import { Drawer } from '../../components/ui/Drawer'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { CheckRow, Note, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { useMapVersions, useRecordDeployment, useUploadMap } from '../../features/technical/technical-hooks'
import { errorText, mapUploadFieldErrors, stamp } from '../../features/technical/technical-format'
import type { MapVersionItem } from '../../features/technical/api/technical'

const shortSha = (sha: string) => (sha.length > 16 ? `${sha.slice(0, 8)}…${sha.slice(-4)}` : sha)

/**
 * Map versions: a figure strip, the version table, and two drawers (upload a
 * package, record an on-robot check) so the table stays the page.
 */
export default function TechnicalMapsPage() {
  const maps = useMapVersions()
  const [uploading, setUploading] = useState(false)
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
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Phiên bản</th><th className={thClass}>Tệp</th><th className={thClass}>Tình trạng tệp</th><th className={thClass}>Kiểm tra kỹ thuật</th><th className={thClass}>Điều kiện tạo POI</th><th className={thClass}><span className="sr-only">Thao tác</span></th></tr></thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {items.map((item) => {
                  const { map, preparationEvidence } = item
                  return (
                    <tr key={map.id} className={rowClass}>
                      <td className={tdClass}><span className="font-mono font-semibold text-[#0f172a]">{map.mapKey}</span><p className="text-[11.5px] text-[#64748b]">{map.areaName} · v{map.versionNumber}</p></td>
                      <td className={tdClass}>{map.packageFileName}<details className="mt-1 text-[11.5px] text-[#64748b]"><summary className="cursor-pointer">Chi tiết package</summary><p className="mt-1 font-mono" title={map.packageSha256}>SHA-256 {map.packageSha256}</p><p>{map.imageWidth}×{map.imageHeight} · {map.resolution} m/ô · {map.frameId}</p></details></td>
                      <td className={tdClass}><ToneBadge tone={map.validationStatus === 'VALID' ? 'ok' : 'danger'}>{map.validationStatus === 'VALID' ? 'Tệp hợp lệ' : 'Tệp không hợp lệ'}</ToneBadge><p className="mt-0.5 text-[11.5px] text-[#64748b]">{stamp(map.uploadedAt)}</p></td>
                      <td className={tdClass}>{preparationEvidence ? <><ToneBadge tone={item.technicalCheckStatus === 'PASSED' ? 'ok' : 'danger'}>{item.technicalCheckStatus === 'PASSED' ? 'Đạt' : 'Không đạt'}</ToneBadge><p className="mt-0.5 text-[11.5px] text-[#64748b]">{preparationEvidence.robotCode} · {stamp(preparationEvidence.checkedAt)}</p></> : <ToneBadge tone="warn">Chưa có kết quả kiểm tra</ToneBadge>}</td>
                      <td className={tdClass}><ToneBadge tone={item.canUseForPoiPreparation ? 'ok' : 'warn'}>{item.canUseForPoiPreparation ? 'Đã có kiểm tra kỹ thuật đạt' : item.technicalCheckStatus === 'FAILED' ? 'Kiểm tra chưa đạt' : 'Chờ kỹ thuật kiểm tra'}</ToneBadge>{item.preparationBlockReason && <p className="mt-0.5 text-[11.5px] text-[#64748b]">{item.preparationBlockReason}</p>}</td>
                      <td className={`${tdClass} text-right`}><button className={buttonClass('secondary', 'sm')} type="button" onClick={() => setChecking(item)}>Ghi kết quả kiểm tra</button></td>
                    </tr>
                  )
                })}
                {!items.length && <tr><td className={`${tdClass} py-8 text-center text-[#64748b]`} colSpan={6}>Chưa có phiên bản bản đồ. Tải package đầu tiên lên để bắt đầu.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="mt-3"><Note>Tải lên chỉ lưu bản đồ trên hệ thống. Kỹ thuật cần nạp đúng phiên bản lên robot, kiểm tra và ghi kết quả tại đây. Web không tự nạp bản đồ lên robot.</Note></div>

      <UploadDrawer open={uploading} onClose={() => setUploading(false)} />
      {checking && <DeploymentDrawer item={checking} onClose={() => setChecking(null)} />}
    </TechnicalPage>
  )
}

function UploadDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const upload = useUploadMap()
  const [areaKey, setAreaKey] = useState('')
  const [areaName, setAreaName] = useState('')
  const [packageFile, setPackageFile] = useState<File | null>(null)
  const uploadErrors = upload.error ? mapUploadFieldErrors(upload.error) : {}
  const fieldChanged = () => upload.reset()
  const close = () => { upload.reset(); onClose() }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!packageFile) return
    upload.mutate({ areaKey, areaName, package: packageFile }, { onSuccess: () => { setPackageFile(null); setAreaKey(''); setAreaName(''); close() } })
  }
  return (
    <Drawer open={open} title="Tải lên bản đồ mới" description="Tải package ZIP lên hệ thống. Tệp hợp lệ chưa có nghĩa là bản đồ đã được kỹ thuật kiểm tra." onClose={close}
      footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={close}>Hủy</button><button type="submit" form="map-upload-form" className={buttonClass('primary')} disabled={!packageFile || upload.isPending}>{upload.isPending ? 'Đang tải…' : 'Tải lên bản đồ'}</button></div>}>
      <form id="map-upload-form" className="space-y-3.5" onSubmit={submit}>
        <div><label className={labelClass} htmlFor="map-area-key">Mã khu vực</label><input id="map-area-key" aria-describedby="map-area-key-help" aria-invalid={Boolean(uploadErrors.areaKey)} className={`${inputClass} mt-1`} required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={areaKey} onChange={(event) => { setAreaKey(event.target.value); fieldChanged() }} placeholder="library-floor-1" />{uploadErrors.areaKey && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{uploadErrors.areaKey}</p>}<p id="map-area-key-help" className="mt-1 text-xs text-[#64748b]">Chữ thường không dấu, số và dấu gạch nối; bắt đầu/kết thúc bằng chữ hoặc số.</p></div>
        <div><label className={labelClass} htmlFor="map-area-name">Tên khu vực</label><input id="map-area-name" aria-invalid={Boolean(uploadErrors.areaName)} className={`${inputClass} mt-1`} required maxLength={150} value={areaName} onChange={(event) => { setAreaName(event.target.value); fieldChanged() }} />{uploadErrors.areaName && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{uploadErrors.areaName}</p>}</div>
        <div><label className={labelClass} htmlFor="map-package">Package map (.zip)</label><input id="map-package" aria-describedby="map-package-help" aria-invalid={Boolean(uploadErrors.package)} className={`${inputClass} mt-1`} required type="file" accept=".zip,application/zip" onChange={(event) => { setPackageFile(event.target.files?.[0] ?? null); fieldChanged() }} />{uploadErrors.package && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{uploadErrors.package}</p>}<p id="map-package-help" className="mt-1 text-xs text-[#64748b]">ZIP chứa trực tiếp một file ROS YAML và một file PGM được YAML tham chiếu; không đặt trong thư mục con.</p></div>
        {uploadErrors.form && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e18]">{uploadErrors.form}</p>}
        <Note tone="warn">Robot vẫn chạy map hiện tại cho tới khi bạn nạp package mới và ghi kiểm tra.</Note>
      </form>
    </Drawer>
  )
}

function DeploymentDrawer({ item, onClose }: { item: MapVersionItem; onClose: () => void }) {
  const deployment = useRecordDeployment()
  const [robotCode, setRobotCode] = useState('')
  const [note, setNote] = useState('')
  const [localizationPassed, setLocalizationPassed] = useState(false)
  const [displayPassed, setDisplayPassed] = useState(false)
  const { map } = item
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    deployment.mutate({ mapVersionId: map.id, robotCode, packageSha256: map.packageSha256, localizationPassed, displayPassed, evidenceNote: note }, { onSuccess: onClose })
  }
  return (
    <Drawer open title={`Kiểm tra ${map.mapKey} trên robot`} description={`Checksum ${shortSha(map.packageSha256)}. Chỉ ghi khi robot đã nạp đúng package này.`} onClose={onClose}
      footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={onClose}>Hủy</button><button type="submit" form="map-check-form" className={buttonClass('primary')} disabled={deployment.isPending}>Lưu kiểm tra</button></div>}>
      <form id="map-check-form" className="space-y-3.5" onSubmit={submit}>
        <div><label className={labelClass} htmlFor="map-check-robot">Mã robot</label><input id="map-check-robot" className={`${inputClass} mt-1`} required maxLength={100} value={robotCode} onChange={(event) => setRobotCode(event.target.value)} placeholder="Mã robot vật lý" /></div>
        <div className="space-y-2">
          <CheckRow checked={localizationPassed} onChange={setLocalizationPassed}>Localization đạt</CheckRow>
          <CheckRow checked={displayPassed} onChange={setDisplayPassed}>Map hiển thị đúng</CheckRow>
        </div>
        <div><label className={labelClass} htmlFor="map-check-note">Bằng chứng kiểm tra</label><textarea id="map-check-note" rows={4} className={`${inputClass} mt-1`} required maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi nhận quan sát thực tế, sai lệch, ảnh chụp màn hình đã lưu ở đâu…" /></div>
        {deployment.error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errorText(deployment.error)}</p>}
      </form>
    </Drawer>
  )
}
