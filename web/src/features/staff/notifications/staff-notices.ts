import type { StaffNotification } from './notifications-api'

export type StaffNotice = {
  id: string
  tone: 'ok' | 'danger' | 'info'
  title: string
  detail: string
  occurredAt: string
  /** Null when the target is gone: the notice stays, without a link. */
  to: string | null
  toLabel: string
}

const revision = (n: StaffNotification) => (n.revisionNumber != null ? ` (bản ${n.revisionNumber})` : '')
const by = (n: StaffNotification) => (n.actorName ? n.actorName : 'Kỹ thuật')
const onRobot = (n: StaffNotification) => (n.robotCode ? ` trên robot ${n.robotCode}` : '')

/**
 * Words one Technical Staff outcome for Staff: what was decided, on what, and
 * where to go next. An action this screen does not know is left out rather than
 * shown as a raw code.
 */
export function toStaffNotice(n: StaffNotification): StaffNotice | null {
  const id = `tech-${n.id}`
  const poi = n.subject ? `POI "${n.subject}"${revision(n)}` : 'Một POI đã gửi'
  const route = n.subject ? `Tuyến "${n.subject}"${revision(n)}` : 'Một tuyến'
  const base = { id, occurredAt: n.occurredAt }
  switch (n.action) {
    case 'POI_TECHNICAL_VERIFIED':
    case 'POI_POSE_CAPTURE_VERIFIED':
      return { ...base, tone: 'ok', title: `${poi} đã được duyệt`, detail: `${by(n)} xác nhận đạt${onRobot(n)}. Có thể dùng POI này khi soạn tuyến.`,
        to: n.targetId ? `/staff/manage/pois/${n.targetId}` : null, toLabel: 'Mở POI' }
    case 'POI_TECHNICAL_REJECTED':
      return { ...base, tone: 'danger', title: `${poi} bị trả lại`, detail: `${by(n)} kiểm tra không đạt${onRobot(n)}. Xem lý do rồi sửa và gửi lại.`,
        to: n.targetId ? `/staff/manage/pois/${n.targetId}` : null, toLabel: 'Xem lý do' }
    case 'ROUTE_TEST_PASSED':
      return { ...base, tone: 'ok', title: `${route} chạy thử đạt`, detail: `${by(n)} ghi nhận chạy thử toàn tuyến đạt${onRobot(n)}. Có thể tạo Tour trên bản tuyến này.`,
        to: n.targetId ? `/staff/manage/routes/${n.targetId}` : null, toLabel: 'Mở tuyến' }
    case 'ROUTE_TEST_FAILED':
      return { ...base, tone: 'danger', title: `${route} chạy thử không đạt`, detail: `${by(n)} ghi nhận chạy thử không đạt${onRobot(n)}. Xem lý do trước khi sửa tuyến.`,
        to: n.targetId ? `/staff/manage/routes/${n.targetId}` : null, toLabel: 'Xem kết quả' }
    case 'MAP_DEPLOYMENT_CHECK_RECORDED': {
      const map = n.subject ? `Bản đồ ${n.subject}${n.revisionNumber != null ? ` v${n.revisionNumber}` : ''}` : 'Một bản đồ'
      return n.resultCode === 'PASS'
        ? { ...base, tone: 'info', title: `${map} đã sẵn sàng${onRobot(n)}`, detail: `${by(n)} xác nhận bản đồ chạy được trên robot. Có thể soạn POI trên phiên bản này.`,
          to: '/staff/manage/pois', toLabel: 'Mở Quản lý POI' }
        : { ...base, tone: 'danger', title: `${map} chưa đạt kiểm tra${onRobot(n)}`, detail: `${by(n)} ghi nhận bản đồ chưa định vị hoặc hiển thị đúng trên robot. Chưa dùng được cho POI mới.`,
          to: '/staff/manage/pois', toLabel: 'Mở Quản lý POI' }
    }
    case 'ROBOT_INSPECTION_RELEASED':
      return { ...base, tone: 'ok', title: n.robotCode ? `Robot ${n.robotCode} đã kiểm tra xong` : 'Một robot đã kiểm tra xong',
        detail: `${by(n)} xác nhận robot sẵn sàng lại sau buổi trước. Có thể dùng cho Tour tiếp theo.`, to: '/staff/robot', toLabel: 'Mở trang robot' }
    default:
      return null
  }
}

export function toStaffNotices(rows: StaffNotification[]): StaffNotice[] {
  return rows.flatMap(row => toStaffNotice(row) ?? [])
}
