import { toneClass } from '../../../../components/ui/status-tone'
import { REGISTRATION_STATE_LABEL } from '../../../registrations/registration-state'
import type { RegistrationState } from '../types'

/**
 * `pendingRows`, when the caller knows the roster: a registration still holding PENDING rows reads as unfinished
 * review, not "Đã duyệt", although its backend state may already be APPROVED (one accepted row is enough for that).
 */
export function ReviewStateBadge({ state, pendingRows }: { state: RegistrationState; pendingRows?: number }) {
  const open = (state === 'APPROVED' || state === 'SUBMITTED') && (pendingRows ?? 0) > 0
  const { label, tone } = open ? { label: `Còn ${pendingRows} dòng chờ duyệt`, tone: 'warn' as const } : REGISTRATION_STATE_LABEL[state]
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${toneClass[tone]}`}>{label}</span>
}
