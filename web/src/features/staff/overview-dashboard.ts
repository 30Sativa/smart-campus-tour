import type { TourOperation, TourState } from '../../api/contracts/staff'

export type OverviewFilter = TourState | 'all' | 'assistance'
export type OverviewDay = { date: string; label: string; completed: number }

export const OVERVIEW_STATES: Array<{ state: TourState; color: string }> = [
  { state: 'Completed', color: '#2d719e' },
  { state: 'Running', color: '#5b9dc9' },
  { state: 'Ready', color: '#9ac1dc' },
  { state: 'Scheduled', color: '#d5e5f1' },
  { state: 'Cancelled', color: '#94a3b8' },
]

export function overviewDate(value: string | number | Date): string {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Count returned rows, with the newest snapshot taking precedence for each Tour ID. */
export function overviewDays(current: TourOperation[], history: TourOperation[], now: number): OverviewDay[] {
  const tours = new Map([...history, ...current].map(tour => [tour.id, tour]))
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now)
    day.setHours(12, 0, 0, 0)
    day.setDate(day.getDate() - 6 + index)
    const date = overviewDate(day)
    return { date, label: `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`,
      completed: [...tours.values()].filter(tour => tour.state === 'Completed' && overviewDate(tour.scheduledAt) === date).length }
  })
}

export function isOverviewFilter(value: string | null): value is OverviewFilter {
  return value === 'all' || value === 'assistance' || OVERVIEW_STATES.some(item => item.state === value)
}

export function matchesOverviewFilter(tour: TourOperation, filter: OverviewFilter): boolean {
  return filter === 'all' || (filter === 'assistance'
    ? tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance'
    : tour.state === filter)
}
