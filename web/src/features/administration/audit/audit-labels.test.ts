import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AUDIT_ACTION_GROUPS, auditActionLabel, auditActorLabel, isKnownAuditAction } from './audit-labels'
import { backendSourceExists, scanBackendAuditActions } from './backend-audit-codes'

const backend = resolve(process.cwd(), '../backend/src')
/** Scanner hits that are not audit actions: `NO_CHANGE` is a POI import receipt's action column. */
const NOT_AUDIT_ACTIONS = new Set(['NO_CHANGE'])

describe('audit action labels', () => {
  it.skipIf(!backendSourceExists(backend))('label every action code the backend writes to the audit log', () => {
    const codes = [...scanBackendAuditActions(backend)].filter(code => !NOT_AUDIT_ACTIONS.has(code))
    // Guards the scanner itself: these come from four different ways the backend sets an action.
    expect(codes).toEqual(expect.arrayContaining(['ACCOUNT_UPDATED', 'ROSTER_ROW_ACCEPTED', 'ROBOT_DISPATCH_CHANGED',
      'ROBOT_CREDENTIAL_ROTATED', 'EMAIL_SEND_RESULT', 'TOUR_ENDED_EARLY', 'SCHEDULE_BLOCK_CREATED', 'ROUTE_CREATED']))
    expect(codes.filter(code => !isKnownAuditAction(code)).sort()).toEqual([])
  })

  it('labels the codes the backend builds at runtime and the account reset', () => {
    for (const code of ['INVITATION_ISSUE', 'INVITATION_RESEND', 'INVITATION_REISSUE', 'INVITATION_REVOKE', 'PASSWORD_RESET_BY_ADMIN',
      'TOUR_CREATED_SHORT_NOTICE', 'TOUR_COMPLETED', 'POI_PROPOSAL_DISCARDED', 'ROSTER_EMAIL_CHANGE_REJECTED'])
      expect(auditActionLabel(code)).not.toBe('Thao tác khác')
  })

  it('files each code under one group only, with distinct labels inside a group', () => {
    const codes = AUDIT_ACTION_GROUPS.flatMap(group => Object.keys(group.actions))
    expect(new Set(codes).size).toBe(codes.length)
    for (const group of AUDIT_ACTION_GROUPS) {
      const labels = Object.values(group.actions)
      expect(new Set(labels).size).toBe(labels.length)
      expect(group.label).not.toBe('Thao tác khác')
    }
  })

  it('names a student invitation step and otherwise the system when no account acted', () => {
    expect(auditActorLabel({ action: 'INVITATION_ENTERED', actorName: null })).toBe('Học sinh (lời mời)')
    expect(auditActorLabel({ action: 'TOUR_CANCELLED', actorName: null })).toBe('Hệ thống')
    expect(auditActorLabel({ action: 'INVITATION_ENTERED', actorName: 'Lan' })).toBe('Lan')
    expect(isKnownAuditAction('constructor')).toBe(false)
  })
})
