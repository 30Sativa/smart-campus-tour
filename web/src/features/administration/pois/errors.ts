import { ApiError } from '../../../api/client'

type ApiFailure = { message?: unknown; errors?: unknown }

function readFailure(error: ApiError): ApiFailure | null {
  try {
    const value: unknown = JSON.parse(error.body)
    return typeof value === 'object' && value !== null ? value as ApiFailure : null
  } catch {
    return null
  }
}

export function poiRequestError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
  if (error.status === 403) return 'Tài khoản hiện tại không có quyền quản lý POI.'
  const message = readFailure(error)?.message
  return error.status < 500 && typeof message === 'string' && message.trim() ? message : fallback
}
