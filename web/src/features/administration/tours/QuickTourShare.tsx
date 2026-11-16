import { useRef, useState } from 'react'
import { Copy, Timer } from 'lucide-react'
import { Link } from 'react-router'
import { panelClass } from '../../../components/ui/ConsolePrimitives'
import { formatTime } from '../../../components/ui/date-time'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { useNow } from '../../staff/use-now'
import { quickTourDeadline, representativeTourPath } from './quick-tour'
import type { TourSummary } from './types'

type CopyState = 'idle' | 'copied' | 'manual'

/**
 * What Staff does right after creating a quick Tour (ADR-0053): give the Representative the Tour's link before the
 * published start. Every time shown is the server's (`scheduledStartAt`, `latestStartAt`, `autoCancelAt`). Once the
 * start has passed the Tour cannot be locked any more, so the link is withdrawn and the panel offers Cancel instead
 * (`onCancel`, the page's own cancel dialog; absent when the server does not permit it).
 */
export function QuickTourShare({ tour, onCancel }: {
  tour: Pick<TourSummary, 'id' | 'scheduledStartAt' | 'latestStartAt' | 'autoCancelAt'>
  onCancel?: () => void
}) {
  const now = useNow(1000)
  const input = useRef<HTMLInputElement>(null)
  const [copy, setCopy] = useState<CopyState>('idle')
  const link = `${window.location.origin}${representativeTourPath(tour.id)}`
  const deadline = quickTourDeadline(tour, now, formatTime)

  // The Clipboard API needs a secure context; without it, or when it is refused, the link is selected for Ctrl+C.
  const manual = () => { input.current?.select(); setCopy('manual') }
  const copyLink = () => {
    if (!navigator.clipboard?.writeText) return manual()
    navigator.clipboard.writeText(link).then(() => setCopy('copied'), manual)
  }

  return <section className={`${panelClass} mb-3 p-4`} aria-labelledby={`share-${tour.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 id={`share-${tour.id}`} className="text-[15px] font-semibold text-[#0f172a]">Gửi cho đại diện</h2>
      {deadline.chip && <p role="timer" aria-label={deadline.timerLabel} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums ${deadline.passed ? 'bg-[#fef2f2] text-[#9d3428]' : 'bg-[#fffaf0] text-[#7d5310]'}`}>
        <Timer size={15} aria-hidden="true" />{deadline.chip}
      </p>}
    </div>
    <p className="mt-1 text-[13px] leading-5 text-muted">{deadline.text}</p>
    {deadline.passed
      ? onCancel && <div className="mt-3"><button type="button" onClick={onCancel} className={buttonClass('danger', 'sm')}>Huỷ Tour ngay</button></div>
      : <>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor={`share-link-${tour.id}`}>Link đăng ký cho đại diện</label>
          <input ref={input} id={`share-link-${tour.id}`} readOnly value={link} onFocus={event => event.currentTarget.select()} className={`${inputClass} font-mono text-[13px]`} />
          <button type="button" onClick={copyLink} className={`${buttonClass('primary', 'sm')} shrink-0`}><Copy size={15} aria-hidden="true" />{copy === 'copied' ? 'Đã sao chép' : 'Sao chép link'}</button>
        </div>
        {copy === 'manual' && <p role="status" className="mt-1.5 text-xs text-[#7d5310]">Trình duyệt không cho sao chép tự động. Link đã được chọn, bấm Ctrl+C để sao chép.</p>}
        {/* The countdown line above is the one thing to act on; the full sequence stays folded until asked for. */}
        <details className="mt-3 text-[13px] leading-5">
          <summary className="w-fit cursor-pointer rounded font-semibold text-[#2563eb] hover:text-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]">Xem hướng dẫn</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[#334155]" aria-label="Các bước tiếp theo">
            <li>Gửi link này cho đại diện trường.</li>
            <li>Đại diện mở link, đăng ký đoàn và gửi lời mời cho học sinh.</li>
            <li>Duyệt đăng ký ở <Link to={`/staff/manage/registrations?tourId=${tour.id}`} className="font-semibold text-[#2563eb] underline-offset-2 hover:underline">danh sách đăng ký của Tour</Link>.</li>
            <li>Chốt Tour, rồi Mở Tour trước hạn và bấm Khởi hành khi robot sẵn sàng.</li>
          </ol>
        </details>
      </>}
  </section>
}
