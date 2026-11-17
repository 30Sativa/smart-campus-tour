import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import type { ApiResponse } from '../../api/contracts/shared'
import { QUEST_DEV_WHEP_URL } from './quest-stream-config'

/**
 * What the backend hands a page that may watch the public relay (ADR-0055): connect to
 * `whepUrl?token=…` before `expiresAt`. The relay checks the token with the backend.
 */
export type StreamAccess = { whepUrl: string; token: string; expiresAt: string }

/** Where a player connects. Without a token only the dev-only LAN URL (`VITE_QUEST_WHEP_URL`). */
export type QuestSource = { whepUrl: string; token?: string | null }

/** The dev-only LAN source, or null in a production build. */
export const DEV_QUEST_SOURCE: QuestSource | null = QUEST_DEV_WHEP_URL ? { whepUrl: QUEST_DEV_WHEP_URL } : null

/** The WHEP URL with the token as `token=…`, where the relay and its reaper read it. */
export function withToken(whepUrl: string, token?: string | null): string {
  if (!token) return whepUrl
  const url = new URL(whepUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

/** A well-formed answer, or null (the server may be older, or say something else). */
export function toQuestSource(access: StreamAccess | null | undefined): QuestSource | null {
  return access && typeof access.whepUrl === 'string' && typeof access.token === 'string' && access.whepUrl && access.token
    ? { whepUrl: access.whepUrl, token: access.token }
    : null
}

/** Ask again at half the token's remaining life: never later than 30 s before it ends, never sooner than 10 s. */
export function renewDelayMs(expiresAt: string, now = Date.now()): number {
  const left = Date.parse(expiresAt) - now
  if (!Number.isFinite(left)) return 10_000
  return Math.max(10_000, Math.min(left / 2, left - 30_000))
}

/** While the page may not watch yet (409), ask again this often: the Tour may start or get its robot. */
export const NOT_AVAILABLE_RETRY_MS = 15_000

/** One relay source the Student page asks for with its session cookie, renewed before the token expires. */
function useStudentRelayAccess(tourId: string, endpoint: 'stream-access' | 'fallback-access', enabled: boolean): QuestSource | null {
  const query = useQuery({
    queryKey: ['student-' + endpoint, tourId],
    queryFn: ({ signal }) =>
      apiClient<ApiResponse<StreamAccess>>(`/api/student/tours/${encodeURIComponent(tourId)}/${endpoint}`, {
        credentials: 'include', auth: false, signal,
      }).then(response => response?.data ?? null),
    enabled,
    retry: false,
    refetchInterval: q => (q.state.data && !q.state.error ? renewDelayMs(q.state.data.expiresAt) : NOT_AVAILABLE_RETRY_MS),
  })
  if (!enabled) return null
  // After a failed renewal React Query keeps the old data; the old token must not be used again.
  return query.isError ? null : toQuestSource(query.data)
}

/**
 * The Student page's relay source: `GET /api/student/tours/{id}/stream-access` with the session cookie, renewed
 * before it expires. A refused renewal (session revoked, Tour ended, another robot) gives null, which closes the
 * player. In a dev build without that answer, the LAN URL is used instead.
 */
export function useStudentStreamAccess(tourId: string, enabled: boolean): QuestSource | null {
  const source = useStudentRelayAccess(tourId, 'stream-access', enabled)
  return enabled ? source ?? DEV_QUEST_SOURCE : null
}

/**
 * ADR-0063: the Tour's fallback video on the same relay (`fallback-{tourId}`), with its own token from
 * `GET /api/student/tours/{id}/fallback-access`. The page holds it while the Tour runs so the player can switch the
 * moment the live picture is lost; a refused renewal (End Early, revoked session) gives null and closes the video,
 * and the relay's reaper cuts an open one within about 5 s. There is no dev fallback.
 */
export function useStudentFallbackAccess(tourId: string, enabled: boolean): QuestSource | null {
  return useStudentRelayAccess(tourId, 'fallback-access', enabled)
}
