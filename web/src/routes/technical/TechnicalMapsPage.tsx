import { useState, type FormEvent } from 'react'
import { Activity, CircleCheck, CircleX, Layers, LoaderCircle, Upload } from 'lucide-react'
import { PageHeader, PanelHead, StatStrip, StatTile, panelClass } from '../../components/ui/ConsolePrimitives'
import { Drawer } from '../../components/ui/Drawer'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { CheckRow, Note, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { useMapVersions, useRecordDeployment, useUploadMap } from '../../features/technical/technical-hooks'
import { errorText, stamp } from '../../features/technical/technical-format'
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
  const passed = items.filter((item) => item.latestDeployment?.passed).length
  const failed = items.filter((item) => item.latestDeployment && !item.latestDeployment.passed).length
  const unchecked = items.filter((item) => !item.latestDeployment).length

  return (
    <TechnicalPage>
      <PageHeader
        eyebrow="Bản đồ"
        title="Version map"
        description="Map được tạo ngoài web. Ở đây lưu package từng version và ghi lại lần kiểm tra triển khai trên robot."
        action={<button type="button" className={buttonClass('primary')} onClick={() => setUploading(true)}><Upload size={15} aria-hidden="true" />Upload version map</button>}
      />

      {!maps.isPending && !maps.error && (
        <div className="mb-3">
          <StatStrip label="Tổng hợp version map" columns="sm:grid-cols-4">
            <StatTile icon={Layers} label="Version đã đăng ký" value={items.length} />
            <StatTile icon={CircleCheck} label="Kiểm tra gần nhất đạt" value={passed} />
            <StatTile icon={Activity} label="Chưa kiểm tra trên robot" value={unchecked} tone="warn" />
            <StatTile icon={CircleX} label="Kiểm tra gần nhất không đạt" value={failed} tone="danger" />
          </StatStrip>
        </div>
      )}

      <section className={panelClass} aria-label="Danh sách version map">
        <PanelHead title="Các version đã đăng ký" description="Lấy từ backend, kèm lần kiểm tra triển khai gần nhất." />
        {maps.isPending ? <p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] font-semibold text-[#64748b]" aria-busy="true"><LoaderCircle size={16} className="animate-spin text-[#2d719e]" aria-hidden="true" />Đang tải…</p> : maps.error ? <p role="alert" className="p-4 text-[13px] text-[#b23e31]">{errorText(maps.error)}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="border-b border-[#e2e8f0]"><tr><th className={thClass}>Version</th><th className={thClass}>Package</th><th className={thClass}>Checksum</th><th className={thClass}>Kiểm tra trên robot</th><th className={thClass}><span className="sr-only">Thao tác</span></th></tr></thead>
              <tbody className="divide-y divide-[#eef1f4]">
                {items.map((item) => {
                  const { map, latestDeployment } = item
                  return (
                    <tr key={map.id} className={rowClass}>
                      <td className={tdClass}><span className="font-mono font-semibold text-[#0f172a]">{map.mapKey}</span><p className="text-[11.5px] text-[#64748b]">{map.areaName} · {map.imageWidth}×{map.imageHeight} · {map.resolution} m/px</p></td>
                      <td className={tdClass}>{map.packageFileName}<p className="text-[11.5px] text-[#64748b]">{map.frameId} · {map.validationStatus} · {stamp(map.uploadedAt)}</p></td>
                      <td className={`${tdClass} font-mono text-xs text-[#64748b]`} title={map.packageSha256}>{shortSha(map.packageSha256)}</td>
                      <td className={tdClass}>{latestDeployment ? <><ToneBadge tone={latestDeployment.passed ? 'ok' : 'danger'}>{latestDeployment.passed ? 'Đạt' : 'Không đạt'}</ToneBadge><p className="mt-0.5 text-[11.5px] text-[#64748b]">{latestDeployment.robotCode} · {stamp(latestDeployment.checkedAt)}</p></> : <ToneBadge tone="warn">Chưa ghi nhận</ToneBadge>}</td>
                      <td className={`${tdClass} text-right`}><button className={buttonClass('secondary', 'sm')} type="button" onClick={() => setChecking(item)}>Ghi kiểm tra</button></td>
                    </tr>
                  )
                })}
                {!items.length && <tr><td className={`${tdClass} py-8 text-center text-[#64748b]`} colSpan={5}>Chưa có version map. Upload package đầu tiên để bắt đầu.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="mt-3"><Note>Upload chỉ lưu package. Robot chỉ dùng version mới sau khi bạn nạp file lên robot và ghi kiểm tra đạt.</Note></div>

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
  const close = () => { upload.reset(); onClose() }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!packageFile) return
    upload.mutate({ areaKey, areaName, package: packageFile }, { onSuccess: () => { setPackageFile(null); setAreaKey(''); setAreaName(''); close() } })
  }
  return (
    <Drawer open={open} title="Upload version map" description="Chọn package ZIP đã tạo bên ngoài web. Upload không tự triển khai map lên robot." onClose={close}
      footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={close}>Hủy</button><button type="submit" form="map-upload-form" className={buttonClass('primary')} disabled={!packageFile || upload.isPending}>{upload.isPending ? 'Đang tải…' : 'Upload version'}</button></div>}>
      <form id="map-upload-form" className="space-y-3.5" onSubmit={submit}>
        <div><label className={labelClass} htmlFor="map-area-key">Mã khu vực</label><input id="map-area-key" className={`${inputClass} mt-1`} required maxLength={80} pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?" value={areaKey} onChange={(event) => setAreaKey(event.target.value)} placeholder="library-floor-1" /></div>
        <div><label className={labelClass} htmlFor="map-area-name">Tên khu vực</label><input id="map-area-name" className={`${inputClass} mt-1`} required maxLength={150} value={areaName} onChange={(event) => setAreaName(event.target.value)} /></div>
        <div><label className={labelClass} htmlFor="map-package">Package map (.zip)</label><input id="map-package" className={`${inputClass} mt-1`} required type="file" accept=".zip,application/zip" onChange={(event) => setPackageFile(event.target.files?.[0] ?? null)} /></div>
        {upload.error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errorText(upload.error)}</p>}
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
        <div><label className={labelClass} htmlFor="map-check-note">Bằng chứng kiểm tra</label><textarea id="map-check-note" rows={4} className={`${inputClass} mt-1`} required maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Điểm đo, sai lệch, ảnh chụp màn hình đã lưu ở đâu…" /></div>
        {deployment.error && <p role="alert" className="rounded-lg bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{errorText(deployment.error)}</p>}
      </form>
    </Drawer>
  )
}
