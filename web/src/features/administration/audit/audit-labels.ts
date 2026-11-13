import type { AuditLogEntry } from './audit-api'

/**
 * Vietnamese names for audit actions. Filters send the code; people read the label.
 *
 * Keeping the list complete: `audit-labels.test.ts` scans `backend/src` for every
 * action code written to the audit log (see `backend-audit-codes.ts`) and fails,
 * naming each code that has no label here. When it fails, add the code to the
 * group it belongs to below. To check by hand:
 *   cd web && npx vitest run src/features/administration/audit
 * Codes the scanner cannot see because the backend builds them at runtime are
 * listed here by hand: `INVITATION_` + operation (backend `ManageInvitationCommand`),
 * and `PASSWORD_RESET_BY_ADMIN` (POST /api/admin/accounts/{id}/reset-password,
 * added on the account branch). `TOUR_CREATED_SHORT_NOTICE` and `TOUR_COMPLETED`
 * are Tour events today, not audit rows; they keep a label so a later audit row
 * never reads as unknown.
 */
export const AUDIT_ACTION_GROUPS: { label: string; actions: Record<string, string> }[] = [
  { label: 'Tài khoản', actions: {
    ACCOUNT_CREATED: 'Tạo tài khoản', ACCOUNT_UPDATED: 'Sửa tài khoản', ACCOUNT_DEACTIVATED: 'Khóa tài khoản',
    ACCOUNT_REACTIVATED: 'Mở lại tài khoản', PROFILE_UPDATED: 'Sửa hồ sơ cá nhân', PASSWORD_CHANGED: 'Đổi mật khẩu',
    PASSWORD_RESET_BY_ADMIN: 'Admin đặt lại mật khẩu',
  } },
  { label: 'Tour', actions: {
    TOUR_CREATED: 'Tạo Tour', TOUR_CREATED_SHORT_NOTICE: 'Tạo Tour nhanh', TOUR_UPDATED: 'Sửa Tour',
    TOUR_CAPACITY_CHANGED: 'Đổi sức chứa Tour', TOUR_OPERATOR_CHANGED: 'Đổi người vận hành Tour',
    TOUR_READY: 'Chốt Tour', TOUR_REOPENED: 'Mở lại Tour để sửa', TOUR_CANCELLED: 'Hủy Tour',
    TOUR_REGISTRATION_CANCELLED: 'Hủy đăng ký do hủy Tour', TOUR_INVITATION_REVOKED: 'Thu hồi lời mời do hủy Tour',
  } },
  { label: 'Vận hành Tour', actions: {
    TOUR_STARTED: 'Bắt đầu Tour', TOUR_NEXT: 'Sang điểm dừng tiếp theo', TOUR_LEG_RETRIED: 'Thử lại chặng di chuyển',
    COMMAND_RECONCILED: 'Đóng lệnh robot chưa rõ kết quả', TOUR_ENDED_EARLY: 'Kết thúc Tour sớm', TOUR_COMPLETED: 'Hoàn thành Tour',
    ROBOT_DISPATCH_CHANGED: 'Cho phép hoặc dừng điều phối robot', ROBOT_INSPECTION_RELEASED: 'Xác nhận robot an toàn sau kiểm tra',
  } },
  { label: 'Lịch vận hành', actions: {
    SCHEDULE_BLOCK_CREATED: 'Khoá ngày hoặc ca', SCHEDULE_BLOCK_REMOVED: 'Gỡ khoá ngày hoặc ca',
  } },
  { label: 'Đăng ký đoàn', actions: {
    REGISTRATION_SUBMITTED: 'Gửi đăng ký', REGISTRATION_RESUBMITTED: 'Gửi lại đăng ký', REGISTRATION_UPDATED: 'Sửa đăng ký',
    REGISTRATION_APPROVED: 'Duyệt đăng ký', REGISTRATION_REJECTED: 'Từ chối đăng ký', REGISTRATION_CANCELLED: 'Hủy đăng ký',
    REGISTRATION_EXPIRED: 'Hết hạn duyệt đăng ký',
    ROSTER_ROW_ACCEPTED: 'Duyệt dòng danh sách', ROSTER_ROW_REJECTED: 'Từ chối dòng danh sách',
    ROSTER_PENDING_EXPIRED: 'Hết hạn dòng và yêu cầu chưa duyệt',
    ROSTER_EMAIL_CHANGE_REQUESTED: 'Yêu cầu đổi email', ROSTER_EMAIL_CHANGE_ACCEPTED: 'Duyệt yêu cầu đổi email',
    ROSTER_EMAIL_CHANGE_REJECTED: 'Từ chối yêu cầu đổi email', ROSTER_EMAIL_CORRECTED: 'Sửa email danh sách',
  } },
  { label: 'Lời mời', actions: {
    // `INVITATION_` + operation, built at runtime by the backend.
    INVITATION_ISSUE: 'Phát hành lời mời cho đoàn', INVITATION_RESEND: 'Gửi lại email lời mời',
    INVITATION_REISSUE: 'Cấp lại mã truy cập', INVITATION_REVOKE: 'Thu hồi lời mời',
    INVITATION_ISSUED: 'Tạo lời mời', INVITATION_ENTERED: 'Học sinh vào Tour lần đầu',
    INVITATION_REVOKED_BY_REGISTRATION_CANCEL: 'Thu hồi lời mời do hủy đăng ký',
    INVITATION_REVOKED_BY_ROSTER_REMOVAL: 'Thu hồi lời mời do bỏ khỏi danh sách',
  } },
  { label: 'Email', actions: {
    EMAIL_SEND_REQUESTED: 'Xếp hàng email lời mời', EMAIL_SEND_STARTED: 'Bắt đầu gửi email lời mời',
    EMAIL_SEND_RESULT: 'Kết quả gửi email lời mời',
    TOUR_CANCEL_NOTICE_REQUESTED: 'Xếp hàng email hủy Tour', TOUR_CANCEL_NOTICE_STARTED: 'Bắt đầu gửi email hủy Tour',
    TOUR_CANCEL_NOTICE_SENT: 'Đã gửi email hủy Tour', TOUR_CANCEL_NOTICE_FAILED: 'Gửi email hủy Tour thất bại',
    ROSTER_EXPIRY_NOTICE_REQUESTED: 'Xếp hàng email hết hạn', ROSTER_EXPIRY_NOTICE_STARTED: 'Bắt đầu gửi email hết hạn',
    ROSTER_EXPIRY_NOTICE_SENT: 'Đã gửi email hết hạn', ROSTER_EXPIRY_NOTICE_FAILED: 'Gửi email hết hạn thất bại',
  } },
  { label: 'Tuyến', actions: {
    ROUTE_CREATED: 'Tạo tuyến', ROUTE_UPDATED: 'Sửa tuyến', ROUTE_DELETED: 'Xóa tuyến',
    ROUTE_REVISION_CREATED: 'Tạo phiên bản tuyến', ROUTE_REVISION_SUBMITTED: 'Gửi kiểm chứng tuyến',
    ROUTE_TEST_PASSED: 'Chạy thử tuyến đạt', ROUTE_TEST_FAILED: 'Chạy thử tuyến không đạt',
    ROUTE_DEACTIVATED: 'Ngừng sử dụng tuyến', ROUTE_ACTIVATED: 'Mở lại tuyến',
  } },
  { label: 'POI', actions: {
    POI_CREATED: 'Tạo POI', POI_UPDATED: 'Sửa POI', POI_ACTIVATED: 'Mở lại POI', POI_DEACTIVATED: 'Ngừng dùng POI',
    POI_PROPOSAL_CREATED: 'Tạo đề xuất POI', POI_PROPOSAL_REVISION_CREATED: 'Tạo phiên bản POI', POI_PROPOSAL_SUBMITTED: 'Gửi kiểm chứng POI',
    POI_PROPOSAL_DISCARDED: 'Bỏ đề xuất POI', POI_TECHNICAL_VERIFIED: 'Kiểm chứng POI đạt', POI_TECHNICAL_REJECTED: 'Kiểm chứng POI không đạt',
    POI_POSE_IMPORT_COMPLETED: 'Nhập POI từ file', POI_POSE_CAPTURE_VERIFIED: 'Ghi nhận vị trí trực tiếp trên robot',
  } },
  { label: 'Bản đồ và robot', actions: {
    MAP_VERSION_UPLOADED: 'Tải lên bản đồ', MAP_DEPLOYMENT_CHECK_RECORDED: 'Ghi kiểm tra bản đồ',
    PHYSICAL_ROBOT_REGISTERED: 'Đăng ký robot', ROBOT_DEACTIVATED: 'Ngừng dùng robot', ROBOT_ACTIVATED: 'Mở lại robot',
    ROBOT_MAP_ASSIGNED: 'Gán bản đồ cho robot', ROBOT_MAP_CLEARED: 'Gỡ bản đồ khỏi robot',
    ROBOT_CREDENTIAL_ISSUED: 'Cấp khóa robot', ROBOT_CREDENTIAL_ROTATED: 'Cấp lại khóa robot', ROBOT_CREDENTIAL_REVOKED: 'Thu hồi khóa robot',
  } },
]

/** Actions a student takes through an invitation link, with no account behind them. */
export const STUDENT_INVITATION_ACTIONS: ReadonlySet<string> = new Set(['INVITATION_ENTERED'])

const ACTION_LABELS: Record<string, string> = Object.assign({}, ...AUDIT_ACTION_GROUPS.map(group => group.actions))
const ENTITY_LABELS: Record<string, string> = {
  User: 'Tài khoản', Tour: 'Tour', GroupRegistration: 'Đăng ký đoàn', RosterRow: 'Dòng danh sách', RosterEmailChangeRequest: 'Yêu cầu đổi email',
  Invitation: 'Lời mời', Route: 'Tuyến', RouteRevision: 'Phiên bản tuyến', Poi: 'POI', PoiProposal: 'POI', PoiProposalRevision: 'Phiên bản POI',
  MapVersion: 'Bản đồ', Robot: 'Robot', PoiImport: 'Nhập POI', TourScheduleBlock: 'Khoá lịch',
}
const RESULT_LABELS: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }> = {
  SUCCESS: { label: 'Thành công', tone: 'ok' }, OK: { label: 'Thành công', tone: 'ok' }, PASS: { label: 'Đạt', tone: 'ok' },
  FAIL: { label: 'Không đạt', tone: 'danger' }, FAILED: { label: 'Thất bại', tone: 'danger' },
  ACCEPTED: { label: 'Đã gửi', tone: 'ok' }, PENDING: { label: 'Đang chờ', tone: 'muted' }, UNKNOWN: { label: 'Chưa rõ kết quả', tone: 'warn' },
  SYSTEM: { label: 'Tự động', tone: 'muted' }, SYSTEM_NO_START: { label: 'Tự huỷ: không bắt đầu đúng giờ', tone: 'warn' },
  DRAFT: { label: 'Bản nháp', tone: 'muted' }, SUBMITTED: { label: 'Đã gửi', tone: 'muted' }, IMPORTED: { label: 'Đã nhập', tone: 'ok' },
  DISCARDED: { label: 'Đã bỏ', tone: 'muted' },
}

export const auditActionLabel = (action: string) => ACTION_LABELS[action] ?? 'Thao tác khác'
export const isKnownAuditAction = (action: string) => Object.hasOwn(ACTION_LABELS, action)
export const auditEntityLabel = (entityType: string) => ENTITY_LABELS[entityType] ?? 'Đối tượng khác'
export const auditResult = (resultCode: string | null) => (resultCode ? RESULT_LABELS[resultCode] : undefined) ?? null
/** Who did it: the account's name; a student's invitation step when there is no account; otherwise the system. */
export const auditActorLabel = (entry: Pick<AuditLogEntry, 'action' | 'actorName'>) =>
  entry.actorName ?? (STUDENT_INVITATION_ACTIONS.has(entry.action) ? 'Học sinh (lời mời)' : 'Hệ thống')
