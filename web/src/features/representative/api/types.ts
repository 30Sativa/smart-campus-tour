import type { RosterRow } from '../../registrations/roster'
export type { RosterRow } from '../../registrations/roster'
export type TourState = 'SCHEDULED' | 'READY' | 'RUNNING' | 'COMPLETED' | 'CANCELLED'
export type RegistrationState = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
export type ActionGate = { allowed: boolean; reason: string | null }

export type RepresentativeTour = {
  id: string; name: string; description: string | null; scheduledStartAt: string; state: TourState; rowVersion: string
  routeName: string; stops: { order: number; name: string; description: string | null }[]; register: ActionGate
}
export type RegistrationSummary = {
  id: string; tourId: string; tourName: string; tourScheduledStartAt: string; tourState: TourState
  schoolName: string; groupName: string; state: RegistrationState; rowCount: number; submittedAt: string; updatedAt: string
}
export type RepresentativeRegistration = {
  summary: RegistrationSummary; contactName: string; contactEmail: string; rowVersion: string; tourRowVersion: string
  rejectionReason: string | null; reviewedAt: string | null; roster: RosterRow[]
  allowedActions: { edit: ActionGate; resubmit: ActionGate; cancel: ActionGate }
}
export type RegistrationInput = {
  schoolName: string; groupName: string; contactName: string; contactEmail: string; expectedTourRowVersion: string; roster: RosterRow[]
}
export type ListParameters = { search?: string; sort?: string; page?: number; size?: number; tourId?: string; state?: RegistrationState }

