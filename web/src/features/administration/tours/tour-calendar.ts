/** Tours are scheduled in campus time, whatever the clock on the reader's machine says. */
const ZONE = 'Asia/Ho_Chi_Minh'

/** `YYYY-MM-DD` of an instant on the campus calendar. */
export const campusDay = (value: string | Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))

export const campusTime = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))

export const campusDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))

export const campusStamp = (value: string) => `${campusTime(value)} ${campusDate(value)}`

/** `05/11`, for naming one saved or tested copy of something without its number. en-GB because vi-VN prints day and month alone as `05-11`. */
export const campusShortDate = (value: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, day: '2-digit', month: '2-digit' }).format(new Date(value))

/** `05/11 14:20` */
export const campusShortStamp = (value: string) => `${campusShortDate(value)} ${campusTime(value)}`

export const dayStart =(day: string) => new Date(`${day}T00:00:00+07:00`).toISOString()
export const dayEnd = (day: string) => new Date(`${day}T23:59:59.999+07:00`).toISOString()

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes && rest ? `${minutes} phút ${rest} giây` : minutes ? `${minutes} phút` : `${rest} giây`
}
