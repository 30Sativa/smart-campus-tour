import { describe, expect, it } from 'vitest'
import type { RepresentativeRosterRow } from './api/types'
import { matchRosterIdentities, rosterFieldChanges, rosterInput, rosterReplacement } from './registration-roster'

const personal: RepresentativeRosterRow = { id: 'row-personal', rowNumber: 2, rowType: 'INDIVIDUAL', displayName: 'Học sinh', email: 'student@example.test', className: '12A', participationState: 'ACCEPTED', rowVersion: 'version', invitationRowVersion: 'invite-version', canRemove: true }
const shared: RepresentativeRosterRow = { id: 'row-shared', rowNumber: 3, rowType: 'SHARED_VIEWING', displayName: 'Phòng xem', email: 'room@example.test', className: null, participationState: 'PENDING', canRemove: true }

describe('registration roster stable identity and request boundary', () => {
  it('whitelists exactly the input fields and maps returned id to rowId', () => {
    expect(JSON.parse(JSON.stringify(rosterInput(personal)))).toEqual({ rowNumber: 2, rowType: 'INDIVIDUAL', displayName: 'Học sinh', email: 'student@example.test', className: '12A', rowId: 'row-personal' })
    expect(Object.keys(rosterInput(personal)).sort()).toEqual(['rowNumber', 'rowType', 'displayName', 'email', 'className', 'rowId'].sort())
  })
  it('matches normalized email on whole-file import while retaining accepted row identity', () => {
    const incoming = matchRosterIdentities([{ ...personal, email: ' STUDENT@EXAMPLE.TEST ' }], [personal, shared])
    expect(incoming[0].rowId).toBe(personal.id)
    const diff = rosterReplacement([personal, shared], incoming)
    expect(diff.unchanged.map(item => item.before.id)).toEqual([personal.id])
    expect(diff.removed.map(item => item.id)).toEqual([shared.id])
    expect(diff.acceptedAffected).toBe(false)
    expect(diff.issues).toEqual([])
  })
  it('requires explicit review for accepted row information changes and removals', () => {
    const changed = matchRosterIdentities([{ ...personal, className: '12B' }], [personal])
    expect(rosterReplacement([personal], changed).acceptedAffected).toBe(true)
    expect(rosterReplacement([personal], []).acceptedAffected).toBe(true)
  })
  it('refuses an accepted email replacement through an imported file', () => {
    const incoming = matchRosterIdentities([{ ...personal, email: 'new@example.test' }], [personal])
    expect(incoming[0].rowId).toBeUndefined()
    expect(rosterReplacement([personal], incoming).issues.join(' ')).toContain('yêu cầu đổi email')
  })
  it('refuses type changes on an accepted row and server-forbidden removals', () => {
    expect(rosterReplacement([personal], [{ ...rosterInput(personal), rowType: 'SHARED_VIEWING' }]).issues.join(' ')).toContain('hình thức')
    expect(rosterReplacement([{ ...shared, canRemove: false }], []).issues.join(' ')).toContain('Không thể loại')
  })
  it('counts a row that only moved in the file as unchanged but still sends its new position', () => {
    const incoming = matchRosterIdentities([{ ...shared, rowNumber: 2 }, { ...personal, rowNumber: 3 }], [personal, shared])
    const diff = rosterReplacement([personal, shared], incoming)
    expect(diff.changed).toEqual([])
    expect(diff.unchanged).toHaveLength(2)
    expect(diff.acceptedAffected).toBe(false)
    expect(incoming.map(row => [row.rowId, row.rowNumber])).toEqual([[shared.id, 2], [personal.id, 3]])
  })
  it('lists only fields that really changed; spacing or Unicode form of the same value is not a change', () => {
    const sameValue = { ...personal, displayName: ' Học   sinh ', className: ' 12A ' } // NFD "ọ" and extra spaces
    const [same] = matchRosterIdentities([sameValue], [personal])
    expect(rosterFieldChanges(personal, same)).toEqual([])
    expect(rosterReplacement([personal], [same]).unchanged).toHaveLength(1)
    const [moved] = matchRosterIdentities([{ ...personal, rowNumber: 9, className: '12B' }], [personal])
    expect(rosterFieldChanges(personal, moved)).toEqual([{ field: 'className', before: '12A', after: '12B' }])
  })
  it('fails safely when a legacy detailed row has no identity', () => {
    expect(rosterReplacement([{ ...personal, id: undefined }], [rosterInput(personal)]).issues.join(' ')).toContain('thiếu định danh')
  })
})
