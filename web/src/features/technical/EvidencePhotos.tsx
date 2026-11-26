import { useRef } from 'react'
import { ImagePlus, LoaderCircle, X } from 'lucide-react'
import { buttonClass, labelClass } from '../../components/ui/ui-classes'
import { EVIDENCE_PHOTO_ACCEPT, EVIDENCE_PHOTO_MAX, evidenceFullSrc, evidenceThumbSrc } from './api/evidence-photos'
import type { EvidencePhotoState } from './use-evidence-photos'

/** The picker under the evidence note. Photos are optional; the note stays the required evidence. */
export function EvidencePhotoField({ id, state }: { id: string; state: EvidencePhotoState }) {
  const input = useRef<HTMLInputElement>(null)
  const full = state.photos.length + state.uploads.length >= EVIDENCE_PHOTO_MAX
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={labelClass} id={`${id}-label`}>Ảnh bằng chứng <span className="font-normal text-[#64748b]">(không bắt buộc, tối đa {EVIDENCE_PHOTO_MAX})</span></span>
        <button type="button" className={buttonClass('secondary', 'sm')} disabled={full} aria-describedby={`${id}-label`} onClick={() => input.current?.click()}><ImagePlus aria-hidden className="size-4" />Thêm ảnh</button>
        <input ref={input} id={id} type="file" className="sr-only" tabIndex={-1} aria-labelledby={`${id}-label`} accept={EVIDENCE_PHOTO_ACCEPT} multiple
          onChange={event => { state.add(Array.from(event.target.files ?? [])); event.target.value = '' }} />
      </div>
      <p className="mt-0.5 text-xs text-[#64748b]">JPG, PNG, WebP hoặc HEIC, mỗi ảnh tới 10 MB. Ảnh được lưu trên Cloudinary bằng một đường dẫn khó đoán, ai có đường dẫn đều xem được.</p>
      {(state.photos.length > 0 || state.uploads.length > 0) && <ul className="mt-2 flex flex-wrap gap-2">
        {state.photos.map((url, index) => <li key={url} className="relative">
          <a href={evidenceFullSrc(url)} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded-lg border border-[#e2e8f0] bg-[#f8fafc]"><img src={evidenceThumbSrc(url, 80)} alt={`Ảnh bằng chứng ${index + 1}`} className="size-full object-cover" /></a>
          <button type="button" aria-label={`Bỏ ảnh bằng chứng ${index + 1}`} className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-[#e2e8f0] bg-white text-[#334155] shadow-xs hover:bg-[#f1f5f9]" onClick={() => state.remove(url)}><X aria-hidden className="size-3.5" /></button>
        </li>)}
        {state.uploads.map(upload => <li key={upload.key} className="relative grid size-20 place-items-center rounded-lg border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-1 text-center text-[11px] text-[#475569]">
          <span role="status" className="grid place-items-center gap-0.5"><LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /><span className="line-clamp-1 break-all">{upload.name}</span><span>{upload.percent}%</span></span>
          <button type="button" aria-label={`Hủy tải ${upload.name}`} className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-[#e2e8f0] bg-white text-[#334155] shadow-xs hover:bg-[#f1f5f9]" onClick={() => state.cancel(upload.key)}><X aria-hidden className="size-3.5" /></button>
        </li>)}
      </ul>}
      {state.problems.map(problem => <p key={problem} role="alert" className="mt-1 text-xs text-[#b23e18]">{problem}</p>)}
    </div>
  )
}

/** The photos of a saved record, in its history. Nothing is shown for a record without photos. */
export function EvidencePhotoList({ urls }: { urls?: string[] | null }) {
  if (!urls?.length) return null
  return (
    <ul aria-label="Ảnh bằng chứng" className="mt-2 flex flex-wrap gap-2">
      {urls.map((url, index) => <li key={url}><a href={evidenceFullSrc(url)} target="_blank" rel="noreferrer" className="block size-16 overflow-hidden rounded-lg border border-[#e2e8f0] bg-[#f8fafc] hover:border-[#2563eb]"><img src={evidenceThumbSrc(url, 64)} alt={`Ảnh bằng chứng ${index + 1}`} loading="lazy" className="size-full object-cover" /></a></li>)}
    </ul>
  )
}
