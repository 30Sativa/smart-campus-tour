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

/**
 * The Student page's relay source: `GET /api/student/tours/{id}/stream-access` with the session cookie, renewed
 * before it expires. A refused renewal (session revoked, Tour ended, another robot) gives null, which closes the
 * player. In a dev build without that answer, the LAN URL is used instead.
 */
export function useStudentStreamAccess(tourId: string, enabled: boolean): QuestSource | null {
  const query = useQuery({
    queryKey: ['student-stream-access', tourId],
    queryFn: ({ signal }) =>
      apiClient<ApiResponse<StreamAccess>>(`/api/student/tours/${encodeURIComponent(tourId)}/stream-access`, {
        credentials: 'include', auth: false, signal,
      }).then(response => response?.data ?? null),
    enabled,
    retry: false,
    refetchInterval: q => (q.state.data && !q.state.error ? renewDelayMs(q.state.data.expiresAt) : NOT_AVAILABLE_RETRY_MS),
  })
  if (!enabled) return null
  // After a failed renewal React Query keeps the old data; the old token must not be used again.
  const source = query.isError ? null : toQuestSource(query.data)
  return source ?? DEV_QUEST_SOURCE
}
