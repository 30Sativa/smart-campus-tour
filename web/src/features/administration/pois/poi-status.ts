import type { PoiProposal } from '../../technical/api/technical'

/**
 * Where a POI proposal stands, from its current revision: a draft not yet
 * submitted, submitted and waiting for the technical check, passed, or failed
 * and waiting for Staff to fix it.
 */
export type PoiStatus = 'DRAFT' | 'WAIT' | 'PASS' | 'FAIL'

export const poiStatus = (p: PoiProposal): PoiStatus =>
  !p.revision.isSubmitted ? 'DRAFT' : p.revision.navigationStatus === 'PASS' ? 'PASS' : p.revision.navigationStatus === 'FAIL' ? 'FAIL' : 'WAIT'

/** Staff's own POI work: a draft to finish and submit, or a failed revision to fix. WAIT is Technical Staff's. */
export const needsStaffWork = (p: PoiProposal) => {
  const status = poiStatus(p)
  return status === 'DRAFT' || status === 'FAIL'
}
