/** Vietnamese names for audit actions. Filters send the code; people read the label. */
export const AUDIT_ACTION_GROUPS: { label: string; actions: Record<string, string> }[] = [
  { label: 'Tài khoản', actions: {
    ACCOUNT_CREATED: 'Tạo tài khoản', ACCOUNT_DEACTIVATED: 'Khóa tài khoản', ACCOUNT_REACTIVATED: 'Mở lại tài khoản',
  } },
  { label: 'Tour', actions: {
    TOUR_CREATED: 'Tạo Tour', TOUR_UPDATED: 'Sửa Tour', TOUR_CANCELLED: 'Hủy Tour',
    TOUR_REGISTRATION_CANCELLED: 'Hủy đăng ký do hủy Tour', TOUR_INVITATION_REVOKED: 'Thu hồi lời mời do hủy Tour',
    TOUR_CANCEL_NOTICE_REQUESTED: 'Xếp hàng email hủy Tour', TOUR_CANCEL_NOTICE_STARTED: 'Bắt đầu gửi email hủy Tour',
    TOUR_CANCEL_NOTICE_SENT: 'Đã gửi email hủy Tour', TOUR_CANCEL_NOTICE_FAILED: 'Gửi email hủy Tour thất bại',
  } },
  { label: 'Đăng ký đoàn', actions: {
    REGISTRATION_SUBMITTED: 'Gửi đăng ký', REGISTRATION_RESUBMITTED: 'Gửi lại đăng ký', REGISTRATION_UPDATED: 'Sửa đăng ký',
    REGISTRATION_APPROVED: 'Duyệt đăng ký', REGISTRATION_REJECTED: 'Từ chối đăng ký', REGISTRATION_CANCELLED: 'Hủy đăng ký',
    ROSTER_EMAIL_CHANGE_REQUESTED: 'Yêu cầu đổi email', ROSTER_EMAIL_CORRECTED: 'Sửa email danh sách',
  } },
  { label: 'Lời mời', actions: {
    INVITATION_ISSUED: 'Phát hành lời mời', INVITATION_ENTERED: 'Vào Tour bằng lời mời',
    INVITATION_REVOKED_BY_REGISTRATION_CANCEL: 'Thu hồi lời mời do hủy đăng ký',
    INVITATION_REVOKED_BY_ROSTER_REMOVAL: 'Thu hồi lời mời do bỏ khỏi danh sách',
  } },
  { label: 'Tuyến', actions: {
    ROUTE_REVISION_CREATED: 'Tạo phiên bản tuyến', ROUTE_REVISION_SUBMITTED: 'Gửi kiểm chứng tuyến',
    ROUTE_TEST_PASSED: 'Chạy thử tuyến đạt', ROUTE_TEST_FAILED: 'Chạy thử tuyến không đạt',
    ROUTE_DEACTIVATED: 'Ngừng sử dụng tuyến', ROUTE_ACTIVATED: 'Mở lại tuyến',
  } },
  { label: 'POI', actions: {
    POI_PROPOSAL_CREATED: 'Tạo POI', POI_PROPOSAL_REVISION_CREATED: 'Tạo phiên bản POI', POI_PROPOSAL_SUBMITTED: 'Gửi kiểm chứng POI',
    POI_TECHNICAL_VERIFIED: 'Kiểm chứng POI đạt', POI_TECHNICAL_REJECTED: 'Kiểm chứng POI không đạt',
    POI_POSE_IMPORT_COMPLETED: 'Nhập POI từ file', POI_POSE_CAPTURE_VERIFIED: 'Ghi nhận pose trực tiếp trên robot',
  } },
  { label: 'Bản đồ và robot', actions: {
    MAP_VERSION_UPLOADED: 'Tải lên bản đồ', MAP_DEPLOYMENT_CHECK_RECORDED: 'Ghi kiểm tra bản đồ',
    PHYSICAL_ROBOT_REGISTERED: 'Đăng ký robot', ROBOT_MAP_ASSIGNED: 'Gán bản đồ cho robot', ROBOT_MAP_CLEARED: 'Gỡ bản đồ khỏi robot',
    ROBOT_CREDENTIAL_ISSUED: 'Cấp khóa robot', ROBOT_CREDENTIAL_ROTATED: 'Cấp lại khóa robot', ROBOT_CREDENTIAL_REVOKED: 'Thu hồi khóa robot',
  } },
]

const ACTION_LABELS: Record<string, string> = Object.assign({}, ...AUDIT_ACTION_GROUPS.map(group => group.actions))
const ENTITY_LABELS: Record<string, string> = {
  User: 'Tài khoản', Tour: 'Tour', GroupRegistration: 'Đăng ký đoàn', RosterRow: 'Dòng danh sách', RosterEmailChangeRequest: 'Yêu cầu đổi email',
  Invitation: 'Lời mời', Route: 'Tuyến', RouteRevision: 'Phiên bản tuyến', Poi: 'POI', PoiProposal: 'POI', PoiProposalRevision: 'Phiên bản POI',
  MapVersion: 'Bản đồ', Robot: 'Robot', PoiImport: 'Nhập POI',
}
const RESULT_LABELS: Record<string, { label: string; tone: 'ok' | 'danger' | 'muted' }> = {
  SUCCESS: { label: 'Thành công', tone: 'ok' }, PASS: { label: 'Đạt', tone: 'ok' }, FAIL: { label: 'Không đạt', tone: 'danger' },
  DRAFT: { label: 'Bản nháp', tone: 'muted' }, SUBMITTED: { label: 'Đã gửi', tone: 'muted' }, IMPORTED: { label: 'Đã nhập', tone: 'ok' },
}

export const auditActionLabel = (action: string) => ACTION_LABELS[action] ?? 'Thao tác khác'
export const auditEntityLabel = (entityType: string) => ENTITY_LABELS[entityType] ?? 'Đối tượng khác'
export const auditResult = (resultCode: string | null) => (resultCode ? RESULT_LABELS[resultCode] : undefined) ?? null
