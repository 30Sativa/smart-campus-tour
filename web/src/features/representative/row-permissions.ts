import type { RepresentativeRegistration, RepresentativeRosterRow } from './api/types'

export function canRequestRowEmail(registration: RepresentativeRegistration, row: RepresentativeRosterRow) {
  return row.participationState === 'ACCEPTED' && row.canRequestEmailChange === true && Boolean(row.id && row.rowVersion && registration.summary.id && registration.rowVersion && registration.tourRowVersion)
}
