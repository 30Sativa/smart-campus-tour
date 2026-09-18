/**
 * Mock backend mode.
 *
 * The auth/booking/ops backend was removed (`7d0a17e`), so `/api/auth/*` and
 * `/api/staff/*` do not exist. The app therefore runs on the labelled fixtures
 * in this folder, and every screen that uses them says so.
 *
 * This used to be a runtime choice: `VITE_USE_MOCK_API` picked between these
 * fixtures and the HTTP implementation, and every call site carried a ternary.
 * The flag and those ternaries are gone (2026-09-18) - with no backend to point
 * the other branch at, the switch only ever had one position, and a branch that
 * is never taken is a branch nobody is testing.
 *
 * It is still a mode, not a fallback: nothing here is reached by a failed
 * request. `src/api/` keeps the HTTP client and the endpoint contract, unwired,
 * so restoring the real path is a re-import rather than a rewrite - see the
 * header of `src/api/contracts/staff.ts`.
 */
export const MOCK_MODE_LABEL = 'Dữ liệu mẫu · backend vận hành chưa sẵn sàng'

// The local implementation intentionally runs only on fixtures. Keep the
// selector exported so the visitor feature merged from upstream can share that
// same mode without reintroducing a dead runtime branch elsewhere.
export const USE_MOCK_API = true

/**
 * Said once, out loud, in every build. A development build also shows a badge
 * in each shell; a production build has only this line, which is what keeps a
 * deployed demo from looking like it is talking to a server.
 */
if (typeof console !== 'undefined') {
  console.warn(
    '[CampusTour] Running on mock data: /api/auth/* and /api/staff/* are served by src/mocks, not by a backend.',
  )
}

/** Latency so loading states stay visible and honest while on mock data. */
export function mockDelay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}
