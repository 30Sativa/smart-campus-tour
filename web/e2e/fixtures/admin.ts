import type { AccountListItem } from '../../src/features/administration/accounts/types'
import type { AuditLogEntry } from '../../src/features/administration/audit/audit-api'
import { at, ok, paged, type Handler } from '../support/mock-api'

const TOUR_ID = '0a1b2c3d-0000-4000-8000-000000000001'

/** Only actions the audit page has a Vietnamese label for, so "Thao tác khác" must never appear. */
export const auditLogs: AuditLogEntry[] = ([
  ['TOUR_STARTED', 'Tour', TOUR_ID, 'Nguyễn Minh Anh', 'SUCCESS'],
  ['TOUR_READY', 'Tour', TOUR_ID, 'Nguyễn Minh Anh', 'SUCCESS'],
  ['ROSTER_ROW_ACCEPTED', 'RosterRow', 'row-1', 'Nguyễn Minh Anh', 'ACCEPTED'],
  ['REGISTRATION_SUBMITTED', 'Registration', 'reg-1', 'Phạm Thu Hà', 'SUCCESS'],
  ['INVITATION_ISSUED', 'Invitation', 'inv-1', null, 'SYSTEM'],
  ['EMAIL_SEND_RESULT', 'Email', 'mail-1', null, 'SUCCESS'],
  ['ROUTE_TEST_PASSED', 'Route', 'route-1', 'Đỗ Kỹ Thuật', 'SUCCESS'],
  ['MAP_VERSION_UPLOADED', 'MapVersion', 'map-1', 'Đỗ Kỹ Thuật', 'SUCCESS'],
  ['PASSWORD_RESET_BY_ADMIN', 'Account', 'acc-2', 'Quản trị viên', 'SUCCESS'],
  ['ACCOUNT_CREATED', 'Account', 'acc-3', 'Quản trị viên', 'SUCCESS'],
] as const).map(([action, entityType, entityId, actorName, resultCode], index) => ({
  id: 100 - index, occurredAt: at(-15 * (index + 1)), action, entityType, entityId,
  actorUserId: actorName ? `user-${index}` : null, actorName,
  tourId: entityType === 'Tour' ? TOUR_ID : null, tourName: entityType === 'Tour' ? 'Tham quan Thư viện sáng thứ Sáu' : null,
  robotCode: action === 'TOUR_STARTED' ? 'AMR-01' : null, resultCode,
}))

export const accounts: AccountListItem[] = [
  { id: 'acc-1', username: 'admin.e2e', fullName: 'Quản trị viên', role: 'Admin', isActive: true, createdAt: at(-90 * 24 * 60), updatedAt: null, rowVersion: 'rv-1' },
  { id: 'acc-2', username: 'staff.e2e', fullName: 'Nguyễn Minh Anh', role: 'Staff', isActive: true, createdAt: at(-60 * 24 * 60), updatedAt: at(-24 * 60), rowVersion: 'rv-2' },
  { id: 'acc-3', username: 'kythuat.e2e', fullName: 'Đỗ Kỹ Thuật', role: 'TechnicalStaff', isActive: true, createdAt: at(-45 * 24 * 60), updatedAt: null, rowVersion: 'rv-3' },
  { id: 'acc-4', username: 'daidien.e2e', fullName: 'Phạm Thu Hà', role: 'Representative', isActive: false, createdAt: at(-30 * 24 * 60), updatedAt: at(-2 * 24 * 60), rowVersion: 'rv-4' },
]

export function adminHandlers(): Handler[] {
  return [
    { method: 'GET', path: /^\/api\/admin\/system-audit-logs\?/, reply: { json: paged(auditLogs) } },
    { method: 'GET', path: /^\/api\/admin\/accounts\?/, reply: { json: paged(accounts) } },
    { method: 'POST', path: /^\/api\/admin\/accounts\/[^/]+\/reset-password$/, reply: { json: ok(null) } },
  ]
}
