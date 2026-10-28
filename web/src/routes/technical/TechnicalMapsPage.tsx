import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Upload } from 'lucide-react'
import { LoadingPanel, PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass, labelClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { Drawer } from '../../features/administration/components/Drawer'
import { useTechnicalData, useUploadMapVersion } from '../../features/technical/technical-hooks'
import { Notice, TechnicalPage, ToneBadge } from '../../features/technical/TechnicalUi'
import { errorText, mapState, stamp } from '../../features/technical/technical-format'
import type { MapVersionStatus } from '../../features/technical/types'

async function shortSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`
}

function nextMapKey(maps: MapVersionStatus[]) {
  const numbers = maps.map((map) => Number(/-v(\d+)$/.exec(map.mapKey)?.[1] ?? 0))
  const prefix = maps[0]?.mapKey.replace(/-v\d+$/, '') ?? 'map'
  return `${prefix}-v${Math.max(0, ...numbers) + 1}`
}

/** Register a new map package. Upload is not deployment: the robot keeps its map until a deploy is recorded. */
function UploadDrawer({ open, maps, onClose }: { open: boolean; maps: MapVersionStatus[]; onClose: () => void }) {
  const upload = useUploadMapVersion()
  const navigate = useNavigate()
  const [file, setFile] = useState<{ name: string; size: string; checksum: string } | null>(null)
  const [reading, setReading] = useState(false)
  const [mapKey, setMapKey] = useState('')
  const [area, setArea] = useState(maps[0]?.area ?? '')
  const [changeNote, setChangeNote] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const key = mapKey || nextMapKey(maps)

  const pick = async (picked: File | undefined) => {
    setFile(null)
    setFileError(null)
    if (!picked) return
    if (!/\.zip$/i.test(picked.name)) { setFileError('Chỉ nhận gói .zip gồm map.pgm và map.yaml.'); return }
    setReading(true)
    try {
      setFile({ name: picked.name, size: `${(picked.size / 1_048_576).toFixed(1)} MB`, checksum: await shortSha256(picked) })
    } catch {
      setFileError('Không đọc được file.')
    } finally {
      setReading(false)
    }
  }
  const close = () => { setFile(null); setMapKey(''); setChangeNote(''); setFileError(null); upload.reset(); onClose() }
  const submit = () => {
    if (!file) return
    upload.mutate({ mapKey: key, area, changeNote: changeNote.trim(), fileName: file.name, packageSize: file.size, checksum: file.checksum }, {
      onSuccess: () => { close(); navigate(`/technical/maps/${key}`) },
    })
  }

  return (
    <Drawer open={open} title="Upload version map" description="Map được tạo bên ngoài web. Ở đây chỉ lưu gói map lên portal." onClose={close}
      footer={<div className="flex justify-end gap-2"><button type="button" className={buttonClass('secondary')} onClick={close}>Hủy</button><button type="button" className={buttonClass('primary')} disabled={!file || upload.isPending} onClick={submit}>{upload.isPending ? 'Đang lưu…' : 'Lưu version'}</button></div>}>
      <div className="space-y-4">
        <div>
          <label htmlFor="map-package" className={labelClass}>Gói map (.zip)</label>
          <input id="map-package" type="file" accept=".zip" className={`${inputClass} mt-1.5`} onChange={(event) => void pick(event.target.files?.[0])} />
          {reading && <p className="mt-1.5 text-xs text-[#64748b]">Đang tính checksum…</p>}
          {fileError && <p role="alert" className="mt-1.5 text-[13px] font-semibold text-[#b23e31]">{fileError}</p>}
          {file && <p className="mt-2 rounded-xl bg-[#f1f8fe] px-3 py-2 text-[13px] text-[#174b70]"><strong>{file.name}</strong> · {file.size}<br />SHA-256 <span className="font-mono">{file.checksum}</span></p>}
        </div>
        <div>
          <label htmlFor="map-key" className={labelClass}>Tên version</label>
          <input id="map-key" className={`${inputClass} mt-1.5 font-mono`} value={key} onChange={(event) => setMapKey(event.target.value.trim())} />
        </div>
        <div>
          <label htmlFor="map-area" className={labelClass}>Khu vực</label>
          <input id="map-area" className={`${inputClass} mt-1.5`} value={area} onChange={(event) => setArea(event.target.value)} />
        </div>
        <div>
          <label htmlFor="map-note" className={labelClass}>Thay đổi so với version trước</label>
          <textarea id="map-note" rows={3} className={`${inputClass} mt-1.5 resize-y`} value={changeNote} onChange={(event) => setChangeNote(event.target.value)} placeholder="Ví dụ: quét lại hành lang sau khi đổi cửa" />
        </div>
        <Notice tone="warn">Upload chưa phải deploy. Robot vẫn chạy map hiện tại cho tới khi bạn ghi deploy.</Notice>
        {upload.error && <p role="alert" className="text-[13px] font-semibold text-[#b23e31]">{errorText(upload.error)}</p>}
      </div>
    </Drawer>
  )
}

/** Map versions (SRS v1.9 §3.2.b): maps are made outside the web; here the package is stored, deployed and its localization checked. */
export default function TechnicalMapsPage() {
  const { pending, maps, routes } = useTechnicalData()
  const [params, setParams] = useSearchParams()
  const uploading = params.get('upload') === '1'
  const setUploading = (open: boolean) => setParams(open ? { upload: '1' } : {}, { replace: true })

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Kỹ thuật" title="Version map" description="Mỗi version phải được deploy đúng lên robot và đạt kiểm tra localization trước khi xác minh POI và xác nhận tuyến dùng version đó."
        action={<button type="button" className={buttonClass('primary')} onClick={() => setUploading(true)}><Upload size={16} aria-hidden="true" />Upload version map</button>} />
      {pending ? <LoadingPanel label="Đang tải version map…" /> : (
        <div className="space-y-4">
          <section className={panelClass} aria-label="Danh sách version map">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-[#f1f5f9]"><th className={thClass}>Version</th><th className={thClass}>Checksum</th><th className={thClass}>Upload</th><th className={thClass}>Deploy</th><th className={thClass}>Localization</th><th className={thClass}>Tuyến dùng</th><th className={thClass}>Trạng thái</th></tr></thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {maps.map((map) => {
                    const state = mapState(map)
                    return (
                      <tr key={map.mapKey} className={rowClass}>
                        <td className={tdClass}><Link to={`/technical/maps/${map.mapKey}`} className="font-mono font-semibold text-[#0f172a] hover:text-[#2d719e]">{map.mapKey}</Link><span className="block text-xs text-[#64748b]">{map.area}</span></td>
                        <td className={`${tdClass} font-mono text-xs text-[#64748b]`}>{map.checksum}</td>
                        <td className={`${tdClass} text-[#334155]`}>{stamp(map.uploadedAt)}<span className="block text-xs text-[#64748b]">{map.packageSize}</span></td>
                        <td className={`${tdClass} text-[#334155]`}>{map.deployedAt ? <>{map.deployedRobot}<span className="block text-xs text-[#64748b]">{stamp(map.deployedAt)}</span></> : <span className="text-[#64748b]">—</span>}</td>
                        <td className={`${tdClass} text-[#334155]`}>{map.localization ? `${map.localization.passed ? 'Đạt' : 'Không đạt'}${map.localization.errorCm != null ? ` · ${map.localization.errorCm} cm` : ''}` : <span className="text-[#64748b]">—</span>}</td>
                        <td className={`${tdClass} tabular-nums`}>{routes.filter((route) => route.mapKey === map.mapKey).length}</td>
                        <td className={tdClass}><ToneBadge tone={state.tone}>{state.label}</ToneBadge></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <Notice>Version mới có thay đổi ảnh hưởng di chuyển không thừa hưởng xác nhận cũ. Version cũ đã xác nhận vẫn dùng được cho các tuyến đang gắn với nó.</Notice>
        </div>
      )}
      {!pending && <UploadDrawer open={uploading} maps={maps} onClose={() => setUploading(false)} />}
    </TechnicalPage>
  )
}
