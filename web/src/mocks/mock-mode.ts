/**
 * Business fixture mode.
 *
 * Authentication uses the real `/api/auth/*` endpoints. Business features
 * without a live backend binding still use the labelled fixtures in this
 * folder, and every shell that uses them says so.
 *
 * This used to be a runtime choice: `VITE_USE_MOCK_API` picked between these
 * fixtures and the HTTP implementation, and every call site carried a ternary.
 * The flag and those ternaries are gone (2026-09-18); do not restore a dead
 * toggle while these features have only one configured implementation.
 *
 * It is still a mode, not a fallback: nothing here is reached by a failed
 * request. Auth is wired through `src/api/client.ts`; staff endpoint contracts
 * remain until the corresponding business API is implemented.
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
    '[CampusTour] Some business features are running on sample data from src/mocks.',
  )
}

/** Latency so loading states stay visible and honest while on mock data. */
export function mockDelay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}
