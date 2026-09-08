/**
 * The single entry point for backend HTTP access.
 * No component should call `fetch` directly (web/AGENTS.md §3).
 */

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
  /** Plain object, serialized as JSON. Use `RequestInit.body` semantics elsewhere. */
  json?: unknown
}

export async function apiClient<T>(
  path: string,
  { json, headers, ...options }: ApiRequestOptions = {},
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: json === undefined ? undefined : JSON.stringify(json),
  })

  if (!response.ok) {
    throw new ApiError(response.status, await response.text().catch(() => ''))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
