import { useRef, useState } from 'react'
import { Trash2, Upload } from 'lucide-react'
import { ApiError } from '../../../api/client'
import { buttonClass } from '../../../components/ui/ui-classes'
import { FallbackVideoUploadError, isUploadedFallbackVideo, uploadFallbackVideo } from './api/fallback-video'

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading'; percent: number }
  | { kind: 'uploaded' }
  | { kind: 'error'; message: string }

function uploadError(error: unknown) {
  if (error instanceof FallbackVideoUploadError) return error.message
  if (error instanceof ApiError && error.status === 503) return 'Máy chủ chưa cấu hình Cloudinary nên chưa tải được video dự phòng.'
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return 'Phiên đăng nhập không còn quyền tải video. Đăng nhập lại rồi thử lại.'
  return 'Không chuẩn bị được lượt tải lên. Vui lòng thử lại.'
}

/**
 * ADR-0063: the Tour's fallback video, played to students through the relay while the live picture is lost. Staff
 * uploads a file straight to Cloudinary; the field keeps only the reference to save with the Tour.
 */
export function FallbackVideoField({ value, onChange, disabled = false }: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const picker = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const uploading = phase.kind === 'uploading'

  async function upload(file: File) {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setPhase({ kind: 'uploading', percent: 0 })
    try {
      const reference = await uploadFallbackVideo(file, percent => setPhase({ kind: 'uploading', percent }), controller.signal)
      onChange(reference)
      setPhase({ kind: 'uploaded' })
    } catch (error) {
      setPhase(controller.signal.aborted ? { kind: 'idle' } : { kind: 'error', message: uploadError(error) })
    }
  }

  let status: string
  if (phase.kind === 'uploading') status = `Đang tải lên… ${phase.percent}%`
  else if (phase.kind === 'error') status = phase.message
  else if (phase.kind === 'uploaded') status = 'Đã tải lên. Cloudinary cần vài phút để chuẩn bị bản phát; nhớ lưu Tour.'
  else if (!value) status = 'Chưa có. Học sinh chỉ thấy thông báo mất hình nếu livestream gặp sự cố.'
  else if (isUploadedFallbackVideo(value)) status = 'Đã có video dự phòng. Học sinh xem qua relay khi mất hình trực tiếp.'
  else status = 'Link hiện tại không phải video đã tải lên nên không phát cho học sinh. Hãy tải video lên để thay.'

  return <div className="block text-sm" role="group" aria-labelledby="fallback-video-title">
    <span id="fallback-video-title">Video dự phòng khi mất hình trực tiếp (không bắt buộc)</span>
    <input ref={picker} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo"
      className="sr-only" aria-label="Chọn tệp video dự phòng" tabIndex={-1} disabled={disabled || uploading}
      onChange={event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) void upload(file)
      }} />
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {uploading
        ? <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => abort.current?.abort()}>Hủy tải lên</button>
        : <button type="button" className={buttonClass('secondary', 'sm')} disabled={disabled} onClick={() => picker.current?.click()}>
          <Upload size={14} aria-hidden="true" />{value ? 'Thay video' : 'Tải video lên'}
        </button>}
      {value && !uploading && <button type="button" className={buttonClass('ghost', 'sm')} disabled={disabled}
        onClick={() => { onChange(''); setPhase({ kind: 'idle' }) }}>
        <Trash2 size={14} aria-hidden="true" />Bỏ video
      </button>}
    </div>
    {uploading && <progress className="mt-2 h-1.5 w-full" max={100} value={phase.percent} aria-label="Tiến độ tải video" />}
    <span role={phase.kind === 'error' ? 'alert' : 'status'}
      className={`mt-1 block text-xs ${phase.kind === 'error' ? 'text-[#b23e31]' : 'text-[#64748b]'}`}>{status}</span>
    <span className="mt-1 block text-xs text-[#64748b]">MP4/MOV/WebM tối đa 100 MB; nên xuất 720p. Video không lộ địa chỉ cho học sinh.</span>
  </div>
}
