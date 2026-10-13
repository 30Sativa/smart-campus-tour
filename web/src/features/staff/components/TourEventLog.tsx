import type { TourEvent } from '../../../api/contracts/staff'
import { eventTypeLabel } from '../status'
import { formatTime } from '../formatters'

const ACCENT_EVENTS = new Set([
  'AssistanceRequired',
  'LegFailed',
  'CommandFailed',
  'StreamLost',
  'TourEndedEarly',
  'TourCancelled',
])

/** Every logged step of a Tour, oldest first, with who did it and why. */
export function TourEventLog({ events, className = 'space-y-3.5 p-5' }: { events: TourEvent[]; className?: string }) {
  if (events.length === 0) return <p className="p-5 text-xs text-[#94a3b8]">Chưa có mốc nào được ghi nhận.</p>
  return (
    <ol className={className}>
      {events.map((event) => (
        <li key={event.id} className="flex gap-4 text-xs">
          <span className="w-12 shrink-0 pt-0.5 text-right font-mono font-bold text-[#64748b] tabular-nums">
            {formatTime(event.occurredAt)}
          </span>
          <span
            aria-hidden="true"
            className={`mt-1.5 size-2 shrink-0 rounded-full ${
              ACCENT_EVENTS.has(event.type) ? 'bg-[#dc2626]' : event.actor ? 'bg-[#0f172a]' : 'bg-[#2563eb]'
            }`}
          />
          <span className="min-w-0 flex-1">
            <span className={`font-bold ${ACCENT_EVENTS.has(event.type) ? 'text-[#dc2626]' : 'text-[#0f172a]'}`}>
              {eventTypeLabel(event.type)}
            </span>
            {event.detail && <span className="block text-[#64748b] mt-0.5">{event.detail}</span>}
            {event.actor && <span className="block text-[11px] text-[#94a3b8] mt-0.5">Thực hiện bởi: {event.actor}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
