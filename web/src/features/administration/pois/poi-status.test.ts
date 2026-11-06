import { describe, expect, it } from 'vitest'
import type { PoiProposal } from '../../technical/api/technical'
import { needsStaffWork, poiStatus } from './poi-status'

const proposal = (isSubmitted: boolean, navigationStatus: string | null) =>
  ({ revision: { isSubmitted, navigationStatus } }) as unknown as PoiProposal

describe('POI status', () => {
  it('tells a draft apart from a submitted POI waiting for the technical check', () => {
    expect(poiStatus(proposal(false, null))).toBe('DRAFT')
    expect(poiStatus(proposal(true, null))).toBe('WAIT')
    expect(poiStatus(proposal(true, 'PASS'))).toBe('PASS')
    expect(poiStatus(proposal(true, 'FAIL'))).toBe('FAIL')
  })

  it('counts only drafts and failed revisions as Staff work', () => {
    expect([proposal(false, null), proposal(true, null), proposal(true, 'PASS'), proposal(true, 'FAIL')].filter(needsStaffWork)).toHaveLength(2)
  })
})
