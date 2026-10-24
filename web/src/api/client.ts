/**
 * The single entry point for backend HTTP access.
 * No component should call `fetch` directly (web/AGENTS.md §3).
 */
import { useAuthStore } from '../stores/auth-store'

/** Backend base URL. Comes from the environment, never hard-coded. */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

/** Thrown for any non-2xx response so callers can branch on `status`. */
export class ApiError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string) {
    super(`API request failed: ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** Resolve an API path against the configured base URL. */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}

export type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  json?: unknown
  auth?: boolean
}

export type AuthResponse = {
  accessToken: string
  userId: string
  username: string
  role: string
}

/**
 * Single-flight refresh per session: concurrent 401s share one refresh call. The shared
 * promise is what callers await, so a failed refresh rejects every waiter
 * instead of leaving them pending forever.
 */
let refreshInFlight: { revision: number; promise: Promise<AuthResponse> } | null = null

async function requestRefresh(revision: number): Promise<AuthResponse> {
  // credentials: 'include' sends the HttpOnly refresh cookie.
  const response = await fetch(apiUrl('/api/auth/refresh'), { method: 'POST', credentials: 'include' })
  if (!response.ok) {
    // Only a confirmed rejection of this session signs it out. Network/5xx
    // failures and an old session's rejection must not clear a newer login.
    if ([401, 403].includes(response.status) && useAuthStore.getState().sessionRevision === revision)
      useAuthStore.getState().logout()
    throw new ApiError(response.status, await response.text().catch(() => ''))
  }

  const data = (await response.json()) as AuthResponse
  if (!isAuthResponse(data)) throw new Error('Invalid authentication response')
  const applied = useAuthStore.getState().applyRefresh(data.accessToken, {
    userId: data.userId,
    username: data.username,
    role: data.role,
  }, revision)
  if (!applied) throw new DOMException('Authentication session changed', 'AbortError')
  return data
}

function refreshSession(): Promise<AuthResponse> {
  const revision = useAuthStore.getState().sessionRevision
  if (refreshInFlight?.revision === revision) return refreshInFlight.promise
  const promise = requestRefresh(revision).finally(() => {
    if (refreshInFlight?.promise === promise) refreshInFlight = null
  })
  refreshInFlight = { revision, promise }
  return promise
}

function isAuthResponse(value: unknown): value is AuthResponse {
  if (typeof value !== 'object' || value === null) return false
  const response = value as Partial<AuthResponse>
  return typeof response.accessToken === 'string'
    && response.accessToken.length > 0
    && typeof response.userId === 'string'
    && response.userId.length > 0
    && typeof response.username === 'string'
    && response.username.length > 0
    && ['Admin', 'Staff', 'Representative'].includes(response.role ?? '')
}
/** Restore the current session from its HttpOnly cookie; stale responses reject with AbortError. */
export async function restoreAuthSession(): Promise<void> {
  await refreshSession()
}

/**
 * Sends JSON and retries one authenticated 401 after a shared cookie refresh.
 * `auth: false` isolates Student/public requests from account tokens and refresh.
 * A session switch discards authenticated results with AbortError. Cancelling a
 * caller's request does not cancel the refresh shared by other callers.
 */
export async function apiClient<T>(
  path: string,
  { json, headers, auth = true, ...options }: ApiRequestOptions = {},
): Promise<T> {
  const revision = useAuthStore.getState().sessionRevision
  const ensureCurrentSession = () => {
    if (auth && useAuthStore.getState().sessionRevision !== revision)
      throw new DOMException('Authentication session changed', 'AbortError')
  }
  const doRequest = (token?: string | null) => {
    const requestHeaders = new Headers(headers)
    if (json !== undefined && !requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json')
    if (token && !requestHeaders.has('Authorization')) requestHeaders.set('Authorization', `Bearer ${token}`)
    return fetch(apiUrl(path), {
      ...options,
      headers: requestHeaders,
      body: json === undefined ? undefined : JSON.stringify(json),
    })
  }

  let response = await doRequest(auth ? useAuthStore.getState().accessToken : null)
  ensureCurrentSession()

  if (response.status === 401 && auth && !path.startsWith('/api/auth/')) {
    let refreshed: AuthResponse | undefined
    try { refreshed = await refreshSession() } catch { /* Keep the original 401; refresh owns session rejection. */ }
    if (refreshed) {
      ensureCurrentSession()
      options.signal?.throwIfAborted()
      // Cancellation/offline errors from the retry are request failures, not logout.
      response = await doRequest(refreshed.accessToken)
      ensureCurrentSession()
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await response.text().catch(() => ''))
  }

  if (response.status === 204) {
    return undefined as T
  }

  const body = await response.text()
  ensureCurrentSession()
  return body.trim() ? (JSON.parse(body) as T) : (undefined as T)
}

/** Authenticate an account and accept only the three roles supported by Auth V1. */
export async function login(username: string, password: string): Promise<AuthResponse> {
  const response = await apiClient<unknown>('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    json: { username, password },
  })
  if (!isAuthResponse(response)) throw new Error('Invalid authentication response')
  return response
}
