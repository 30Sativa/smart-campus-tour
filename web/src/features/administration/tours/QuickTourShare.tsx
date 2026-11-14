import { useRef, useState } from 'react'
import { Copy, Timer } from 'lucide-react'
import { Link } from 'react-router'
import { panelClass } from '../../../components/ui/ConsolePrimitives'
import { formatTime } from '../../../components/ui/date-time'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { useNow } from '../../staff/use-now'
import { countdownText, representativeTourPath } from './quick-tour'
import type { TourSummary } from './types'

type CopyState = 'idle' | 'copied' | 'manual'

/**
 * What Staff does right after creating a quick Tour (ADR-0053): give the Representative the Tour's link before its
 * latest Start. The deadline is the Tour's `scheduledStartAt`, which for a quick Tour is creation plus the configured
 * wait, set by the server; the countdown reads it rather than guessing from the creation time.
 */
export function QuickTourShare({ tour }: { tour: Pick<TourSummary, 'id' | 'scheduledStartAt'> }) {
  const now = useNow(1000)
  const input = useRef<HTMLInputElement>(null)
  const [copy, setCopy] = useState<CopyState>('idle')
  const link = `${window.location.origin}${representativeTourPath(tour.id)}`
  const left = countdownText(tour.scheduledStartAt, now)

  // The Clipboard API needs a secure context; without it, or when it is refused, the link is selected for Ctrl+C.
  const manual = () => { input.current?.select(); setCopy('manual') }
  const copyLink = () => {
    if (!navigator.clipboard?.writeText) return manual()
    navigator.clipboard.writeText(link).then(() => setCopy('copied'), manual)
  }

  return <section className={`${panelClass} mb-3 p-4`} aria-labelledby={`share-${tour.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 id={`share-${tour.id}`} className="text-[15px] font-semibold text-[#0f172a]">Gửi cho đại diện</h2>
      <p role="timer" aria-label="Thời gian còn lại để bắt đầu" className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums ${left ? 'bg-[#fffaf0] text-[#7d5310]' : 'bg-[#fef2f2] text-[#9d3428]'}`}>
        <Timer size={15} aria-hidden="true" />{left ? `Còn ${left}` : 'Đã tới hạn'}
      </p>
    </div>
    <p className="mt-1 text-[13px] leading-5 text-muted">Hạn bắt đầu lúc {formatTime(tour.scheduledStartAt)}. Chưa bắt đầu trước hạn thì Tour tự huỷ.</p>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor={`share-link-${tour.id}`}>Link đăng ký cho đại diện</label>
      <input ref={input} id={`share-link-${tour.id}`} readOnly value={link} onFocus={event => event.currentTarget.select()} className={`${inputClass} font-mono text-[13px]`} />
      <button type="button" onClick={copyLink} className={`${buttonClass('primary', 'sm')} shrink-0`}><Copy size={15} aria-hidden="true" />{copy === 'copied' ? 'Đã sao chép' : 'Sao chép link'}</button>
    </div>
    {copy === 'manual' && <p role="status" className="mt-1.5 text-xs text-[#7d5310]">Trình duyệt không cho sao chép tự động. Link đã được chọn, bấm Ctrl+C để sao chép.</p>}
    <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] leading-5 text-[#334155]" aria-label="Các bước tiếp theo">
      <li>Gửi link này cho đại diện trường.</li>
      <li>Đại diện mở link, đăng ký đoàn và gửi lời mời cho học sinh.</li>
      <li>Duyệt đăng ký ở <Link to={`/staff/manage/registrations?tourId=${tour.id}`} className="font-semibold text-[#2563eb] underline-offset-2 hover:underline">danh sách đăng ký của Tour</Link>.</li>
      <li>Chốt Tour, rồi Mở Tour trước hạn và bấm Khởi hành khi robot sẵn sàng.</li>
    </ol>
  </section>
}
