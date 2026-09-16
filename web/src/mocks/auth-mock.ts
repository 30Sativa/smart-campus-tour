/**
 * Labelled mock sign-in. Active only while `USE_MOCK_API` is on — see
 * `mock-mode.ts`. It issues a fake token so the `/admin/*` route guard can be
 * exercised without a backend; it is not an authentication mechanism and grants
 * nothing server-side.
 */
import { mockDelay } from './mock-mode'

export type AuthResponse = {
  accessToken: string
  userId: string
  username: string
  role: string
}

export const MOCK_ACCOUNTS = [
  { username: 'admin', password: 'admin', role: 'Admin', userId: 'mock-user-admin' },
  { username: 'staff', password: 'staff', role: 'CampusStaff', userId: 'mock-user-staff' },
  { username: 'operator', password: 'operator', role: 'TourOperator', userId: 'mock-user-operator' },
] as const

export const MOCK_ACCOUNTS_HINT = 'Tài khoản mẫu: admin/admin, staff/staff, operator/operator'

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
