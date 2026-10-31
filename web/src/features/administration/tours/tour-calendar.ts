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

export const dayStart = (day: string) => new Date(`${day}T00:00:00+07:00`).toISOString()
export const dayEnd = (day: string) => new Date(`${day}T23:59:59.999+07:00`).toISOString()

/** Minutes after campus midnight. */
export const campusMinutes = (value: string) => {
  const [hours, minutes] = campusTime(value).split(':').map(Number)
  return hours * 60 + minutes
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes && rest ? `${minutes} phút ${rest} giây` : minutes ? `${minutes} phút` : `${rest} giây`
}
