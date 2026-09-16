/**
 * Mock backend mode.
 *
 * The booking/auth/ops backend was removed (`7d0a17e`), so `/api/auth/*` and
 * `/api/staff/*` do not exist yet. While `VITE_USE_MOCK_API` is on, the labelled
 * fixtures in this folder are the data source and every screen that uses them
 * says so.
 *
 * This is a mode, not a fallback: mock data never replaces a failed request.
 * With the flag off, the real client runs and a transport error stays an error
 * (web/AGENTS.md — "Do not fabricate fallback data").
 */
export const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API !== 'false'

export const MOCK_MODE_LABEL = 'Dữ liệu mẫu · backend vận hành chưa sẵn sàng'

/** Latency so loading states stay visible and honest while on mock data. */
export function mockDelay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}
