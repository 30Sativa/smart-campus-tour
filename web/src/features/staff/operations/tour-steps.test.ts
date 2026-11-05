import { describe, expect, it } from 'vitest'
import type { TourDetails } from '../../administration/tours/types'
import { tourPageId } from './tour-origin'
import { tourSteps } from './tour-steps'

const at = (state: TourDetails['tour']['state'], startedAt: string | null = null) =>
  tourSteps({ tour: { id: 't1', state } as TourDetails['tour'], startedAt })
const statuses = (steps: ReturnType<typeof tourSteps>) => steps.map(step => step.status)
const links = (steps: ReturnType<typeof tourSteps>) => steps.map(step => step.to)

describe('Tour steps', () => {
  it('follows the Tour state, and links a page only when it has something to show', () => {
    expect(statuses(at('SCHEDULED'))).toEqual(['current', 'next', 'next', 'next'])
    expect(links(at('SCHEDULED'))).toEqual(['/staff/manage/tours/t1', null, null, null])
    expect(statuses(at('READY'))).toEqual(['done', 'current', 'next', 'next'])
    expect(links(at('READY'))).toEqual(['/staff/manage/tours/t1', '/staff/tours/t1/start', null, null])
    expect(statuses(at('RUNNING', '2026-11-07T02:00:00Z'))).toEqual(['done', 'done', 'current', 'next'])
    expect(links(at('RUNNING', '2026-11-07T02:00:00Z'))).toEqual(['/staff/manage/tours/t1', null, '/staff/live/t1', null])
    expect(statuses(at('COMPLETED', '2026-11-07T02:00:00Z'))).toEqual(['done', 'done', 'done', 'done'])
  })

  it('marks the check and the console skipped for a Tour cancelled before it ran', () => {
    const steps = at('CANCELLED')
    expect(statuses(steps)).toEqual(['done', 'skipped', 'skipped', 'done'])
    expect(steps[3].note).toBe('Đã hủy')
    expect(links(steps)).toEqual(['/staff/manage/tours/t1', null, null, null])
  })
})

describe('Tour pages', () => {
  it('knows the three pages of one Tour, and nothing else', () => {
    for (const path of ['/staff/manage/tours/t1', '/staff/manage/tours/t1/edit', '/staff/tours/t1', '/staff/tours/t1/start', '/staff/live/t1']) expect(tourPageId(path)).toBe('t1')
    for (const path of ['/staff/manage/tours', '/staff/manage/tours/new', '/staff/tours', '/staff/live', '/staff/schedule']) expect(tourPageId(path)).toBeNull()
  })
})
