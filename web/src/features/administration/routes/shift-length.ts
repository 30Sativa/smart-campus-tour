import { formatExpectedDuration, roundedDurationSeconds } from '../../../components/ui/date-time'
import type { TourShift } from '../tours/types'

type ShiftCapacity = Pick<TourShift, 'name' | 'maxDurationSeconds'>

/**
 * The shortest configured shift a route of `expectedSeconds` cannot fit, or null when it fits every shift. Shifts are
 * the same every day, and `maxDurationSeconds` is the server's own capacity (shift less 15 min before and after).
 * The rounded length is compared, the same number the route and Tour screens print.
 */
export function shortestShiftTooShort(shifts: readonly ShiftCapacity[], expectedSeconds: number): ShiftCapacity | null {
  const shortest = [...shifts].sort((a, b) => a.maxDurationSeconds - b.maxDurationSeconds)[0]
  return shortest && roundedDurationSeconds(expectedSeconds) > shortest.maxDurationSeconds ? shortest : null
}

export const shiftLengthWarningText = (shift: ShiftCapacity) =>
  `Dài hơn ${shift.name} (${formatExpectedDuration(shift.maxDurationSeconds)}): không tạo được Tour ở ${shift.name}`
