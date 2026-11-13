import { describe, expect, it } from 'vitest'
import { generatePassword, passwordPolicyError } from './password'

describe('reset password helpers', () => {
  it('generates 16 unambiguous characters that pass the account password policy', () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generatePassword()
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/)
      expect(passwordPolicyError(password)).toBeNull()
    }
  })

  it('skips bytes that would bias the alphabet', () => {
    // 228 is the first byte at or above the largest multiple of the 57-letter alphabet.
    let call = 0
    const password = generatePassword((bytes) => { bytes.fill(call++ === 0 ? 255 : 0) })
    expect(password).toBe('A'.repeat(16))
  })

  it('mirrors the backend policy: 12 to 128 characters, not blank', () => {
    expect(passwordPolicyError('            ')).toBe('Nhập mật khẩu mới.')
    expect(passwordPolicyError('a'.repeat(11))).toMatch(/12 đến 128/)
    expect(passwordPolicyError('a'.repeat(129))).toMatch(/12 đến 128/)
    expect(passwordPolicyError('a'.repeat(12))).toBeNull()
  })
})
