import { ApiError } from '../../../api/client'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password'

export type AccountFormField = 'username' | 'fullName' | 'role' | 'initialPassword'
export type AccountFormErrors = Partial<Record<AccountFormField, string>>

type ResponseError = { message?: unknown; errors?: unknown }

function readResponseError(error: ApiError): ResponseError | null {
  try {
    const value: unknown = JSON.parse(error.body)
    if (typeof value !== 'object' || value === null) return null
    return value as ResponseError
  } catch {
    return null
  }
}

function responseMessage(response: ResponseError | null): string | null {
  return typeof response?.message === 'string' && response.message.trim() ? response.message : null
}

function fieldName(key: string): AccountFormField | null {
  switch (key.replaceAll('_', '').toLowerCase()) {
    case 'username': return 'username'
    case 'fullname': return 'fullName'
    case 'role': return 'role'
    case 'initialpassword': return 'initialPassword'
    default: return null
  }
}

function readFieldErrors(value: unknown): AccountFormErrors {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const fields: AccountFormErrors = {}
  for (const [key, raw] of Object.entries(value)) {
    const field = fieldName(key)
    if (!field) continue
    const message = Array.isArray(raw) ? raw.find((item) => typeof item === 'string') : raw
    if (typeof message === 'string') fields[field] = message
  }
  return fields
}

export function accountFormError(error: unknown): { message: string | null; fields: AccountFormErrors } {
  if (!(error instanceof ApiError)) return { message: 'Không thể tạo tài khoản. Vui lòng thử lại.', fields: {} }

  const response = readResponseError(error)
  const message = responseMessage(response)
  if (error.status === 401) return { message: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', fields: {} }
  if (error.status === 403) return { message: 'Tài khoản hiện tại không có quyền tạo tài khoản.', fields: {} }
  if (error.status === 409) return { message: null, fields: { username: message ?? 'An account with this username already exists.' } }

  const fields = error.status === 400 ? readFieldErrors(response?.errors) : {}
  return {
    message: Object.keys(fields).length ? null : message ?? 'Không thể tạo tài khoản. Vui lòng thử lại.',
    fields,
  }
}

/** What still depends on the account when the server answers ACCOUNT_IN_USE; empty for any other error. */
export function accountInUseBlockers(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.status !== 409) return []
  const details = readResponseError(error)?.errors as { code?: unknown; blockers?: { message?: unknown }[] } | undefined
  if (details?.code !== 'ACCOUNT_IN_USE' || !Array.isArray(details.blockers)) return []
  return details.blockers.map(blocker => blocker.message).filter((message): message is string => typeof message === 'string')
}

export function accountRequestError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
  if (error.status === 403) return 'Tài khoản hiện tại không có quyền thực hiện thao tác này.'
  const message = responseMessage(readResponseError(error))
  return error.status < 500 && message ? message : fallback
}

/** Vietnamese message for a refused password reset; never the raw server text. */
export function resetPasswordError(error: unknown): string {
  const fallback = 'Không đặt lại được mật khẩu. Vui lòng thử lại.'
  if (!(error instanceof ApiError)) return fallback
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
  if (error.status === 403) return 'Không thể đặt lại mật khẩu cho tài khoản này.'
  if (error.status === 404) return 'Không tìm thấy tài khoản này nữa. Hãy tải lại danh sách.'
  if (error.status === 409) {
    const code = (readResponseError(error)?.errors as { code?: unknown } | undefined)?.code
    if (code === 'STALE_VERSION') return 'Tài khoản vừa được thay đổi. Hãy đóng hộp thoại, mở lại tài khoản rồi thử lại.'
  }
  if (error.status === 400) return `Mật khẩu mới cần từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự.`
  return fallback
}
