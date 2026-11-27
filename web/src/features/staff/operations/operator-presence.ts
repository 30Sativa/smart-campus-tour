import { ApiError } from '../../../api/client'

export function operatorReconnect(error: unknown): { lastSeen: string; allowedAt: string } | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  try {
    const data = JSON.parse(error.body) as { errors?: { code?: unknown; operatorLastSeenAt?: unknown; allowedAt?: unknown } }
    const { code, operatorLastSeenAt, allowedAt } = data.errors ?? {}
    const last = Array.isArray(operatorLastSeenAt) ? operatorLastSeenAt[0] : null
    const until = Array.isArray(allowedAt) ? allowedAt[0] : null
    return code === 'OPERATOR_STILL_CONNECTED' && typeof last === 'string' && typeof until === 'string'
      && Number.isFinite(Date.parse(last)) && Number.isFinite(Date.parse(until)) ? { lastSeen: last, allowedAt: until } : null
  } catch { return null }
}
