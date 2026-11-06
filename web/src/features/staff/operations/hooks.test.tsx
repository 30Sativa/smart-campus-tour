import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TourDetails, TourExecutionSummary, TourListQuery, TourSummary } from '../../administration/tours/types'
import { useRunningTours, useToursNeedingReconcile } from './hooks'

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }))
vi.mock('../../administration/tours/api/tours', () => ({ toursApi: api }))

const summary = (id: string, state: TourSummary['state'], execution?: TourExecutionSummary | null) =>
  ({ id, name: id, state, scheduledStartAt: '2026-11-05T02:00:00Z', ...(execution === undefined ? {} : { execution }) }) as TourSummary
const page = (rows: TourSummary[]) => ({ success: true, data: rows })
const situation = (overrides: Partial<TourExecutionSummary>): TourExecutionSummary =>
  ({ operationalStatus: 'NORMAL', assistanceReason: null, currentStep: 'NAVIGATING', commandState: 'PENDING', needsReconcile: false, ...overrides })

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => vi.clearAllMocks())

describe('useRunningTours', () => {
  it('reads the situation from the list rows without one detail request per Tour', async () => {
    api.list.mockResolvedValue(page([summary('t1', 'RUNNING', situation({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'NavigationFailed', commandState: 'FAILED' }))]))
    const { result } = renderHook(() => useRunningTours(), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.tours).toHaveLength(1)
    expect(result.current.tours[0].execution).toMatchObject({ operationalStatus: 'NEEDS_ASSISTANCE', commandState: 'FAILED' })
    expect(api.get).not.toHaveBeenCalled()
  })

  it('falls back to the detail when an older server sends no execution in the list', async () => {
    api.list.mockResolvedValue(page([summary('t1', 'RUNNING')]))
    api.get.mockResolvedValue({ tour: summary('t1', 'RUNNING'), execution: { state: 'RUNNING', operationalStatus: 'NORMAL', assistanceReason: null,
      currentStep: 'OBSERVING', command: { id: 'c1', kind: 'GoTo', state: 'ARRIVED', outcome: 'ARRIVED', reasonCode: null } } } as unknown as TourDetails)
    const { result } = renderHook(() => useRunningTours(), { wrapper })
    await waitFor(() => expect(result.current.tours).toHaveLength(1))
    expect(api.get).toHaveBeenCalledWith('t1')
    expect(result.current.tours[0].execution).toEqual({ operationalStatus: 'NORMAL', assistanceReason: null, currentStep: 'OBSERVING', commandState: 'ARRIVED' })
  })
})

describe('useToursNeedingReconcile', () => {
  it('asks the server for the Tours needing Reconcile, and still keeps only the rows it marks', async () => {
    api.list.mockResolvedValue(page([
      summary('held', 'CANCELLED', situation({ commandState: 'UNKNOWN', needsReconcile: true })),
      summary('done', 'COMPLETED', situation({ commandState: 'ARRIVED' })),
      summary('old', 'CANCELLED'),
    ]))
    const { result } = renderHook(() => useToursNeedingReconcile(), { wrapper })
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))
    expect(result.current.tours.map(tour => tour.id)).toEqual(['held'])
    // An older server ignores the filter and returns every finished Tour; the row flag still decides.
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining<Partial<TourListQuery>>({ phase: 'FINISHED', needsReconcile: true, sort: '-scheduledStartAt' }))
  })
})
