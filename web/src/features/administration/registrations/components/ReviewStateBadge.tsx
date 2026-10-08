import { toneClass } from '../../../../components/ui/status-tone'
import type { RegistrationState } from '../types'
import { STATE_LABEL } from '../presentation'

export function ReviewStateBadge({ state }: { state: RegistrationState }) {
  const tone = state === 'SUBMITTED' ? 'warn' : state === 'APPROVED' ? 'ok' : state === 'REJECTED' ? 'danger' : 'muted'
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${toneClass[tone]}`}>{STATE_LABEL[state]}</span>
}
