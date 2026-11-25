/**
 * ADR-0065 addendum: the hub pushes `BallotUpdated` as soon as a Viewer's vote has committed, with the ballot as Staff
 * see it (no one's own vote), the leader by the decision rule and the turnout. The Tour detail in the cache is patched
 * in place, so the vote panel moves at once; the 3 s poll stays as the fallback and as the source of truth.
 */
import type { QueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { tourKeys } from '../../administration/tours/hooks'
import type { TourDetails } from '../../administration/tours/types'
import { readBallot } from '../../tour-vote/vote'

export const BALLOT_UPDATED = 'BallotUpdated'

export type ViewerTurnout = { accepted: number; joined: number }

/** When the last pushed vote of each Tour arrived here, for "phiếu mới lúc …". */
export const useBallotLive = create<{ lastVoteAt: Record<string, number>; seen: Record<string, string>
  mark: (tourId: string, at: string) => void }>(set => ({
  lastVoteAt: {},
  seen: {},
  mark: (tourId, at) => set(state => ({ lastVoteAt: { ...state.lastVoteAt, [tourId]: Date.now() }, seen: { ...state.seen, [tourId]: at } })),
}))

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' ? value as Record<string, unknown> : null
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

export function readTurnout(raw: unknown): ViewerTurnout | null {
  const value = record(raw)
  return value ? { accepted: count(value.accepted), joined: count(value.joined) } : null
}

/**
 * Applies one `BallotUpdated` payload. Returns what it did, for tests: `patched` (the cached Tour now shows it),
 * `refetch` (the Tour on screen has no ballot or another visit, so it is read again) or `ignored` (malformed, not on
 * screen, or older than one already applied).
 */
export function applyBallotSignal(client: QueryClient, raw: unknown): 'patched' | 'refetch' | 'ignored' {
  const payload = record(raw)
  const tourId = typeof payload?.tourId === 'string' ? payload.tourId : ''
  const ballot = readBallot(payload?.ballot)
  if (!payload || !tourId || !ballot) return 'ignored'
  const at = typeof payload.at === 'string' ? payload.at : ''
  const seen = useBallotLive.getState().seen[tourId]
  if (at && seen && Date.parse(at) < Date.parse(seen)) return 'ignored'

  const key = tourKeys.detail(tourId)
  const current = client.getQueryData<TourDetails>(key)
  if (!current) return 'ignored'
  useBallotLive.getState().mark(tourId, at || new Date().toISOString())
  const shown = readBallot(current.ballot)
  if (!shown || shown.stopVisitId !== ballot.stopVisitId) {
    void client.invalidateQueries({ queryKey: key })
    return 'refetch'
  }
  client.setQueryData<TourDetails>(key, old => old && {
    ...old,
    ballot: payload.ballot,
    leadingStopId: typeof payload.leadingStopId === 'string' ? payload.leadingStopId : null,
    viewers: readTurnout(payload.viewers) ?? old.viewers ?? null,
  })
  return 'patched'
}

/** A ballot is open at the current POI: the live page marks the vote panel so it stands out. */
export function voteOpen(detail: TourDetails): boolean {
  return Boolean(detail.routeRevision?.viewerChoosesNextStop && readBallot(detail.ballot)?.open)
}
