import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { useAuthStore } from '../stores/auth-store'
import { mockStaffApi } from './staff-mock'
import { resetSim } from './staff-sim'

/**
 * Scope §2.1: Start / Hold / Next / End Early "cần thêm role Staff". An
 * Admin-only account can read the operations console but the server locks
 * every run action and refuses a direct call.
 */
const signIn = (role: string) => useAuthStore.getState().setAuth('t', { userId: 'u', username: role.toLowerCase(), role })

describe('operations actions by role', () => {
  beforeEach(() => resetSim())
  afterEach(() => useAuthStore.getState().logout())

  it('locks every run action for an Admin-only account, with the reason', async () => {
    signIn('Admin')
    const tour = await mockStaffApi.tour('tour-01')
    expect(Object.values(tour.allowedActions).every((gate) => !gate.allowed)).toBe(true)
    expect(tour.allowedActions.endEarly.reason).toMatch(/Staff/)
    await expect(mockStaffApi.commandTour('tour-01', 'endEarly', 'thử')).rejects.toBeInstanceOf(ApiError)
  })

  it('leaves the server gates as they are for Staff', async () => {
    signIn('Staff')
    const tour = await mockStaffApi.tour('tour-01')
    expect(tour.allowedActions.endEarly.allowed).toBe(true)
  })
})
