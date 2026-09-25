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
  // Added when `/visit` shipped. Without it the visitor app could only be reached
  // by registering, and a freshly registered name is not one the visitor
  // fixtures know anything about.
  { username: 'visitor', password: 'visitor', role: 'Visitor', userId: 'mock-user-visitor' },
  // School representative (flow review §4). Owns the demo groups of THPT Trần Phú
  // in `representative-sim.ts`.
  { username: 'daidien', password: 'daidien', role: 'Representative', userId: 'mock-user-daidien' },
] as const

export const MOCK_ACCOUNTS_HINT =
  'Tài khoản mẫu: visitor/visitor (khách), staff/staff (vận hành), admin/admin (quản trị), daidien/daidien (đại diện trường)'

export class MockAuthError extends Error {}

/**
 * Mock sign-up. Registration has no backend endpoint, so this validates the
 * form and issues the same fake token `mockLogin` does, with the `Visitor`
 * role. It creates nothing: the account does not survive a reload, and the
 * screen says so. Replace this call with `POST /api/auth/register` once the
 * endpoint exists; the page needs no other change.
 */
export async function mockRegister(username: string, password: string): Promise<AuthResponse> {
  const normalized = username.trim().toLowerCase()
  if (MOCK_ACCOUNTS.some((item) => item.username === normalized)) {
    throw new MockAuthError('Tên đăng nhập này đã được dùng cho một tài khoản mẫu.')
  }
  if (password.length < 6) throw new MockAuthError('Mật khẩu cần ít nhất 6 ký tự.')
  return mockDelay({
    accessToken: `mock-access-token.mock-user-${normalized}`,
    userId: `mock-user-${normalized}`,
    username: normalized,
    role: 'Visitor',
  })
}

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
