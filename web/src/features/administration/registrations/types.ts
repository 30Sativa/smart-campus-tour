import type { RegistrationState } from '../../registrations/registration-state'
import type { RosterRow } from '../../registrations/roster'
import type { RosterEmailChange } from '../../representative/api/types'

export type { RegistrationState }
/** The Staff view of an email-change request: the Representative's view plus when it lapses. */
export type StaffEmailChange = RosterEmailChange & { expiresAt: string }
export type EmailChangeDecisionInput = { requestId: string; expectedRequestRowVersion: string; expectedTourRowVersion: string
  expectedRegistrationRowVersion: string; expectedRowVersion: string; reason?: string }
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
export type ReviewRosterRow = RosterRow & { id: string; participationState: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'; rowVersion: string
  invitationRowVersion: string | null; reviewReason?: string | null; canApprove: boolean; canReject: boolean }
export type ReviewInput = { requestId: string; expectedRegistrationRowVersion: string; expectedTourRowVersion: string; expectedRowVersion: string; reason?: string }
export type EmailCorrectionInput = { requestId: string; email: string; expectedRowVersion: string; expectedTourRowVersion: string
  expectedRosterRowVersion: string; expectedInvitationRowVersion: string | null }
