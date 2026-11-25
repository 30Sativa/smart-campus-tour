import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Square, Volume2 } from 'lucide-react'
import { buttonClass } from '../../../components/ui/ui-classes'
import { formatMinutesSeconds } from '../../../components/ui/date-time'
import { canPreviewNarration, previewNarration } from '../../student/use-narration-voice'

export type RouteStopNarrationItem = { poiRevisionId: string; stopOrder: number; name: string; dwellSeconds: number; narrationText?: string | null }

/**
 * The stops of a route revision, each with a button that opens the narration saved with this revision (ADR-0060):
 * the words a Tour on this revision reads at that POI. A newer approved narration of the POI is not here until a Tour
 * takes it from its detail page (ADR-0067) or the route is saved again.
 */
export function RouteStopNarrationList({ stops }: { stops: RouteStopNarrationItem[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [playing, setPlaying] = useState<string | null>(null)
  const stopPreview = useRef<(() => void) | null>(null)
  useEffect(() => () => stopPreview.current?.(), [])
  const ordered = [...stops].sort((a, b) => a.stopOrder - b.stopOrder)
  const allOpen = ordered.length > 0 && ordered.every(stop => open.has(stop.poiRevisionId))
  const toggle = (id: string) => setOpen(current => {
    const next = new Set(current)
    if (!next.delete(id)) next.add(id)
    return next
  })
  const listen = (id: string, text: string) => {
    if (stopPreview.current) { stopPreview.current(); stopPreview.current = null }
    if (playing === id) { setPlaying(null); return }
    setPlaying(id)
    stopPreview.current = previewNarration(text, () => { stopPreview.current = null; setPlaying(current => current === id ? null : current) })
  }

  return <div>
    {ordered.length > 1 && <div className="flex justify-end">
      <button type="button" className="text-[13px] font-medium text-[#2d719e] hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:outline-none"
        onClick={() => setOpen(allOpen ? new Set() : new Set(ordered.map(stop => stop.poiRevisionId)))}>
        {allOpen ? 'Thu gọn tất cả' : 'Mở tất cả lời thuyết minh'}</button>
    </div>}
    <ol className="divide-y divide-[#eef1f4]">{ordered.map(stop => {
      const expanded = open.has(stop.poiRevisionId)
      const text = stop.narrationText?.trim() ?? ''
      const panelId = `route-stop-narration-${stop.poiRevisionId}`
      return <li key={stop.poiRevisionId} className="py-2.5">
        <div className="flex items-center gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#173b5f] text-xs font-semibold text-white">{stop.stopOrder}</span>
          <span className="min-w-0 flex-1 break-words font-medium text-[#0f172a]">{stop.name}</span>
          <span className="shrink-0 text-[13px] text-[#64748b]">Dừng {formatMinutesSeconds(stop.dwellSeconds)}</span>
          <button type="button" aria-expanded={expanded} aria-controls={panelId} aria-label={`${expanded ? 'Ẩn' : 'Xem'} lời thuyết minh ${stop.name}`}
            className={`${buttonClass('secondary', 'sm')} shrink-0`} onClick={() => toggle(stop.poiRevisionId)}>
            Thuyết minh<ChevronDown size={14} aria-hidden="true" className={`transition-transform duration-150 motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {expanded && <div id={panelId} role="region" aria-label={`Lời thuyết minh ${stop.name}`} className="mt-2 ml-9 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3">
          {text ? <p className="max-h-64 overflow-y-auto text-sm leading-6 whitespace-pre-wrap text-[#2d3748]">{text}</p>
            : <p className="text-sm text-[#64748b]">Điểm này chưa có lời thuyết minh đã duyệt khi lưu tuyến.</p>}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[#64748b]">Lời đã lưu cùng bản tuyến này. Lời mới duyệt ở POI sau đó cần cập nhật ở trang chi tiết Tour.</p>
            {text && canPreviewNarration() && <button type="button" className={buttonClass('secondary', 'sm')}
              aria-label={playing === stop.poiRevisionId ? `Dừng đọc ${stop.name}` : `Nghe thử ${stop.name}`} onClick={() => listen(stop.poiRevisionId, text)}>
              {playing === stop.poiRevisionId ? <Square size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
              {playing === stop.poiRevisionId ? 'Dừng đọc' : 'Nghe thử'}</button>}
          </div>
        </div>}
      </li>
    })}</ol>
  </div>
}
