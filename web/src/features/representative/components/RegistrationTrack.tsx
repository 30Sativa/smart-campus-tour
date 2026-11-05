import type { RegistrationState, TourState } from '../api/types'

/** A compact record of registration and Tour states, without inferring attendance. */
export function RegistrationTrack({ state, tourState }: { state: RegistrationState; tourState: TourState }) {
  const review = state === 'APPROVED' ? 'Có dòng được chấp nhận' : state === 'REJECTED' ? 'Bị từ chối' : state === 'CANCELLED' ? 'Đã hủy' : 'Đang xét duyệt'
  const tour = tourState === 'COMPLETED' ? 'Buổi đã hoàn thành' : tourState === 'CANCELLED' ? 'Buổi đã hủy' : tourState === 'RUNNING' ? 'Buổi đang diễn ra' : 'Theo lịch tham quan'
  return <ol className="rep-track" aria-label="Trạng thái hồ sơ"><li>Đã gửi</li><li>{review}</li><li>{tour}</li></ol>
}
