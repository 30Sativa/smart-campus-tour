import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Timer, Trash2, Upload } from 'lucide-react'
import { ApiError } from '../../../api/client'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { FallbackVideoUploadError, isUploadedFallbackVideo, uploadFallbackVideo } from './api/fallback-video'
import { emptyMarkDraft, formatMark, parseMark, type MarkDraft, type MarkStop } from './fallback-video-marks'

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
export function FallbackVideoField({ value, onChange, disabled = false, stops, marks, onMarksChange }: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /** ADR-0075 stage 2: the route's stops, each taking the second the recording reaches it. Without them, no marks. */
  stops?: MarkStop[]
  marks?: MarkDraft
  onMarksChange?: Dispatch<SetStateAction<MarkDraft>>
}) {
  const picker = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const uploading = phase.kind === 'uploading'
  // The file just uploaded, played here so Staff can find where each stop starts; the uploaded copy is never shown.
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const markable = Boolean(value && stops && stops.length > 0 && marks && onMarksChange)

  async function upload(file: File) {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setPhase({ kind: 'uploading', percent: 0 })
    try {
      const reference = await uploadFallbackVideo(file, percent => setPhase({ kind: 'uploading', percent }), controller.signal)
      onChange(reference)
      onMarksChange?.(emptyMarkDraft)
      setPreview(typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null)
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
        onClick={() => { onChange(''); onMarksChange?.(emptyMarkDraft); setPreview(null); setPhase({ kind: 'idle' }) }}>
        <Trash2 size={14} aria-hidden="true" />Bỏ video
      </button>}
    </div>
    {uploading && <progress className="mt-2 h-1.5 w-full" max={100} value={phase.percent} aria-label="Tiến độ tải video" />}
    <span role={phase.kind === 'error' ? 'alert' : 'status'}
      className={`mt-1 block text-xs ${phase.kind === 'error' ? 'text-[#b23e31]' : 'text-[#64748b]'}`}>{status}</span>
    <span className="mt-1 block text-xs text-[#64748b]">MP4/MOV/WebM tối đa 100 MB; nên xuất 720p. Video không lộ địa chỉ cho học sinh.</span>
    {markable && <FallbackVideoMarks stops={stops!} draft={marks!} onChange={onMarksChange!} preview={preview} disabled={disabled || uploading} />}
  </div>
}

/** ADR-0075 stage 2: where the recording reaches each stop, typed as phút:giây or taken from the preview. */
function FallbackVideoMarks({ stops, draft, onChange, preview, disabled }: {
  stops: MarkStop[]
  draft: MarkDraft
  onChange: Dispatch<SetStateAction<MarkDraft>>
  preview: string | null
  disabled: boolean
}) {
  const player = useRef<HTMLVideoElement>(null)
  const setText = (stopId: string, text: string) => onChange(current => ({ ...current, texts: { ...current.texts, [stopId]: text } }))
  const limit = draft.duration != null && Number.isFinite(draft.duration) ? Math.floor(draft.duration) : null

  // Placed marks on the video's length, so Staff see the order and spacing at a glance and can jump back to one.
  const placed = limit ? stops.flatMap(stop => {
    const seconds = parseMark(draft.texts[stop.id] ?? '')
    return seconds != null && seconds <= limit ? [{ stop, seconds }] : []
  }) : []

  return <fieldset className="mt-3 rounded-xl border border-[#e2e8f0] p-3">
    <legend className="px-1 text-[13px] font-medium text-[#334155]">Mốc thời gian của từng điểm trong video</legend>
    <p className="text-xs text-[#64748b]">
      Dạng phút:giây; bỏ trống điểm không có trong bản ghi.
      {preview ? ' Dừng video ở đầu một điểm rồi bấm nút đồng hồ của điểm đó.' : ''}
    </p>
    <div className={`mt-2 grid gap-3 ${preview ? 'md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]' : ''}`}>
      {preview && <div className="min-w-0">
        <video ref={player} src={preview} controls muted preload="metadata" aria-label="Xem lại video dự phòng"
          className="aspect-video w-full rounded-lg bg-black"
          onLoadedMetadata={event => { const duration = event.currentTarget.duration; onChange(current => ({ ...current, duration })) }} />
        {limit != null && <>
          <div className="relative mt-3 h-1.5 rounded-full bg-[#e2e8f0]" aria-hidden={placed.length === 0}>
            {placed.map(({ stop, seconds }) => <button key={stop.id} type="button"
              className="absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#2563eb] text-[10px] font-semibold text-white ring-2 ring-white transition-transform duration-150 hover:scale-110 motion-reduce:transition-none"
              style={{ left: `${limit > 0 ? (seconds / limit) * 100 : 0}%` }}
              title={`${stop.name} · ${formatMark(seconds)}`} aria-label={`Tua tới ${stop.name}`}
              onClick={() => { if (player.current) player.current.currentTime = seconds }}>{stop.order}</button>)}
          </div>
          <p className="mt-2 flex justify-between text-xs text-[#64748b]"><span>0:00</span><span>Độ dài video: {formatMark(limit)}</span></p>
        </>}
      </div>}
      <ul className="min-w-0 divide-y divide-[#f1f5f9] self-start rounded-lg border border-[#f1f5f9]">
        {stops.map(stop => {
          const text = draft.texts[stop.id] ?? ''
          const seconds = parseMark(text)
          const problem = seconds === undefined ? 'Nhập dạng phút:giây, ví dụ 1:35.'
            : seconds != null && limit != null && seconds > limit ? 'Mốc này nằm sau cuối video.' : null
          const inputId = `fallback-mark-${stop.id}`
          return <li key={stop.id} className="px-2 py-1.5">
            <div className="flex items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#eff6ff] text-xs font-semibold text-[#2563eb]" aria-hidden>{stop.order}</span>
              <label htmlFor={inputId} className="min-w-0 flex-1 truncate text-[13px] text-[#334155]" title={stop.name}>
                <span className="sr-only">{stop.order}. </span>{stop.name}</label>
              <div className="w-24 shrink-0">
                <input id={inputId} className={`${inputClass} text-center tabular-nums`} inputMode="numeric"
                  placeholder="m:ss" value={text} disabled={disabled} aria-invalid={problem ? true : undefined}
                  aria-describedby={problem ? `${inputId}-problem` : undefined}
                  onChange={event => setText(stop.id, event.target.value)} />
              </div>
              {preview && <button type="button" className={`${buttonClass('ghost', 'sm')} shrink-0 px-2`} disabled={disabled}
                aria-label={`Lấy thời điểm này cho ${stop.name}`} title="Lấy thời điểm đang phát"
                onClick={() => setText(stop.id, formatMark(player.current?.currentTime ?? 0))}><Timer aria-hidden className="size-4" /></button>}
            </div>
            {problem && <p id={`${inputId}-problem`} className="mt-1 pl-8 text-xs text-[#b23e31]">{problem}</p>}
          </li>
        })}
      </ul>
    </div>
  </fieldset>
}
