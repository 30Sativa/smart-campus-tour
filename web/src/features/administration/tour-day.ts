/** Day grouping and naming for the Tour list ("Hôm nay · Thứ Sáu 09/10"). */

const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
const pad = (n: number) => String(n).padStart(2, '0')
const startOfDay = (value: Date) => { const d = new Date(value); d.setHours(0, 0, 0, 0); return d }

/** Local calendar day of a Tour, the key the list is grouped by. */
export const tourDayKey = (value: string) => { const d = new Date(value); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

/** "Hôm nay · Thứ Sáu 09/10", "Ngày mai · Thứ Bảy 10/10", "Thứ Hai 12/10" (year only when it is not this year). */
export function dayHeading(value: string, now: Date = new Date()) {
  const d = new Date(value)
  const k = Math.round((+startOfDay(d) - +startOfDay(now)) / 864e5)
  const date = `${WEEKDAY[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}${d.getFullYear() === now.getFullYear() ? '' : `/${d.getFullYear()}`}`
  const relative = k === 0 ? 'Hôm nay' : k === 1 ? 'Ngày mai' : k === -1 ? 'Hôm qua' : null
  return { text: relative ? `${relative} · ${date}` : date, today: k === 0 }
}

/** "Tham quan từ xa · Buổi chiều" reads as "Buổi chiều" in the list; the full name stays in the title. */
export const shortName = (name: string) => name.replace(/^Tham quan từ xa\s*·\s*/i, '')
