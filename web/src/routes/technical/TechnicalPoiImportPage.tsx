import { useState } from 'react'
import { FileUp } from 'lucide-react'
import { PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass, labelClass } from '../../components/ui/ui-classes'
import { OCCUPANCY_MAPS } from '../../features/administration/pois/map/catalog'
import { importPoiYamlFile, type ImportedPoiPose } from '../../features/administration/pois/poi-yaml-import'
import { TechnicalPage } from '../../features/technical/TechnicalUi'

const fileName = (path: string) => path.replaceAll('\\', '/').split('/').at(-1) ?? path

/**
 * POI import from the project YAML template, bound to a map version (SRS v1.9
 * §3.2.b). The check runs in the browser with the same validator as the POI
 * form; saving needs the Technical API (proposal B7), so this page is a dry run.
 * Importing a POI is not technical validation.
 */
export default function TechnicalPoiImportPage() {
  const [mapKey, setMapKey] = useState(OCCUPANCY_MAPS[0].mapKey)
  const [result, setResult] = useState<{ file: string; pose: ImportedPoiPose } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const map = OCCUPANCY_MAPS.find((item) => item.mapKey === mapKey) ?? OCCUPANCY_MAPS[0]

  const read = async (file: File | undefined) => {
    setResult(null)
    setError(null)
    if (!file) return
    try {
      setResult({ file: file.name, pose: await importPoiYamlFile(file, map) })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không đọc được file YAML.')
    }
  }

  const template = `map_yaml: ${fileName(map.sourceYaml)}\nmap_key: ${map.mapKey}\nframe_id: ${map.frameId}\npose:\n  x: 1.25\n  y: -3.40\n  yaw: 1.5708   # radian`

  return (
    <TechnicalPage>
      <PageHeader eyebrow="Kỹ thuật" title="Import POI (YAML)" description="Kiểm tra file POI theo template của dự án, gắn với đúng version map. Import POI không phải là xác nhận kỹ thuật: POI vẫn cần kiểm tra thực tế." />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <section className={panelClass} aria-label="Kiểm tra file POI">
          <PanelHead title="Chọn version map và file" />
          <div className="space-y-4 p-5">
            <div>
              <label htmlFor="poi-import-map" className={labelClass}>Version map</label>
              <select id="poi-import-map" className={`${inputClass} mt-1.5`} value={mapKey} onChange={(event) => { setMapKey(event.target.value); setResult(null); setError(null) }}>
                {OCCUPANCY_MAPS.map((item) => <option key={item.mapKey} value={item.mapKey}>{item.mapKey} · {fileName(item.sourceYaml)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="poi-import-file" className={labelClass}>File POI (.yaml, tối đa 64 KB)</label>
              <input id="poi-import-file" type="file" accept=".yaml,.yml" className={`${inputClass} mt-1.5`} onChange={(event) => void read(event.target.files?.[0])} />
            </div>
            {error && <p role="alert" className="rounded-xl bg-[#fff1ef] px-3 py-2 text-[13px] font-semibold text-[#b23e31]">{error}</p>}
            {result && (
              <div role="status" className="rounded-xl border border-[#cde9dc] bg-[#effbf5] p-4 text-[13px] text-[#1f7a55]">
                <p className="font-bold">{result.file}: hợp lệ với {map.mapKey}</p>
                <p className="mt-1 tabular-nums">x = {result.pose.x} m · y = {result.pose.y} m · yaw = {result.pose.yaw} rad ({(result.pose.yaw * 180 / Math.PI).toFixed(1)}°)</p>
              </div>
            )}
            <button type="button" className={buttonClass('primary')} disabled aria-describedby="poi-import-save-note"><FileUp size={16} aria-hidden="true" />Lưu POI</button>
            <p id="poi-import-save-note" className="text-xs leading-5 text-[#64748b]">Lưu POI cần API kỹ thuật (đề xuất B7). Trong lúc chờ, POI vẫn được tạo ở form POI của Staff.</p>
          </div>
        </section>
        <section className={panelClass} aria-label="Template YAML">
          <PanelHead title="Template" description="Một POI mỗi file; map_yaml, map_key và frame_id phải khớp version đã chọn." />
          <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-6 text-[#334155]">{template}</pre>
        </section>
      </div>
    </TechnicalPage>
  )
}
