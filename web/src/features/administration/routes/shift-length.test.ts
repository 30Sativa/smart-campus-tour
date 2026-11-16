import { describe, expect, it } from 'vitest'
import { shiftLengthWarningText, shortestShiftTooShort } from './shift-length'

const SHIFTS = [
  { name: 'Ca sáng', maxDurationSeconds: 90 * 60 },
  { name: 'Ca trưa', maxDurationSeconds: 30 * 60 },
  { name: 'Ca chiều', maxDurationSeconds: 90 * 60 },
]

describe('route longer than the shortest shift (B5)', () => {
  it('names the shortest shift a ~39-minute route cannot use', () => {
    const shift = shortestShiftTooShort(SHIFTS, 39 * 60 + 9)
    expect(shift?.name).toBe('Ca trưa')
    expect(shiftLengthWarningText(shift!)).toBe('Dài hơn Ca trưa (30 phút): không tạo được Tour ở Ca trưa')
  })

  it('compares the rounded length, the number the screens print', () => {
    expect(shortestShiftTooShort(SHIFTS, 30 * 60)).toBeNull()
    // 30 min 1 s reads "31 phút" and ends a minute after the shift's last Tour minute.
    expect(shortestShiftTooShort(SHIFTS, 30 * 60 + 1)?.name).toBe('Ca trưa')
  })

  it('says nothing before the shifts load', () => {
    expect(shortestShiftTooShort([], 99_999)).toBeNull()
  })
})
