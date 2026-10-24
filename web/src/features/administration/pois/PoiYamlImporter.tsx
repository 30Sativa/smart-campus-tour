import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { buttonClass } from '../../../components/ui/ui-classes'
import type { OccupancyMap } from './map/catalog'
import { importPoiYamlFile, type ImportedPoiPose } from './poi-yaml-import'

type Props = {
  map: OccupancyMap | null
  disabled: boolean
  onImport: (pose: ImportedPoiPose) => void
  onReadingChange: (reading: boolean) => void
}

export function PoiYamlImporter({ map, disabled, onImport, onReadingChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const request = useRef(0)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importedFile, setImportedFile] = useState<string | null>(null)

  useEffect(() => () => {
    request.current += 1
    onReadingChange(false)
  }, [onReadingChange])

  const read = async (file: File | undefined) => {
    if (!file || disabled || !map) return
    const currentRequest = ++request.current
    setReading(true)
    onReadingChange(true)
    setError(null)
    setImportedFile(null)
    try {
      const pose = await importPoiYamlFile(file, map)
      if (currentRequest !== request.current) return
      onImport(pose)
      setImportedFile(file.name)
    } catch (failure) {
      if (currentRequest !== request.current) return
      setError(failure instanceof Error ? failure.message : 'Không đọc được file YAML. Hãy chọn lại file.')
    } finally {
      if (currentRequest === request.current) {
        setReading(false)
        onReadingChange(false)
      }
    }
  }

  return (
    <div className="mb-4 space-y-2 border-b border-[#e2e8f0] pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#173b59]">Có file POI từ robot?</p>
          <p className="mt-1 text-xs leading-5 text-[#647b8d]">Nhập .yaml / .yml (tối đa 64 KB) để điền X, Y và yaw vào bản nháp.</p>
        </div>
        <button type="button" disabled={disabled || !map} onClick={() => inputRef.current?.click()} className={buttonClass('secondary', 'sm')}>
          <Upload size={15} aria-hidden="true" />{reading ? 'Đang đọc YAML…' : 'Nhập file YAML'}
        </button>
        <input ref={inputRef} type="file" accept=".yaml,.yml" aria-label="Chọn file POI YAML" disabled={disabled || !map} className="sr-only" onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          void read(file)
        }} />
      </div>
      <p className="text-xs leading-5 text-[#647b8d]">{map
        ? `Giữ bản đồ ${map.mapKey}, frame ${map.frameId}. Tên map_yaml không xác định phiên bản; hãy kiểm tra đúng bản đồ trước khi lưu.`
        : 'Chọn bản đồ có ảnh tương ứng để đối chiếu map_yaml và frame_id trước khi nhập file.'}</p>
      {reading && <p role="status" className="text-xs text-[#54738a]">Đang đọc file trên thiết bị…</p>}
      {error && <p role="alert" className="text-xs leading-5 text-[#b23e31]">{error} Tọa độ đang có được giữ nguyên.</p>}
      {importedFile && <p role="status" className="text-xs leading-5 text-[#2f7a5b]">Đã điền tọa độ từ {importedFile}. Chưa lưu; kiểm tra số và vị trí trên bản đồ trước khi tiếp tục. Tên và nội dung POI được giữ nguyên.</p>}
    </div>
  )
}
