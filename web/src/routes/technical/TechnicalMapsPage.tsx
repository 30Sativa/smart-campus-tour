import { useState, type FormEvent } from 'react'
import { PageHeader, PanelHead, LoadingPanel, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { useMapVersions, useRecordDeployment, useUploadMap } from '../../features/technical/technical-hooks'
import { errorText, stamp } from '../../features/technical/technical-format'

export default function TechnicalMapsPage() {
  const maps = useMapVersions()
  const upload = useUploadMap()
  const deployment = useRecordDeployment()
  const [areaKey, setAreaKey] = useState('')
  const [areaName, setAreaName] = useState('')
  const [packageFile, setPackageFile] = useState<File | null>(null)
  const [deploymentMapId, setDeploymentMapId] = useState<string | null>(null)
  const [robotCode, setRobotCode] = useState('')
  const [deploymentNote, setDeploymentNote] = useState('')
  const [localizationPassed, setLocalizationPassed] = useState(false)
  const [displayPassed, setDisplayPassed] = useState(false)

  const submitUpload = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!packageFile) return
    upload.mutate({ areaKey, areaName, package: packageFile }, { onSuccess: () => { setPackageFile(null); event.currentTarget.reset() } })
  }
  const submitDeployment = (event: FormEvent<HTMLFormElement>, mapId: string, sha256: string) => {
    event.preventDefault()
    deployment.mutate({ mapVersionId: mapId, robotCode, packageSha256: sha256, localizationPassed, displayPassed, evidenceNote: deploymentNote }, {
      onSuccess: () => { setDeploymentMapId(null); setRobotCode(''); setDeploymentNote(''); setLocalizationPassed(false); setDisplayPassed(false) },
    })
  }

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Kỹ thuật" title="Version map" description="Kỹ thuật tạo map ngoài web, upload package để quản lý version và ghi nhận kiểm tra triển khai trên robot." />
      <section className={`${panelClass} mb-5`} aria-label="Upload map package">
        <PanelHead title="Thêm version map" description="Chọn package ZIP đã tạo bên ngoài web. Upload không tự triển khai map lên robot." />
        <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={submitUpload}>
          <div><label className={labelClass} htmlFor="map-area-key">Mã khu vực</label><input id="map-area-key" className={`${inputClass} mt-1.5`} required maxLength={80} pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?" value={areaKey} onChange={event => setAreaKey(event.target.value)} placeholder="library-floor-1" /></div>
          <div><label className={labelClass} htmlFor="map-area-name">Tên khu vực</label><input id="map-area-name" className={`${inputClass} mt-1.5`} required maxLength={150} value={areaName} onChange={event => setAreaName(event.target.value)} /></div>
          <div className="md:col-span-2"><label className={labelClass} htmlFor="map-package">Package map (.zip)</label><input id="map-package" className={`${inputClass} mt-1.5`} required type="file" accept=".zip,application/zip" onChange={event => setPackageFile(event.target.files?.[0] ?? null)} /></div>
          {upload.error && <p role="alert" className="md:col-span-2 text-sm text-red-700">{errorText(upload.error)}</p>}
          <div className="md:col-span-2"><button type="submit" className={buttonClass('primary')} disabled={!packageFile || upload.isPending}>{upload.isPending ? 'Đang tải…' : 'Upload version'}</button></div>
        </form>
      </section>

      <section className={panelClass} aria-label="Danh sách version map">
        <PanelHead title="Các version đã đăng ký" description="Thông tin version và lần kiểm tra triển khai gần nhất lấy từ backend." />
        {maps.isPending ? <LoadingPanel /> : maps.error ? <p role="alert" className="p-5 text-sm text-red-700">{errorText(maps.error)}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-[#f1f5f9]"><th className={thClass}>Version</th><th className={thClass}>Package</th><th className={thClass}>Checksum</th><th className={thClass}>Kiểm tra robot</th><th className={thClass}>Thao tác</th></tr></thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {maps.data?.map(({ map, latestDeployment }) => (
                  <tr key={map.id} className={rowClass}>
                    <td className={tdClass}><span className="font-mono font-semibold">{map.mapKey}</span><p className="text-xs text-[#64748b]">{map.areaName} · {map.imageWidth}×{map.imageHeight} · {map.resolution} m/px</p></td>
                    <td className={tdClass}>{map.packageFileName}<p className="text-xs text-[#64748b]">{map.frameId} · {map.validationStatus}</p></td>
                    <td className={`${tdClass} max-w-48 break-all font-mono text-xs text-[#64748b]`}>{map.packageSha256}</td>
                    <td className={tdClass}>{latestDeployment ? <><ToneBadge tone={latestDeployment.passed ? 'ok' : 'danger'}>{latestDeployment.passed ? 'Đạt' : 'Không đạt'}</ToneBadge><p className="mt-1 text-xs text-[#64748b]">{latestDeployment.robotCode} · {stamp(latestDeployment.checkedAt)}</p></> : <ToneBadge tone="warn">Chưa ghi nhận</ToneBadge>}</td>
                    <td className={tdClass}><button className={buttonClass('secondary', 'sm')} type="button" onClick={() => setDeploymentMapId(deploymentMapId === map.id ? null : map.id)}>Ghi kiểm tra</button>
                      {deploymentMapId === map.id && <form className="mt-3 min-w-64 space-y-2" onSubmit={event => submitDeployment(event, map.id, map.packageSha256)}>
                        <input className={inputClass} required maxLength={100} value={robotCode} onChange={event => setRobotCode(event.target.value)} placeholder="Mã robot vật lý" aria-label="Mã robot" />
                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={localizationPassed} onChange={event => setLocalizationPassed(event.target.checked)} />Localization đạt</label>
                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={displayPassed} onChange={event => setDisplayPassed(event.target.checked)} />Map hiển thị đúng</label>
                        <textarea className={inputClass} required maxLength={2000} value={deploymentNote} onChange={event => setDeploymentNote(event.target.value)} placeholder="Bằng chứng kiểm tra" aria-label="Bằng chứng kiểm tra" />
                        {deployment.error && <p role="alert" className="text-xs text-red-700">{errorText(deployment.error)}</p>}
                        <button className={buttonClass('primary', 'sm')} disabled={deployment.isPending} type="submit">Lưu kiểm tra</button>
                      </form>}
                    </td>
                  </tr>
                ))}
                {!maps.data?.length && <tr><td className={tdClass} colSpan={5}>Chưa có version map.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </TechnicalPage>
  )
}
