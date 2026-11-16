import type { StatusTone } from '../../../components/ui/status-tone'
import type { InvitationItem, ViewerPresence } from './api'

/** Same clock as the rest of the invitation panel: Vietnam time, whatever the browser's zone. */
export const time = (stamp: string) => new Date(stamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })

const tone: Record<ViewerPresence, StatusTone> = { NOT_ENTERED: 'muted', CONNECTED: 'ok', DISCONNECTED: 'warn', LEFT: 'muted' }

export type PresenceView = { state: ViewerPresence; label: string; tone: StatusTone; firstEntered?: string; hint?: string }

/** What the Staff/Representative reads about who is watching. Null when the backend sent no (or an unknown) state. */
export function viewerPresence(item: InvitationItem): PresenceView | null {
  const state = item.viewerPresence
  if (!state || !Object.prototype.hasOwnProperty.call(tone, state)) return null
  const last = item.lastSeenAt ? ` · lần cuối ${time(item.lastSeenAt)}` : ''
  const label = state === 'CONNECTED' ? 'Đang xem'
    : state === 'DISCONNECTED' ? `Mất kết nối${last}`
      : state === 'LEFT' ? `Đã rời${last}` : 'Chưa vào'
  // Only suggest a new code when the backend says reissue is allowed right now.
  const hint = state === 'DISCONNECTED' && item.canReissue
    ? `Cấp mã mới để vào lại ngay${item.sessionExpiresAt ? `, hoặc đợi tới ${time(item.sessionExpiresAt)}` : ''}.`
    : undefined
  return { state, label, tone: tone[state], hint, ...(item.firstEnteredAt ? { firstEntered: `Vào lần đầu ${time(item.firstEnteredAt)}` } : {}) }
}

/** "{a} đang xem · {b} mất kết nối · {c} chưa vào", or null when no item carries presence. */
export function presenceSummary(items: InvitationItem[]): string | null {
  const states = items.map(viewerPresence).filter((view): view is PresenceView => view !== null).map(view => view.state)
  if (states.length === 0) return null
  const count = (state: ViewerPresence) => states.filter(value => value === state).length
  return `${count('CONNECTED')} đang xem · ${count('DISCONNECTED')} mất kết nối · ${count('NOT_ENTERED')} chưa vào`
}
