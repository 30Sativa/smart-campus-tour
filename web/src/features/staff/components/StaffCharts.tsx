import type { ReactNode } from 'react'
import { CalendarDays } from 'lucide-react'
import type { TourOperation, TourState } from '../../../api/contracts/staff'

/**
 * Overview charts. Every mark is a count of Tours the operations API returned;
 * nothing is seeded, averaged into a trend or filled in when a day is empty.
 * An empty day draws an empty column, and an empty dataset says so.
 *
 * Colours follow the status tones used on the badges (good / info / warning /
 * danger / muted), and every chart prints its numbers, so colour is never the
 * only carrier.
 */

const STATE_ORDER: Array<{ state: TourState; label: string; fill: string }> = [
  { state: 'Completed', label: 'Hoàn thành', fill: 'bg-[#8fbf2a]' },
  { state: 'Running', label: 'Đang chạy', fill: 'bg-[#1c1c1c]' },
  { state: 'Ready', label: 'Sẵn sàng', fill: 'bg-[#7aa62a]' },
  { state: 'Scheduled', label: 'Chờ Admin chốt', fill: 'bg-[#f59e0b]' },
  { state: 'Cancelled', label: 'Đã hủy', fill: 'bg-[#ef4444]' },
]

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const dayKey = (value: string | Date) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/**
 * Tours run per day over the last 7 days (today included), split into
 * completed and ended early / cancelled. Read from today's list plus the
 * history the operations API returns.
 */
export function TourActivityChart({ tours, history, now }: { tours: TourOperation[]; history: TourOperation[]; now: number }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (6 - i))
    return d
  })
  const all = [...history, ...tours]
  const rows = days.map((d) => {
    const key = dayKey(d)
    const onDay = all.filter((tour) => dayKey(tour.scheduledAt) === key)
    return {
      key,
      label: i18nDay(d, now),
      completed: onDay.filter((tour) => tour.state === 'Completed').length,
      cancelled: onDay.filter((tour) => tour.state === 'Cancelled').length,
    }
  })
  const max = Math.max(1, ...rows.map((row) => row.completed + row.cancelled))
  const totalCompleted = rows.reduce((sum, row) => sum + row.completed, 0)
  const totalCancelled = rows.reduce((sum, row) => sum + row.cancelled, 0)

  return (
    <div className="flex h-full flex-col">
      <ChartHead title="Buổi đã chạy, 7 ngày" note={`${totalCompleted} hoàn thành, ${totalCancelled} kết thúc sớm hoặc hủy`} icon={<CalendarDays size={16} aria-hidden="true" />} />
      {totalCompleted + totalCancelled === 0 ? (
        <p className="my-auto py-10 text-center text-sm text-[#8e9096]">Chưa có buổi nào kết thúc trong 7 ngày qua.</p>
      ) : (
        <>
          <div className="mt-4 grid h-36 grid-cols-7 items-end gap-2 border-b border-[#e3e3dc]" role="img" aria-label={rows.map((row) => `${row.label}: ${row.completed} hoàn thành, ${row.cancelled} hủy`).join('; ')}>
            {rows.map((row) => {
              const total = row.completed + row.cancelled
              return (
                <div key={row.key} className="group flex h-full flex-col items-center justify-end gap-1" title={`${row.label}: ${row.completed} hoàn thành, ${row.cancelled} kết thúc sớm / hủy`}>
                  <span className="text-[11px] font-semibold text-[#4a4f59] tabular-nums opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none">{total || ''}</span>
                  <div className="flex w-full max-w-7 flex-col-reverse gap-0.5" style={{ height: `${(total / max) * 100}%` }}>
                    {row.completed > 0 && <span className="w-full rounded-t-[4px] bg-[#8fbf2a] transition-[height] duration-500" style={{ height: `${(row.completed / Math.max(1, total)) * 100}%` }} />}
                    {row.cancelled > 0 && <span className="w-full rounded-t-[4px] bg-[#ef4444] transition-[height] duration-500" style={{ height: `${(row.cancelled / Math.max(1, total)) * 100}%` }} />}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-2 text-center text-[11px] text-[#6b6e75]" aria-hidden="true">
            {rows.map((row) => <span key={row.key}>{row.label}</span>)}
          </div>
          <Legend items={[{ label: 'Hoàn thành', fill: 'bg-[#8fbf2a]' }, { label: 'Kết thúc sớm / hủy', fill: 'bg-[#ef4444]' }]} />
        </>
      )}
    </div>
  )
}

function i18nDay(d: Date, now: number) {
  return dayKey(d) === dayKey(new Date(now)) ? 'Hôm nay' : WEEKDAY[d.getDay()]
}

/** Today's sessions by state, as one proportional bar with the counts written out. */
export function TourStatusDistribution({ tours }: { tours: TourOperation[] }) {
  const parts = STATE_ORDER.map((item) => ({ ...item, count: tours.filter((tour) => tour.state === item.state).length }))
  const total = tours.length
  return (
    <div className="flex h-full flex-col">
      <ChartHead title="Trạng thái buổi hôm nay" note={`${total} buổi`} />
      {total === 0 ? (
        <p className="my-auto py-10 text-center text-sm text-[#8e9096]">Hôm nay chưa có buổi nào.</p>
      ) : (
        <>
          <div className="mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.filter((p) => p.count).map((p) => `${p.count} ${p.label.toLowerCase()}`).join(', ')}>
            {parts.filter((p) => p.count > 0).map((p) => (
              <span key={p.state} title={`${p.count} ${p.label.toLowerCase()}`} className={`h-full transition-[flex-grow] duration-500 ${p.fill}`} style={{ flexGrow: p.count }} />
            ))}
          </div>
          <ul className="mt-5 space-y-2.5" aria-hidden="true">
            {parts.map((p) => (
              <li key={p.state} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex items-center gap-2 text-[#4a4f59]"><span className={`size-2 rounded-full ${p.fill}`} />{p.label}</span>
                <span className="font-semibold text-[#1c1c1c] tabular-nums">{p.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ChartHead({ title, note, icon }: { title: string; note?: string; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-[#1c1c1c]">{title}</h3>
        {note && <p className="mt-0.5 text-[13px] text-[#6b6e75]">{note}</p>}
      </div>
      {icon && <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#1c1c1c] text-[#bde74e] shadow-[0_6px_14px_-6px_rgba(28,28,28,0.6)]">{icon}</span>}
    </div>
  )
}

function Legend({ items }: { items: Array<{ label: string; fill: string }> }) {
  return (
    <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#4a4f59]">
      {items.map((item) => <span key={item.label} className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${item.fill}`} />{item.label}</span>)}
    </p>
  )
}
