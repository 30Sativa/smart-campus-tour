import type { PoiProposal } from '../../technical/api/technical'

/**
 * Where a POI proposal stands, from its current revision: a draft not yet
 * submitted, submitted and waiting for the technical check, passed, or failed
 * and waiting for Staff to fix it.
 *
 * The check result comes first. A PASS belongs to the navigation fingerprint, so
 * a revision that only changed its name or text keeps the PASS without being
 * submitted again, and a route may use it (SaveRouteRevision). Reading
 * `isSubmitted` first labelled such a POI "Bản nháp" while Technical showed it as passed.
 */
export type PoiStatus = 'DRAFT' | 'WAIT' | 'PASS' | 'FAIL'

export const poiStatus = (p: PoiProposal): PoiStatus =>
  p.revision.navigationStatus === 'PASS' ? 'PASS' : p.revision.navigationStatus === 'FAIL' ? 'FAIL' : p.revision.isSubmitted ? 'WAIT' : 'DRAFT'

/**
 * Staff's own POI work: a draft to finish and submit, or a failed revision to fix. WAIT is Technical Staff's.
 * A retired POI (ADR-0062) takes no new work until it is reactivated, so it is nobody's work.
 */
export const needsStaffWork = (p: PoiProposal) => {
  if (p.retiredAt) return false
  const status = poiStatus(p)
  return status === 'DRAFT' || status === 'FAIL'
}
