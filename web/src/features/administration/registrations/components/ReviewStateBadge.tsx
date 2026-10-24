import { toneClass } from '../../../../components/ui/status-tone'
import { REGISTRATION_STATE_LABEL } from '../../../registrations/registration-state'
import type { RegistrationState } from '../types'

export function ReviewStateBadge({ state }: { state: RegistrationState }) {
  const { label, tone } = REGISTRATION_STATE_LABEL[state]
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${toneClass[tone]}`}>{label}</span>
}
