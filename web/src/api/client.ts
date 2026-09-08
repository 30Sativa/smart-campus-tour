const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

type ApiRequestOptions = RequestInit

export async function apiClient<T>(
  path: string,
  options?: ApiRequestOptions,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}