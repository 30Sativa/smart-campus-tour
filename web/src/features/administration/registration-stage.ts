import type { AdminRegistration } from '../../api/contracts/admin'

export type RegStage = 'wait' | 'noinv' | 'done' | 'rej' | 'can'

/** Where a registration sits in the review flow; the e-mail is a separate fact from the state (scope §3.4). */
export function regStage(reg: AdminRegistration): RegStage {
  if (reg.state === 'Submitted') return 'wait'
  if (reg.state === 'Rejected') return 'rej'
  if (reg.state === 'Cancelled') return 'can'
  return reg.invitationSentAt && !reg.invitationFailed ? 'done' : 'noinv'
}

export const REG_STAGE: Record<RegStage, { label: string; color: string; note?: string }> = {
  wait: { label: 'Chờ duyệt', color: '#d97706', note: 'Admin xem danh sách và quyết định' },
  noinv: { label: 'Chưa gửi thông tin', color: '#2563eb', note: 'Đã duyệt · gửi email đường dẫn + mã đoàn' },
  done: { label: 'Đã gửi thông tin', color: '#16a34a', note: 'Đoàn sẵn sàng tham gia' },
  rej: { label: 'Từ chối', color: '#dc2626' },
  can: { label: 'Đã hủy', color: '#64748b' },
}
export const REG_STAGES = Object.keys(REG_STAGE) as RegStage[]

