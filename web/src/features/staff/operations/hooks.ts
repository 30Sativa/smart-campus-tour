import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { toursApi } from '../../administration/tours/api/tours'
import { tourKeys } from '../../administration/tours/hooks'
import { dayEnd, dayStart } from '../../administration/tours/tour-calendar'
import type { StartConfirmation, TourDetails, TourListQuery } from '../../administration/tours/types'

/**
 * Server state for running Tours. Everything reads `/api/staff/manage/tours`
 * and shares the Tour management cache keys, so a write anywhere refreshes both
 * the preparation and the operations screens. There is no Tour push event yet
 * (`TourUpdated` is planned), so a Tour someone may act on is re-read often.
 */
const LIVE_TOUR_MS = 3_000
const LIST_MS = 15_000

const isLive = (detail: TourDetails | undefined) => detail?.tour.state === 'READY' || detail?.tour.state === 'RUNNING'

export function useOperationTour(id: string) {
  return useQuery({
    queryKey: tourKeys.detail(id),
    queryFn: () => toursApi.get(id),
    enabled: Boolean(id),
    refetchInterval: query => (isLive(query.state.data) ? LIVE_TOUR_MS : false),
  })
}

/** Evaluated now, without locks; Start re-runs them. Polled because telemetry ages in seconds. */
export function useStartChecks(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...tourKeys.all, 'start-checks', id],
    queryFn: () => toursApi.startChecks(id),
    enabled: Boolean(id) && enabled,
    refetchInterval: LIVE_TOUR_MS,
  })
}

const DAY_SIZE = 100
/** Every Tour of one campus day, in start order. */
export function useDayTours(day: string) {
  const query: TourListQuery = { from: dayStart(day), to: dayEnd(day), sort: 'scheduledStartAt', page: 1, size: DAY_SIZE }
  return useQuery({ queryKey: tourKeys.list(query), queryFn: () => toursApi.list(query), refetchInterval: LIST_MS })
}

const RUNNING_QUERY: TourListQuery = { phase: 'RUNNING', sort: 'scheduledStartAt', page: 1, size: 20 }
/**
 * Running Tours with their execution. The list summary carries no operational
 * status, so each running Tour's detail is read too; there are at most as many
 * as robots.
 */
export function useRunningTours() {
  const list = useQuery({ queryKey: tourKeys.list(RUNNING_QUERY), queryFn: () => toursApi.list(RUNNING_QUERY), refetchInterval: LIST_MS })
  const ids = list.data?.data.map(tour => tour.id) ?? []
  const details = useQueries({
    queries: ids.map(id => ({ queryKey: tourKeys.detail(id), queryFn: () => toursApi.get(id), refetchInterval: LIVE_TOUR_MS })),
  })
  const tours = details.flatMap(detail => (detail.data && detail.data.tour.state === 'RUNNING' ? [detail.data] : []))
  return { list, tours, isPending: list.isPending || details.some(detail => detail.isPending), isError: list.isError }
}

function useRefreshTours() {
  const client = useQueryClient()
  // A refusal can mean the Tour or a check changed meanwhile, so refresh either way.
  return () => client.invalidateQueries({ queryKey: tourKeys.all })
}

export function useStartTour() {
  const onSettled = useRefreshTours()
  return useMutation({
    mutationFn: ({ id, requestId, rowVersion, confirmation }: { id: string; requestId: string; rowVersion: string; confirmation: StartConfirmation }) =>
      toursApi.start(id, { requestId, expectedRowVersion: rowVersion, confirmation }),
    onSettled,
  })
}

export function useNextStop() {
  const onSettled = useRefreshTours()
  return useMutation({
    mutationFn: ({ id, requestId, rowVersion }: { id: string; requestId: string; rowVersion: string }) =>
      toursApi.next(id, { requestId, expectedRowVersion: rowVersion }),
    onSettled,
  })
}
