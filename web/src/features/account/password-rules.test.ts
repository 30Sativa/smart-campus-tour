import { describe, expect, it } from 'vitest'
import { passwordProblems } from './password-rules'

const ok = { currentPassword: 'old-password-123', newPassword: 'brand-new-password', confirm: 'brand-new-password' }

describe('passwordProblems', () => {
  it('accepts a valid change', () => {
    expect(passwordProblems(ok)).toEqual({})
  })

  it('requires the current password', () => {
    expect(passwordProblems({ ...ok, currentPassword: '' }).currentPassword).toBeTruthy()
  })

  it('rejects a short or blank new password', () => {
    expect(passwordProblems({ ...ok, newPassword: 'short', confirm: 'short' }).newPassword).toBeTruthy()
    expect(passwordProblems({ ...ok, newPassword: ' '.repeat(12), confirm: ' '.repeat(12) }).newPassword).toBeTruthy()
  })

  it('rejects a new password equal to the current one', () => {
    const same = 'same-password-12'
    expect(passwordProblems({ currentPassword: same, newPassword: same, confirm: same }).newPassword).toBeTruthy()
  })

  it('rejects a confirmation mismatch', () => {
    expect(passwordProblems({ ...ok, confirm: 'different-password' }).confirm).toBeTruthy()
  })
})
