import type { PoiProposal, PoiRevision, PoiVerification } from '../../technical/api/technical'
import { verificationState, type VerificationState } from '../../technical/poi-labels'

/**
 * Where a POI proposal stands, from its current revision: a draft not yet
 * submitted, submitted and waiting for the technical check, passed, or failed
 * and waiting for Staff to fix it. The rule and its wording live in `poi-labels.ts`.
 */
export type PoiStatus = VerificationState

export const poiStatus = (p: PoiProposal): PoiStatus => verificationState(p.revision)

/**
 * Staff's own POI work: a draft to finish and submit, or a failed revision to fix. WAIT is Technical Staff's.
 * A retired POI (ADR-0062) takes no new work until it is reactivated, so it is nobody's work.
 */
export const needsStaffWork = (p: PoiProposal) => {
  if (p.retiredAt) return false
  const status = poiStatus(p)
  return status === 'DRAFT' || status === 'FAIL'
}

/**
 * The FAIL record in effect: the check of the revision whose result the current one carries
 * (`verificationSourceRevisionId`, or itself), newest first. Without one, a FAIL of a revision with the same
 * navigation fingerprint. The API returns records unordered, so they are sorted by `checkedAt`.
 * Shared by the POI page's fail banner and the list's next-step line.
 */
export function effectiveFailRecord(revision: PoiRevision, revisions: PoiRevision[], records: PoiVerification[]): PoiVerification | null {
  const fails = records.filter(record => record.resultCode === 'FAIL').sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
  const sourceId = revision.verificationSourceRevisionId ?? revision.id
  const direct = fails.find(record => record.proposalRevisionId === sourceId || record.proposalRevisionId === revision.id)
  if (direct) return direct
  if (!revision.navigationFingerprint) return null
  const sameFingerprint = new Set(revisions.filter(item => item.navigationFingerprint === revision.navigationFingerprint).map(item => item.id))
  return fails.find(record => sameFingerprint.has(record.proposalRevisionId)) ?? null
}
