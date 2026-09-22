import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/**
 * The registration under review lives in the URL (`?review=reg-07`), so a
 * dashboard "Duyệt ngay" link opens the drawer directly and Back closes it.
 */
export function useReviewParam() {
  const [params, setParams] = useSearchParams()
  const reviewId = params.get('review')
  const open = useCallback((id: string) => setParams((current) => {
    const next = new URLSearchParams(current)
    next.set('review', id)
    return next
  }), [setParams])
  const close = useCallback(() => setParams((current) => {
    const next = new URLSearchParams(current)
    next.delete('review')
    return next
  }, { replace: true }), [setParams])
  return { reviewId, open, close }
}
