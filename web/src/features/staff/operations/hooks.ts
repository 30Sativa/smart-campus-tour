import { useRef } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { toursApi } from '../../administration/tours/api/tours'
import { newRequestId, tourKeys } from '../../administration/tours/hooks'
import { dayEnd, dayStart } from '../../administration/tours/tour-calendar'
import type { StartConfirmation, TourDetails, TourExecutionSummary, TourListQuery, TourSummary } from '../../administration/tours/types'

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
    // The checks for opening the Tour without its first leg: the robot moves only when the Operator departs.
    queryFn: () => toursApi.startChecks(id, true),
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

const AHEAD_DAYS = 7
/** `YYYY-MM-DD` a number of campus days after `day` (noon keeps it clear of any date-line edge). */
const addDays = (day: string, days: number) => new Date(new Date(`${day}T12:00:00+07:00`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
/** The Tours of the next week after `day`, so the day page shows what is coming even when today is empty. */
export function useUpcomingTours(day: string) {
  const query: TourListQuery = { from: dayStart(addDays(day, 1)), to: dayEnd(addDays(day, AHEAD_DAYS)), sort: 'scheduledStartAt', page: 1, size: 20 }
  return useQuery({ queryKey: tourKeys.list(query), queryFn: () => toursApi.list(query), refetchInterval: LIST_MS })
}

const RUNNING_QUERY: TourListQuery = { phase: 'RUNNING', sort: 'scheduledStartAt', page: 1, size: 20 }

/** The run situation the overview shows. A list row carries it; for an older server it comes from the detail. */
export type RunningSituation = Pick<TourExecutionSummary, 'operationalStatus' | 'assistanceReason' | 'currentStep' | 'commandState'>
export type RunningTour = { tour: TourSummary; execution: RunningSituation | null }

function situationOf(detail: TourDetails): RunningSituation | null {
  const execution = detail.execution
  return execution ? { operationalStatus: execution.operationalStatus, assistanceReason: execution.assistanceReason,
    currentStep: execution.currentStep, commandState: execution.command?.state ?? null } : null
}

/**
 * Running Tours with their situation, from the list alone: one request polled
 * as often as a live Tour. An older server's rows carry no `execution`, so only
 * those Tours' details are read, as before.
 */
export function useRunningTours() {
  const list = useQuery({ queryKey: tourKeys.list(RUNNING_QUERY), queryFn: () => toursApi.list(RUNNING_QUERY), refetchInterval: LIVE_TOUR_MS })
  const rows = list.data?.data ?? []
  const details = useQueries({
    queries: rows.filter(tour => tour.execution === undefined)
      .map(tour => ({ queryKey: tourKeys.detail(tour.id), queryFn: () => toursApi.get(tour.id), refetchInterval: LIVE_TOUR_MS })),
  })
  const read = new Map(details.flatMap(detail => (detail.data ? [[detail.data.tour.id, detail.data] as const] : [])))
  const tours = rows.flatMap((tour): RunningTour[] => {
    if (tour.execution !== undefined) return [{ tour, execution: tour.execution }]
    const detail = read.get(tour.id)
    return detail && detail.tour.state === 'RUNNING' ? [{ tour: detail.tour, execution: situationOf(detail) }] : []
  })
  return { list, tours, isPending: list.isPending || details.some(detail => detail.isPending), isError: list.isError }
}

const RECONCILE_QUERY: TourListQuery = { phase: 'FINISHED', needsReconcile: true, sort: '-scheduledStartAt', page: 1, size: 50 }
/**
 * Ended Tours that still hold an UNKNOWN GoTo, which keeps the robot held until
 * the Operator reconciles it. The server filters (`needsReconcile`), so an old
 * one is not missed behind newer finished Tours. The row's own flag is still
 * checked: a server without the filter returns every finished Tour.
 */
export function useToursNeedingReconcile() {
  const list = useQuery({ queryKey: tourKeys.list(RECONCILE_QUERY), queryFn: () => toursApi.list(RECONCILE_QUERY), refetchInterval: LIST_MS })
  return { list, tours: (list.data?.data ?? []).filter(tour => tour.execution?.needsReconcile === true) }
}

function useRefreshTours() {
  const client = useQueryClient()
  // A refusal can mean the Tour or a check changed meanwhile, so refresh either way.
  return () => client.invalidateQueries({ queryKey: tourKeys.all })
}

/** Opens the Tour without its first leg (`holdAtStart`): the robot moves only when the Operator departs. */
export function useOpenTour() {
  const onSettled = useRefreshTours()
  return useMutation({
    mutationFn: ({ id, requestId, rowVersion }: TourWrite) =>
      toursApi.start(id, { requestId, expectedRowVersion: rowVersion, confirmation: null, holdAtStart: true }),
    onSettled,
  })
}

type TourWrite = { id: string; requestId: string; rowVersion: string }

/** Next, and from the start the departure, which carries the four on-site confirmations. */
export function useNextStop() {
  const onSettled = useRefreshTours()
  return useMutation({
    mutationFn: ({ id, requestId, rowVersion, confirmation }: TourWrite & { confirmation?: StartConfirmation }) =>
      toursApi.next(id, { requestId, expectedRowVersion: rowVersion, confirmation: confirmation ?? null }),
    onSettled,
  })
}

export function usePauseLeg() {
  const onSettled = useRefreshTours()
  return useMutation({
    mutationFn: ({ id, requestId, rowVersion }: TourWrite) => toursApi.pause(id, { requestId, expectedRowVersion: rowVersion }),
    onSettled,
  })
}

export function useSkipStop() {
  const onSettled = useRefreshTours()
  return useMutation({
    mutationFn: ({ id, requestId, rowVersion, confirmation }: TourWrite & { confirmation?: StartConfirmation }) =>
      toursApi.skip(id, { requestId, expectedRowVersion: rowVersion, confirmation: confirmation ?? null }),
    onSettled,
  })
}

export function useSetAutoAdvance() {
  const onSettled = useRefreshTours()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toursApi.setAutoAdvance(id, enabled),
    onSettled,
  })
}

export function useRetryLeg() {
  const onSettled = useRefreshTours()
  return useMutation({
    mutationFn: ({ id, requestId, rowVersion }: TourWrite) => toursApi.retryLeg(id, { requestId, expectedRowVersion: rowVersion }),
    onSettled,
  })
}

export function useEndTourEarly() {
  const onSettled = useRefreshTours()
  return useMutation({
    mutationFn: ({ id, requestId, rowVersion, reason }: TourWrite & { reason: string }) =>
      toursApi.endEarly(id, { requestId, expectedRowVersion: rowVersion, reason }),
    onSettled,
  })
}

export function useReconcileCommand() {
  const onSettled = useRefreshTours()
  return useMutation({
    mutationFn: ({ id, commandId, requestId, reason }: { id: string; commandId: string; requestId: string; reason: string }) =>
      toursApi.reconcile(id, commandId, { requestId, reason }),
    onSettled,
  })
}

/**
 * One request id per intent. A retry of the same intent after a lost response
 * must reuse its id so the server replays instead of acting twice; a different
 * intent needs a new one. The key names the intent: action, Tour or command,
 * row version and, for End Early and Reconcile, the typed reason, which the
 * server fingerprints (same id, other reason = IDEMPOTENCY_CONFLICT).
 */
export function useIntentRequestIds() {
  const ids = useRef(new Map<string, string>())
  return (intent: string) => {
    let id = ids.current.get(intent)
    if (!id) { id = newRequestId(); ids.current.set(intent, id) }
    return id
  }
}

/**
 * Whether the Tour on screen may be out of date: the last poll failed, or the
 * newest answer is older than a few polls (a hidden tab stops polling). An
 * operator deciding to move a robot must be looking at current state.
 */
const STALE_AFTER_MS = 10_000
export function isTourStale(query: { isRefetchError: boolean; dataUpdatedAt: number }, now: number) {
  return query.isRefetchError || (query.dataUpdatedAt > 0 && now - query.dataUpdatedAt > STALE_AFTER_MS)
}
