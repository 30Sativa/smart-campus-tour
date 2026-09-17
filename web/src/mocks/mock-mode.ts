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

/**
 * The sign-in screens no longer print build state at the visitor, so this is
 * the channel that keeps a mocked build honest. A development build also shows
 * a badge pinned outside the form; a production build has only this line.
 */
if (USE_MOCK_API && typeof console !== 'undefined') {
  console.warn(
    '[CampusTour] VITE_USE_MOCK_API is on: /api/auth/* and /api/staff/* are served by src/mocks, not by a backend.',
  )
}

/** Latency so loading states stay visible and honest while on mock data. */
export function mockDelay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}
