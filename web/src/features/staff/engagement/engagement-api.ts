import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'

/**
 * Viewer engagement report for Staff (ADR-0071, docs/architecture.md §7.2). Aggregates only: no row here
 * names a viewer, and questions are counted, never stored as text.
 */
export type RowType = 'INDIVIDUAL' | 'SHARED_VIEWING'

export type AudienceSegment = {
  rowType: RowType | string
  acceptedRows: number
  joinedRows: number
  votedRows: number
  questions: number
}

export type QuestionTotals = { total: number; waitingRoom: number; duringTour: number; atStops: number; outOfScope: number }

export type EngagementSignal = 'MOST_QUESTIONS' | 'MOST_LEFT' | 'MOST_VOTED' | 'OVER_DWELL' | 'SHORT_DWELL' | 'SKIPPED' | 'NO_QUESTIONS'

export type StopEngagement = {
  stopId: string
  poiId: string
  name: string
  plannedOrder: number
  visitOrder: number | null
  outcome: 'VISITED' | 'SKIPPED' | 'NOT_REACHED'
  arrivedAt: string | null
  actualDwellSeconds: number | null
  plannedDwellSeconds: number
  questions: number
  ballotVoters: number
  votesReceived: number
  viewersLeft: number
  signals: EngagementSignal[]
}

export type TourEngagement = {
  tourId: string
  name: string
  state: string
  scheduledStartAt: string
  startedAt: string | null
  endedAt: string | null
  routeName: string | null
  audience: AudienceSegment[]
  questions: QuestionTotals
  viewersLeftDuringTour: number
  stops: StopEngagement[]
}

export type PoiEngagement = {
  poiId: string
  name: string
  tours: number
  visits: number
  skips: number
  questions: number
  questionsPerVisit: number
  averageDwellSeconds: number | null
  averagePlannedDwellSeconds: number | null
  votesReceived: number
  viewersLeft: number
  signals: EngagementSignal[]
}

export type EngagementTourRow = {
  tourId: string
  name: string
  state: string
  startedAt: string | null
  routeName: string | null
  acceptedRows: number
  joinedRows: number
  questions: number
  viewersLeft: number
}

export type EngagementOverview = {
  from: string
  to: string
  tourCount: number
  joinRate: number | null
  questionsPerTour: number | null
  audience: AudienceSegment[]
  questions: QuestionTotals
  pois: PoiEngagement[]
  tours: EngagementTourRow[]
  truncated: boolean
}

export const engagementKeys = {
  all: ['staff', 'engagement'] as const,
  overview: (from: string, to: string) => [...engagementKeys.all, 'overview', from, to] as const,
  tour: (tourId: string) => [...engagementKeys.all, 'tour', tourId] as const,
}

export const engagementApi = {
  overview: (from: string, to: string) =>
    apiClient<ApiResponse<EngagementOverview>>(`/api/staff/engagement?${new URLSearchParams({ from, to })}`).then(r => r.data!),
  tour: (tourId: string) =>
    apiClient<ApiResponse<TourEngagement>>(`/api/staff/manage/tours/${encodeURIComponent(tourId)}/engagement`).then(r => r.data!),
}

export function useEngagementOverview(from: string, to: string) {
  return useQuery({ queryKey: engagementKeys.overview(from, to), queryFn: () => engagementApi.overview(from, to) })
}

/** A running Tour is re-read every 30 s; an ended one does not change. */
export function useTourEngagement(tourId: string) {
  return useQuery({
    queryKey: engagementKeys.tour(tourId),
    queryFn: () => engagementApi.tour(tourId),
    refetchInterval: query => (query.state.data?.state === 'RUNNING' ? 30_000 : false),
  })
}
