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
}

type RefreshResponse = {
  accessToken: string
  userId: string
  username: string
  role: string
}

/**
 * Single-flight refresh: concurrent 401s share one refresh call. The shared
 * promise is what callers await, so a failed refresh rejects every waiter
 * instead of leaving them pending forever.
 */
let refreshInFlight: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  // credentials: 'include' sends the HttpOnly refresh cookie.
  const response = await fetch(apiUrl('/api/auth/refresh'), { method: 'POST', credentials: 'include' })
  if (!response.ok) throw new ApiError(response.status, await response.text().catch(() => ''))

  const data = (await response.json()) as RefreshResponse
  useAuthStore.getState().setAuth(data.accessToken, {
    userId: data.userId,
    username: data.username,
    role: data.role,
  })
  return data.accessToken
}

export async function apiClient<T>(
  path: string,
  { json, headers, ...options }: ApiRequestOptions = {},
): Promise<T> {
  const doRequest = (token?: string | null) =>
    fetch(apiUrl(path), {
      ...options,
      headers: {
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: json === undefined ? undefined : JSON.stringify(json),
    })

  let response = await doRequest(useAuthStore.getState().accessToken)

  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    try {
      refreshInFlight = refreshInFlight ?? refreshAccessToken().finally(() => { refreshInFlight = null })
      response = await doRequest(await refreshInFlight)
    } catch {
      useAuthStore.getState().logout()
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await response.text().catch(() => ''))
  }

  if (response.status === 204) {
    return undefined as T
  }

  const body = await response.text()
  return body.trim() ? (JSON.parse(body) as T) : (undefined as T)
}
