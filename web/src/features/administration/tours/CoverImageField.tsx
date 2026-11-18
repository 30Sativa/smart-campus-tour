import { useEffect, useRef, useState } from 'react'
import { ImageIcon, Trash2, Upload } from 'lucide-react'
import { buttonClass } from '../../../components/ui/ui-classes'
import { COVER_IMAGE_TYPES, coverImageProblem } from './api/cover-image'

/**
 * The Tour's cover image, shown to School Representatives on the Tour's card. Picking a file only previews it: the
 * page uploads it after the Tour is saved, because the image is filed under the Tour's id. `currentUrl` is the image
 * the Tour already has, if any (an edit); a Tour without one shows the sample picture to Representatives.
 */
export function CoverImageField({ file, onChange, currentUrl = null, disabled = false }: {
  file: File | null
  onChange: (file: File | null) => void
  currentUrl?: string | null
  disabled?: boolean
}) {
  const picker = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // The object URL of the picked file, made when it is picked and freed when replaced or on unmount.
  const [picked, setPicked] = useState<string | null>(null)
  const pickedRef = useRef<string | null>(null)
  const [currentMissing, setCurrentMissing] = useState(false)
  useEffect(() => () => { if (pickedRef.current) URL.revokeObjectURL(pickedRef.current) }, [])
  const showPicked = (next: File | null) => {
    if (pickedRef.current) URL.revokeObjectURL(pickedRef.current)
    pickedRef.current = next ? URL.createObjectURL(next) : null
    setPicked(pickedRef.current)
  }

  const preview = file ? picked : null
  const shown = preview ?? (currentUrl && !currentMissing ? currentUrl : null)
  const status = problem ?? (file ? `Đã chọn ${file.name}. Ảnh được tải lên khi lưu Tour.`
    : shown ? 'Ảnh hiện tại của Tour. Chọn ảnh khác để thay.'
    : 'Chưa có. Đại diện trường sẽ thấy ảnh minh họa mẫu.')

  return <div className="block text-sm" role="group" aria-labelledby="cover-image-title">
    <span id="cover-image-title">Ảnh Tour (không bắt buộc)</span>
    <input ref={picker} type="file" accept={COVER_IMAGE_TYPES.join(',')} className="sr-only" aria-label="Chọn ảnh Tour" tabIndex={-1} disabled={disabled}
      onChange={event => {
        const chosen = event.target.files?.[0]
        event.target.value = ''
        if (!chosen) return
        const reason = coverImageProblem(chosen)
        setProblem(reason)
        if (!reason) { showPicked(chosen); onChange(chosen) }
      }} />
    <div className="mt-1 flex flex-wrap items-start gap-3">
      <div className="grid aspect-video w-48 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8]">
        {shown
          ? <img src={shown} alt={file ? 'Xem trước ảnh Tour đã chọn' : 'Ảnh Tour hiện tại'} className="size-full object-cover"
            onError={() => { if (!preview) setCurrentMissing(true) }} />
          : <ImageIcon size={22} aria-hidden="true" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass('secondary', 'sm')} disabled={disabled} onClick={() => picker.current?.click()}>
          <Upload size={14} aria-hidden="true" />{shown ? 'Chọn ảnh khác' : 'Chọn ảnh'}
        </button>
        {file && <button type="button" className={buttonClass('ghost', 'sm')} disabled={disabled} onClick={() => { showPicked(null); onChange(null); setProblem(null) }}>
          <Trash2 size={14} aria-hidden="true" />Bỏ ảnh đã chọn
        </button>}
      </div>
    </div>
    <span role={problem ? 'alert' : 'status'} className={`mt-1 block text-xs ${problem ? 'text-[#b23e31]' : 'text-[#64748b]'}`}>{status}</span>
    <span className="mt-1 block text-xs text-[#64748b]">JPG, PNG, WebP hoặc AVIF, tối đa 10 MB. Nên dùng ảnh ngang 16:9 (ví dụ 1200×675).</span>
  </div>
}
