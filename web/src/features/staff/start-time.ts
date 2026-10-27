import type { ActionGate } from '../../api/contracts/staff'
import { formatTime } from './formatters'

/**
 * SRS v1.9 §3.2.c: Staff starts a READY Tour at its published time. The server
 * remains the enforcement; this keeps the button closed, with a countdown,
 * until that time.
 */
export function startTimeGate(scheduledAt: string, now: number): ActionGate {
  const at = Date.parse(scheduledAt)
  if (!Number.isFinite(at) || now >= at) return { allowed: true }
  const minutes = Math.ceil((at - now) / 60_000)
  return { allowed: false, reason: `Chỉ bắt đầu từ ${formatTime(scheduledAt)}, giờ đã công bố (còn ${minutes} phút).` }
}
