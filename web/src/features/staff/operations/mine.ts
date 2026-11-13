import { useSearchParams } from 'react-router'
import { useAuthStore } from '../../../stores/auth-store'
import type { TourSummary } from '../../administration/tours/types'

/**
 * "Chỉ Tour tôi vận hành" on the Staff home (`?mine=1`): keeps the Tours whose assigned Operator is the signed-in
 * account, from the `operator` the list rows carry. Only the assigned Operator may act on a Tour; everyone still sees
 * every alert, the filter only narrows the lists.
 */
export function useMineFilter() {
  const [params, setParams] = useSearchParams()
  const me = useAuthStore(state => state.user?.userId) ?? null
  const mine = params.get('mine') === '1'
  const setMine = (value: boolean) => setParams(current => {
    const next = new URLSearchParams(current)
    if (value) next.set('mine', '1'); else next.delete('mine')
    return next
  }, { replace: true })
  const isMine = (tour: Pick<TourSummary, 'operator'>) => me !== null && tour.operator?.userId === me
  const keep = (tour: Pick<TourSummary, 'operator'>) => !mine || isMine(tour)
  return { mine, setMine, isMine, keep }
}

/** Who operates the Tour, for a list line: "Bạn" for the signed-in account. */
export function operatorLabel(tour: Pick<TourSummary, 'operator'>, isMine: boolean): string | null {
  if (!tour.operator) return null
  return isMine ? 'Bạn vận hành' : `Vận hành: ${tour.operator.fullName || tour.operator.username}`
}

/** The one line the Staff home prints when there is no Tour today, in the words of the "only my Tours" filter. */
export const noTourToday = (mine: boolean) => mine ? 'Hôm nay bạn không vận hành Tour nào.' : 'Hôm nay không có Tour nào.'
