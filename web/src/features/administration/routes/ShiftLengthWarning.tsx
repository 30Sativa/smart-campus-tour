import { useState } from 'react'
import { campusDateKey } from '../../../components/ui/date-time'
import { Notice } from '../AdminUi'
import { useTourShifts } from '../tours/hooks'
import { shiftLengthWarningText, shortestShiftTooShort } from './shift-length'

/** Says, before anyone tries to create a Tour, which shift this route is too long for. Nothing while loading or when it fits. */
export function ShiftLengthWarning({ expectedSeconds }: { expectedSeconds: number | null | undefined }) {
  const [today] = useState(() => campusDateKey(Date.now()))
  const shifts = useTourShifts(today, today, Boolean(expectedSeconds))
  const shift = expectedSeconds ? shortestShiftTooShort(shifts.data?.days[0]?.shifts ?? [], expectedSeconds) : null
  return shift ? <div className="mt-3"><Notice tone="warn">{shiftLengthWarningText(shift)}</Notice></div> : null
}
