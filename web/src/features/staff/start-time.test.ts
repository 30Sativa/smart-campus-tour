import { describe, expect, it } from 'vitest'
import { startTimeGate } from './start-time'
import { formatTime } from './formatters'

const at = '2026-11-10T02:00:00.000Z'

describe('startTimeGate', () => {
  it('stays closed before the published time, with a countdown', () => {
    const gate = startTimeGate(at, Date.parse(at) - 90_000)
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toContain(formatTime(at))
    expect(gate.reason).toContain('còn 2 phút')
  })

  it('opens at the published time and after it', () => {
    expect(startTimeGate(at, Date.parse(at)).allowed).toBe(true)
    expect(startTimeGate(at, Date.parse(at) + 600_000).allowed).toBe(true)
  })
})
