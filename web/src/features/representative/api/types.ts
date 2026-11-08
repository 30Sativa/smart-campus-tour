import type { RegistrationState } from '../../registrations/registration-state'
import type { RosterRow } from '../../registrations/roster'
export type { RegistrationState } from '../../registrations/registration-state'
export type { RosterRow } from '../../registrations/roster'
export type TourState = 'SCHEDULED' | 'READY' | 'RUNNING' | 'COMPLETED' | 'CANCELLED'
export type ActionGate = { allowed: boolean; reason: string | null }

export type RepresentativeTour = {
  id: string; name: string; description: string | null; scheduledStartAt: string; state: TourState; rowVersion: string
  routeName: string; stops: { order: number; name: string; description: string | null }[]; register: ActionGate
  /** Why Staff cancelled it; null unless the Tour is cancelled. */
  cancelReason?: string | null
  /** Seats of the Tour (BR-26). An older server omits them. */
  capacity?: number; remainingSeats?: number
}
export type RegistrationSummary = {
  id: string; tourId: string; tourName: string; tourScheduledStartAt: string; tourState: TourState
  schoolName: string; groupName: string; state: RegistrationState; rowCount: number; submittedAt: string; updatedAt: string
  /** Admin's refusal reason and review time; the list carries them so a refusal reads without opening the detail. */
  rejectionReason?: string | null; reviewedAt?: string | null
  /** Why Staff cancelled the Tour; null unless the Tour is cancelled. */
  tourCancelReason?: string | null
  /** When a cancelled Tour ended; an older server omits it. */
  tourEndedAt?: string | null
}
/** "Đăng ký của tôi" halves: still in play, or ended (cancelled, Tour cancelled, refused with no way back). */
export type RegistrationGroup = 'active' | 'closed'
export type RepresentativeRosterRow = RosterRow & {
  id?: string; rowVersion?: string; participationState?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'REMOVED' | 'EXPIRED'
  reviewReason?: string | null; reviewedAt?: string | null; canRequestEmailChange?: boolean
  canRemove?: boolean; invitationRowVersion?: string | null
}
export type RegistrationRosterInput = RosterRow & { rowId?: string | null }
export type RosterEmailChange = {
  id: string; registrationId: string; rowId: string; rowNumber: number; currentEmail: string; proposedEmail: string
  state: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'; requestedByUserId: string; createdAt: string
  reviewedAt: string | null; reviewedByUserId: string | null; reviewReason: string | null
  rowVersion: string; tourRowVersion: string; registrationRowVersion: string; rosterRowVersion: string; canReview: boolean
}
export type RosterEmailChangeInput = {
  requestId: string; proposedEmail: string; expectedTourRowVersion: string
  expectedRegistrationRowVersion: string; expectedRowVersion: string
}
export type RepresentativeRegistration = {
  summary: RegistrationSummary; contactName: string; contactEmail: string; rowVersion: string; tourRowVersion: string
  rejectionReason: string | null; reviewedAt: string | null; roster: RepresentativeRosterRow[]
  allowedActions: { edit: ActionGate; resubmit: ActionGate; cancel: ActionGate }
}
export type RegistrationInput = {
  schoolName: string; groupName: string; contactName: string; contactEmail: string; expectedTourRowVersion: string; roster: RegistrationRosterInput[]
}
export type ListParameters = { search?: string; sort?: string; page?: number; size?: number; tourId?: string; state?: RegistrationState; group?: RegistrationGroup }

