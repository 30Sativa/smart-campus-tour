import type { StatusTone } from '../../components/ui/status-tone'

/** GroupRegistrations.State exactly as the SQL-backed Admin and Representative APIs return it. */
export type RegistrationState = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

/** One vocabulary for live Admin review and the Representative area; each area renders its own badge. */
export const REGISTRATION_STATE_LABEL: Record<RegistrationState, { label: string; tone: StatusTone }> = {
  SUBMITTED: { label: 'Chờ duyệt', tone: 'warn' },
  APPROVED: { label: 'Đã duyệt', tone: 'ok' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
  CANCELLED: { label: 'Đã hủy', tone: 'muted' },
}

export const REGISTRATION_STATES = Object.keys(REGISTRATION_STATE_LABEL) as RegistrationState[]

export const isRegistrationState = (value: string): value is RegistrationState =>
  Object.prototype.hasOwnProperty.call(REGISTRATION_STATE_LABEL, value)
