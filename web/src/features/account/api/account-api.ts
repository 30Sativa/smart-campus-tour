import { apiClient, ApiError } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'

/** The signed-in account's own profile. Credentials and tokens never appear here. */
export type MyProfile = {
  id: string
  username: string
  fullName: string
  role: string
  isActive: boolean
  createdAt: string
  updatedAt: string | null
}

export type ChangePasswordInput = { currentPassword: string; newPassword: string }

async function unwrap(request: Promise<ApiResponse<MyProfile>>): Promise<MyProfile> {
  const response = await request
  if (!response.data) throw new Error(response.message || 'Không tải được hồ sơ.')
  return response.data
}

/** There is no id in any path: the server always acts on the token's own account. */
export const accountSelfApi = {
  get: () => unwrap(apiClient<ApiResponse<MyProfile>>('/api/account/me')),
  updateName: (fullName: string) =>
    unwrap(apiClient<ApiResponse<MyProfile>>('/api/account/me', { method: 'PUT', json: { fullName } })),
  changePassword: (input: ChangePasswordInput) =>
    apiClient<ApiResponse<null>>('/api/account/me/password', { method: 'POST', json: input }),
}

type ErrorBody = { message?: unknown; errors?: unknown }

function readBody(error: ApiError): ErrorBody | null {
  try {
    const value: unknown = JSON.parse(error.body)
    return typeof value === 'object' && value !== null ? (value as ErrorBody) : null
  } catch {
    return null
  }
}

/** Safe, user-facing text for a failed self-service call; per-field messages come from a 400. */
export function readAccountError(error: unknown, fallback: string): { message: string; fields: Record<string, string> } {
  if (!(error instanceof ApiError)) return { message: fallback, fields: {} }
  if (error.status === 401) return { message: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', fields: {} }
  if (error.status === 403) return { message: 'Tài khoản này không còn quyền thực hiện thao tác.', fields: {} }
  if (error.status === 429) return { message: 'Thử quá nhiều lần. Hãy đợi một phút rồi thử lại.', fields: {} }

  const body = readBody(error)
  const fields: Record<string, string> = {}
  if (error.status === 400 && typeof body?.errors === 'object' && body.errors !== null && !Array.isArray(body.errors)) {
    for (const [key, raw] of Object.entries(body.errors)) {
      const text = Array.isArray(raw) ? raw.find((item) => typeof item === 'string') : raw
      if (typeof text === 'string') fields[key.charAt(0).toLowerCase() + key.slice(1)] = text
    }
  }
  return { message: fallback, fields }
}
