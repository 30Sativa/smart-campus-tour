export type Period = 'year' | 'quarter' | 'month'
export type State = 'COMPLETED' | 'CANCELLED' | 'RUNNING' | 'READY' | 'SCHEDULED'
export type Filters = { period: Period; year: number; month: number; quarter: number; scope: 'all' | 'mine'; compare: boolean }
export type Tour = { date: string; state: State; mine: boolean }
export const CUTOFF = '2026-11-13'
export const stateLabels: Record<State, string> = { COMPLETED: 'Đã hoàn thành', CANCELLED: 'Đã hủy', RUNNING: 'Đang diễn ra', READY: 'Đã chốt', SCHEDULED: 'Chưa chốt' }
export const pad = (value: number) => String(value).padStart(2, '0')
export const dayKey = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`
export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()
export const tours: Tour[] = []
// Synthetic product sample only. Not API data, attendance, or measured results.
for (const [year, counts] of [[2025, [10, 8, 15, 17, 20, 12, 11, 16, 22, 25, 22, 18]], [2026, [12, 9, 18, 22, 26, 16, 14, 20, 28, 32, 21, 0]]] as const) {
  counts.forEach((count, index) => {
    const month = index + 1
    const days = year === 2026 && month === 11 ? 12 : daysInMonth(year, month)
    for (let i = 0; i < count; i++) tours.push({ date: dayKey(year, month, 1 + Math.floor(i * days / count)), state: (i + month) % 11 === 0 ? 'CANCELLED' : 'COMPLETED', mine: i % 3 !== 0 })
  })
}
for (const state of ['RUNNING', 'READY', 'SCHEDULED'] as const) tours.push({ date: CUTOFF, state, mine: true })
export function bounds(f: Filters, year = f.year) {
  const startMonth = f.period === 'year' ? 1 : f.period === 'quarter' ? (f.quarter - 1) * 3 + 1 : f.month
  const endMonth = f.period === 'year' ? 12 : f.period === 'quarter' ? startMonth + 2 : f.month
  const start = dayKey(year, startMonth, 1)
  const requestedEnd = dayKey(year, endMonth, daysInMonth(year, endMonth))
  // Match the same elapsed calendar dates for the comparison year.
  const comparisonCutoff = f.year === 2026 ? dayKey(year, 11, 13) : dayKey(year, 12, 31)
  return { start, end: requestedEnd < comparisonCutoff ? requestedEnd : comparisonCutoff, startMonth, endMonth }
}
export function selectTours(f: Filters, year = f.year) {
  const { start, end } = bounds(f, year)
  return tours.filter(t => t.date >= start && t.date <= end && (f.scope === 'all' || t.mine))
}
export function summarize(rows: Tour[]) {
  const completed = rows.filter(t => t.state === 'COMPLETED').length
  const cancelled = rows.filter(t => t.state === 'CANCELLED').length
  const ended = completed + cancelled
  return { total: rows.length, completed, cancelled, pending: rows.length - ended, rate: ended ? completed / ended * 100 : null }
}
export function buckets(f: Filters) {
  const current = selectTours(f)
  const previous = selectTours(f, f.year - 1)
  const range = bounds(f)
  const values = f.period === 'month' ? Array.from({ length: daysInMonth(f.year, f.month) }, (_, i) => i + 1) : Array.from({ length: range.endMonth - range.startMonth + 1 }, (_, i) => i + range.startMonth)
  return values.map(value => {
    const match = (t: Tour) => Number(t.date.slice(f.period === 'month' ? 8 : 5, f.period === 'month' ? 10 : 7)) === value
    return { value, label: f.period === 'month' ? `${pad(value)}/${pad(f.month)}` : `Tháng ${value}`, rows: current.filter(match), previous: previous.filter(match) }
  })
}
export function readFilters(search: string): Filters {
  const p = new URLSearchParams(search)
  const integer = (key: string, fallback: number, min: number, max: number) => { const n = Number(p.get(key)); return Number.isInteger(n) && n >= min && n <= max ? n : fallback }
  return { period: p.get('period') === 'month' ? 'month' : p.get('period') === 'quarter' ? 'quarter' : 'year', year: integer('year', 2026, 2025, 2026), month: integer('month', 11, 1, 12), quarter: integer('quarter', 4, 1, 4), scope: p.get('scope') === 'mine' ? 'mine' : 'all', compare: p.get('compare') !== '0' }
}
