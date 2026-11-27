import { useAuthStore } from '../../../stores/auth-store'
import { STAFF_ROLE } from '../../../auth/roles'
import type { TourDetails } from '../../administration/tours/types'
import { formatTime } from '../../../components/ui/date-time'
import { useNow } from '../use-now'
import { BACKUP_END } from './operation-labels'
import { EndEarlyAction } from './TourActions'

const clock = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

/** Existing Staff read access stays read-only except this one server-gated safer action. */
export function OperatorPresencePanel({ detail }: { detail: TourDetails }) {
  const now = useNow()
  const user = useAuthStore(store => store.user)
  if (detail.tour.state !== 'RUNNING') return null
  const last = detail.operatorLastSeenAt
  const since = detail.operatorDisconnectedSince
  const name = detail.operator?.fullName ?? '-'
  const minutes = detail.operatorDisconnectEndEarlyMinutes
  const configured = typeof minutes === 'number' && minutes > 0
  const allowed = Boolean(detail.allowedActions?.endEarly?.allowed) && configured && (Boolean(since) || !last)
  const remaining = last && configured ? Math.max(0, Math.ceil((Date.parse(last) + minutes * 60_000 - now) / 1000)) : 0
  const countdown = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
  const status = since ? BACKUP_END.disconnected(name, formatTime(since), Math.max(0, Math.floor((now - Date.parse(since)) / 60_000)))
    : last ? BACKUP_END.connected(name, clock.format(new Date(last))) : BACKUP_END.unknown
  const backup = user?.role === STAFF_ROLE && Boolean(detail.operator) && user.userId !== detail.operator?.userId
  return <section aria-label={BACKUP_END.panel} className="my-3 space-y-3 rounded-xl border border-[#e2e8f0] bg-white p-4">
    <p role="status" className="text-sm text-[#475569]">{status}</p>
    {backup && <EndEarlyAction detail={configured ? detail : { ...detail, allowedActions: null }} backup
      disabledNote={allowed ? null : configured ? BACKUP_END.countdown(minutes, countdown) : BACKUP_END.unavailable} />}
  </section>
}

/** The same audited explanation in Tour history and at the top of the returning Operator's console. */
export function BackupEndEarlyNotice({ detail }: { detail: TourDetails }) {
  const event = detail.endedEarlyByBackupStaff
  if (!event) return null
  const text = event.operatorLastSeenAt
    ? BACKUP_END.history(event.actorName, event.operatorName ?? '-', formatTime(event.operatorLastSeenAt))
    : BACKUP_END.legacyHistory(event.actorName, event.operatorName ?? '-')
  return <p role="status" className="my-3 rounded-xl border border-[#f1dcb0] bg-[#fffaf0] px-4 py-3 text-sm font-semibold text-[#7d5310]">{text}</p>
}
