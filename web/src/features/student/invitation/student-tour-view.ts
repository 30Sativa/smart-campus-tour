/**
 * Invited Student page data (docs/architecture.md §3.2.3): the session's Tour info and the read-only route view,
 * mapped onto the snapshot shape the Tour screens (waiting room, live view, end screen) already render.
 */
import { apiClient } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'
import type { PoiDetail, StudentOperationalStep, StudentTourSnapshot, TourState } from '../student-types'
import { readBallot, readProgress, type StopProgress, type TourBallot } from '../../tour-vote/vote'

/** Returned by POST join/session for the per-Tour Student cookie. */
export type StudentTourInfo = {
  tourId: string
  tourName: string
  tourState: string
  scheduledStartAt: string
  invitationExpiresAt: string
  rowType: string
  /** The Tour has a fallback video. Its address never reaches the browser: it plays through the relay (ADR-0063). */
  hasFallbackVideo: boolean
}

export type StudentTourStop = {
  order: number
  poiId: string
  name: string
  description: string | null
  narrationText: string | null
  audioUrl: string | null
  narrationSeconds: number | null
  dwellSeconds: number
  /** ADR-0065: the revision stop, its place in a voting Tour and why the Operator locked it. An older server omits them. */
  stopId?: string | null
  progress?: StopProgress | string | null
  lockReason?: string | null
}

/** Present only while the Tour is RUNNING. `step` is the Tour's CurrentStep, null until the first dispatch. */
export type StudentTourProgress = {
  step: string | null
  currentPoiId: string | null
  lastArrivedPoiId: string | null
  needsAssistance: boolean
  isHeld: boolean
  /** ADR-0075: what the Operator set Viewers to watch; absent from an older API = LIVE. */
  videoMode?: 'LIVE' | 'FALLBACK'
  videoModeSince?: string | null
}

/** `ballot` is read with `readBallot`: null for a route that does not vote or while no POI is current (ADR-0065). */
export type StudentTourView = { stops: StudentTourStop[]; progress: StudentTourProgress | null; ballot?: unknown }

export const studentTourViewKey = (tourId: string) => ['student-tour-view', tourId] as const

/** ADR-0065: the roster row's vote at the current POI; changing it is the same call. Answers the ballot. */
export async function voteForNextStop(tourId: string, stopVisitId: string, stopId: string): Promise<TourBallot | null> {
  const response = await apiClient<ApiResponse<unknown>>(
    `/api/student/tours/${encodeURIComponent(tourId)}/vote`,
    { method: 'PUT', credentials: 'include', auth: false, json: { stopVisitId, stopId } },
  )
  return readBallot(response?.data)
}

export async function getStudentTourView(tourId: string, signal?: AbortSignal): Promise<StudentTourView | null> {
  const response = await apiClient<ApiResponse<StudentTourView>>(
    `/api/student/tours/${encodeURIComponent(tourId)}/view`,
    { credentials: 'include', auth: false, signal },
  )
  return response?.data ?? null
}

const TOUR_STATES: Record<string, TourState> = {
  SCHEDULED: 'Scheduled', READY: 'Ready', RUNNING: 'Running', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}

function stepOf(progress: StudentTourProgress): StudentOperationalStep {
  switch (progress.step) {
    case 'INITIALIZING':
    case 'RETURNING_FRONT':
      return 'preparing_move'
    case 'NAVIGATING':
      return 'navigating'
    case 'PREPARING_VIEW':
      return 'preparing_head'
    case 'OBSERVING':
      return progress.isHeld ? 'holding' : 'narration'
    case 'RETURNING_TO_END':
      return 'returning'
    default:
      return 'in_progress'
  }
}

function toPoi(stop: StudentTourStop): PoiDetail {
  return {
    id: stop.poiId,
    title: stop.name,
    order: stop.order,
    x: 0,
    y: 0,
    description: stop.description ?? stop.narrationText ?? '',
    audioUrl: stop.audioUrl ?? undefined,
    dwellSeconds: stop.dwellSeconds || undefined,
    stopId: stop.stopId ?? undefined,
    progress: readProgress(stop.progress),
    lockReason: stop.lockReason?.trim() || null,
  }
}

/**
 * Builds the screens' snapshot from real data only. Robot pose and roster fields stay empty: the invited page hides
 * the map and never shows student identity. Unknown or missing progress shows the stops without a position.
 */
export function buildLiveSnapshot(info: StudentTourInfo, view: StudentTourView | null | undefined): StudentTourSnapshot {
  const stops = (Array.isArray(view?.stops) ? view.stops : []).slice().sort((a, b) => a.order - b.order)
  const pois = stops.map(toPoi)
  const tourState = TOUR_STATES[info.tourState] ?? 'Scheduled'
  const progress = tourState === 'Running' ? view?.progress ?? null : null
  const byId = (id: string | null | undefined) => (id ? pois.find((p) => p.id === id) : undefined)
  // ADR-0065: on a voting route the next POI is the one the server marked NEXT, never the next StopOrder.
  const voting = pois.some((p) => p.progress)
  const after = (poi: PoiDetail | undefined) => voting
    ? pois.find((p) => p.progress === 'NEXT')
    : poi ? pois.find((p) => p.order > poi.order) : pois[0]

  let step: StudentOperationalStep =
    tourState === 'Completed' ? 'ended_completed'
      : tourState === 'Cancelled' ? 'ended_cancelled'
        : tourState === 'Running' ? 'in_progress'
          : 'scheduled_waiting'
  let currentPoi: PoiDetail | undefined
  let nextPoi: PoiDetail | undefined
  if (progress) {
    step = stepOf(progress)
    const current = byId(progress.currentPoiId)
    const last = byId(progress.lastArrivedPoiId)
    // A voting Tour follows NEXT here too: the Operator may lock the target of a stopped leg, and the server then
    // marks the POI it re-chose while the leg (and `currentPoiId`) still names the locked one.
    if (step === 'navigating') nextPoi = voting ? after(last) ?? (current?.lockReason ? undefined : current) : current ?? after(last)
    else if (progress.step === 'INITIALIZING') nextPoi = current ?? pois[0]
    else if (step === 'preparing_head' || step === 'narration' || step === 'holding') {
      currentPoi = current ?? last
      nextPoi = after(currentPoi)
    } else if (progress.step === 'RETURNING_FRONT') {
      currentPoi = last ?? current
      nextPoi = currentPoi ? after(currentPoi) : undefined
    }
    if (progress.needsAssistance) step = 'needs_assistance'
  }
  const shownPoi = currentPoi
  const atStop = shownPoi ? stops.find((s) => s.poiId === shownPoi.id) : undefined

  return {
    tourId: info.tourId,
    tourName: info.tourName,
    scheduledAt: info.scheduledStartAt,
    tourState,
    schoolName: '',
    groupCode: '',
    registrationState: 'Approved',
    currentPoi,
    nextPoi,
    pois,
    robotPose: { x: 0, y: 0, heading: 0, isStale: true, lastUpdatedAt: '' },
    step,
    // ADR-0063: the fallback video plays through the relay (useStudentFallbackAccess), never from a stored URL.
    videoStreamUrl: '',
    videoMode: progress?.videoMode === 'FALLBACK' ? 'FALLBACK' : 'LIVE',
    narration: atStop
      ? {
        poiId: atStop.poiId,
        title: atStop.name,
        text: atStop.narrationText || atStop.description || '',
        audioUrl: atStop.audioUrl ?? undefined,
        isPlaying: step === 'narration',
      }
      : undefined,
  }
}
