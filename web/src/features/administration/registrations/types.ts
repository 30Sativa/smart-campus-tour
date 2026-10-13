import type { RegistrationState } from '../../registrations/registration-state'
import type { RosterRow } from '../../registrations/roster'

export type { RegistrationState }
export type ReviewSummary = {
  id: string; tourId: string; tourName: string; tourScheduledStartAt: string; tourState: string
  schoolName: string; groupName: string; state: RegistrationState; rowCount: number
  representativeName: string; submittedAt: string; updatedAt: string
}
export type ReviewDetails = {
  summary: ReviewSummary; contactName: string; contactEmail: string; rowVersion: string; tourRowVersion: string
  rejectionReason: string | null; reviewedAt: string | null; reviewedByUserId: string | null
  roster: ReviewRosterRow[]; review: { allowed: boolean; reason: string | null }; correctEmail: { allowed: boolean; reason: string | null }
}
export type ReviewFilters = {
  search?: string; sort?: string; page: number; size: number; state?: RegistrationState
  tourId?: string; from?: string; to?: string
}
export type ReviewInput = { expectedRowVersion: string; expectedTourRowVersion: string; reason?: string }
export type ReviewRosterRow = RosterRow & { id: string; rowVersion: string; invitationRowVersion: string | null }
export type EmailCorrectionInput = { requestId: string; email: string; expectedRowVersion: string; expectedTourRowVersion: string
  expectedRosterRowVersion: string; expectedInvitationRowVersion: string | null }
