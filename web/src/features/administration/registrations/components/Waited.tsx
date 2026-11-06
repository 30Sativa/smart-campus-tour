import { useNow } from '../../../staff/use-now'
import { reviewTime } from '../presentation'

/**
 * How long a registration has waited since it was submitted, in calendar time.
 * Amber from one day, red from two: the review target is two working days, and
 * without a working-day calendar this only warns early, it never says "late".
 */
export function Waited({ since }: { since: string }) {
  const now = useNow(60_000)
  const hours = Math.max(0, Math.floor((now - new Date(since).getTime()) / 36e5))
  const tone = hours >= 48 ? 'border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31]' : hours >= 24 ? 'border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06]' : 'border-[#dbe6f4] bg-[#f6f9fd] text-[#5d7085]'
  const text = hours >= 24 ? `${Math.floor(hours / 24)} ngày ${hours % 24} giờ` : `${hours} giờ`
  return <span className={`inline-flex rounded-full border px-2 py-px text-[11px] font-bold whitespace-nowrap ${tone}`} title={`Gửi ${reviewTime(since)}`}>{text}</span>
}
