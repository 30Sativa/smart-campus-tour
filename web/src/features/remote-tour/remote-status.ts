import type { StudentSnapshot } from '../../api/contracts/remote-tour'

export const labels: Record<string, string> = { SCHEDULED: 'Đang nhận đăng ký', READY: 'Đã chốt buổi', RUNNING: 'Đang diễn ra', COMPLETED: 'Đã hoàn thành', CANCELLED: 'Đã hủy', SUBMITTED: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Bị từ chối', NORMAL: 'Bình thường', NEEDS_ASSISTANCE: 'Cần hỗ trợ', NAVIGATING: 'Đang di chuyển', PREPARING: 'Đang chuẩn bị góc nhìn', OBSERVING: 'Đang giới thiệu', FRONT: 'Đang quay về phía trước', RETURNING: 'Đang về điểm kết thúc' }

export function studentStatus(s: StudentSnapshot): string {
  if (s.access === 'ended') return s.tour.state === 'COMPLETED' ? 'Buổi tham quan đã hoàn thành' : 'Buổi tham quan đã hủy'
  if (s.access === 'join' || s.access === 'denied') return 'Nhập thông tin để xác nhận quyền tham gia'
  if (s.access === 'updating') return 'Danh sách đang được cập nhật'
  if (s.access !== 'live') return 'Đang chờ buổi tham quan bắt đầu'
  if (s.tour.operation === 'NEEDS_ASSISTANCE') return 'Tạm gián đoạn · Nhân viên đang hỗ trợ'
  if (s.tour.step === 'RETURNING') return 'Đang về điểm kết thúc'
  const poi = s.route?.pois[s.tour.poiIndex]?.name ?? ''
  if (s.tour.step === 'NAVIGATING') return `Đang di chuyển tới ${poi}`
  if (s.tour.step === 'FRONT') return 'Đang chuẩn bị di chuyển'
  if (s.tour.step === 'PREPARING') return `Đang chuẩn bị góc nhìn tại ${poi}`
  return s.tour.hold ? `Đang giữ để quan sát ${poi}` : `Đang giới thiệu ${poi}`
}

