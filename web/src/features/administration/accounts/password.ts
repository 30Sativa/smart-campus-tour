/** Same bounds as the backend AccountPasswordPolicy (12-128 characters, not blank). */
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

/** No 0/O, 1/l/I: the Admin reads this password out or types it into a message. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const GENERATED_LENGTH = 16

export function passwordPolicyError(password: string): string | null {
  if (!password.trim()) return 'Nhập mật khẩu mới.'
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `Mật khẩu mới cần từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự.`
  }
  return null
}

/** A policy-compliant random password from the browser's CSPRNG, without modulo bias. */
export function generatePassword(fill: (bytes: Uint8Array<ArrayBuffer>) => void = (bytes) => { crypto.getRandomValues(bytes) }): string {
  const limit = 256 - (256 % ALPHABET.length)
  let result = ''
  while (result.length < GENERATED_LENGTH) {
    const bytes = new Uint8Array(GENERATED_LENGTH * 2)
    fill(bytes)
    for (const byte of bytes) {
      if (byte < limit && result.length < GENERATED_LENGTH) result += ALPHABET[byte % ALPHABET.length]
    }
  }
  return result
}
