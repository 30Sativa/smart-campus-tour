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

import { useAuthStore } from '../stores/auth-store.ts';

export type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  json?: unknown
}

// Queue for pending requests during token refresh
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

export async function apiClient<T>(
  path: string,
  { json, headers, ...options }: ApiRequestOptions = {},
): Promise<T> {
  const doRequest = async (token?: string) => {
    // Add token from Zustand store if available.
    const currentToken = token || useAuthStore.getState().accessToken;

    const res = await fetch(apiUrl(path), {
      ...options,
      headers: {
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {}),
        ...headers,
      },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
    return res;
  };

  let response = await doRequest();

  // If unauthorized, attempt to refresh token
  if (response.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      
      try {
        const refreshResponse = await fetch(apiUrl('/api/auth/refresh'), {
          method: 'POST',
          // credentials: 'include' ensures the HttpOnly cookie is sent
          credentials: 'include'
        });

        if (!refreshResponse.ok) throw new Error('Refresh failed');
        
        const data = await refreshResponse.json();
        useAuthStore.getState().setAuth(data.accessToken, { 
          userId: data.userId, 
          username: data.username, 
          role: data.role 
        });

        // Resolve queued requests
        refreshQueue.forEach(cb => cb(data.accessToken));
        refreshQueue = [];
        
        // Retry original request
        response = await doRequest(data.accessToken);
      } catch {
        useAuthStore.getState().logout();
        refreshQueue = []; // clear queue
      } finally {
        isRefreshing = false;
      }
    } else {
      // Wait for refresh to complete
      const newToken = await new Promise<string>(resolve => {
        refreshQueue.push(resolve);
      });
      response = await doRequest(newToken);
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await response.text().catch(() => ''))
  }

  if (response.status === 204) {
    return undefined as T
  }

  const body = await response.text()
  return body.trim() ? JSON.parse(body) as T : undefined as T
}

