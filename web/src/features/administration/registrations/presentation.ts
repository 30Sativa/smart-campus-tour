
export const STATE_LABEL = { SUBMITTED: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' } as const
const timeFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export const reviewTime = (value: string) => `${timeFormat.format(new Date(value))} (UTC+7)`

/** Calendar dates refer to Vietnam time; the server's upper boundary is exclusive. */
export function dateBoundary(day: string, end = false) {
  if (!day) return undefined
  const instant = new Date(`${day}T00:00:00+07:00`)
  if (!Number.isFinite(instant.getTime())) return undefined
  return new Date(instant.getTime() + (end ? 86400000 : 0)).toISOString()
}
