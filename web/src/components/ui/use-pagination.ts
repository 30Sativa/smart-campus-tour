import { useState } from 'react'

/**
 * Client-side paging of rows the API already returned. `resetKey` is the
 * current filter: when it changes the list starts again at page 1, derived
 * during render rather than synced with an effect.
 */
export function usePagination<T>(rows: T[], pageSize: number, resetKey: string) {
  const [state, setState] = useState({ key: resetKey, page: 1 })
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.min(state.key === resetKey ? state.page : 1, pageCount)
  return {
    page,
    pageCount,
    pageSize,
    total: rows.length,
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    setPage: (next: number) => setState({ key: resetKey, page: Math.max(1, Math.min(next, pageCount)) }),
  }
}
