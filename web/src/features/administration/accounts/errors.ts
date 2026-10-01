import { ApiError } from '../../../api/client'

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

export function accountRequestError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
  if (error.status === 403) return 'Tài khoản hiện tại không có quyền thực hiện thao tác này.'
  const message = responseMessage(readResponseError(error))
  return error.status < 500 && message ? message : fallback
}
