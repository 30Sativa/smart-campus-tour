/**
 * Labelled mock sign-in: the app's only sign-in while `/api/auth/*` does not
 * exist (see `mock-mode.ts`). It issues a fake token so the `/staff/*` and
 * `/admin/*` route guards can be exercised without a backend. It is not an
 * authentication mechanism and grants nothing server-side, so nothing behind
 * these screens may be treated as protected until the real endpoints land.
 */
import { mockDelay } from './mock-mode'

export type AuthResponse = {
  accessToken: string
  userId: string
  username: string
  role: string
}

/** One account per role, so signing in as each one is a two-word test. */
export const MOCK_ACCOUNTS = [
  { username: 'admin', password: 'admin', role: 'Admin', userId: 'mock-user-admin' },
  { username: 'staff', password: 'staff', role: 'Staff', userId: 'mock-user-staff' },
  // School representative (flow review §4). Owns the demo groups of THPT Trần Phú
  // in `representative-sim.ts`.
  { username: 'daidien', password: 'daidien', role: 'Representative', userId: 'mock-user-daidien' },
] as const

export const MOCK_ACCOUNTS_HINT =
  'Tài khoản mẫu: staff/staff (vận hành), admin/admin (quản trị), daidien/daidien (đại diện trường)'

export class MockAuthError extends Error {}

export async function mockLogin(username: string, password: string): Promise<AuthResponse> {
  const account = MOCK_ACCOUNTS.find((item) => item.username === username.trim().toLowerCase() && item.password === password)
  if (!account) throw new MockAuthError('Sai tên đăng nhập hoặc mật khẩu mẫu.')
  return mockDelay({
    accessToken: `mock-access-token.${account.userId}`,
    userId: account.userId,
    username: account.username,
    role: account.role,
  })
}
