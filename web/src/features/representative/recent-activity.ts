import type { RegistrationSummary } from './api/types'
import { closedKind, isClosedRegistration, REGISTRATION_GROUPS } from './rep-format'
import type { ClosedKind } from './rep-format'

/** The "Đã hủy" tab of "Đăng ký của tôi". */
export const CLOSED_REGISTRATIONS_URL = `/dai-dien/dang-ky?nhom=${REGISTRATION_GROUPS.find(group => group.group === 'closed')!.slug}`

const GROUP_LABEL: Record<ClosedKind, (count: number) => string> = {
  'tour-no-start': count => `${count} buổi bị huỷ vì không bắt đầu đúng giờ`,
  'tour-cancelled': count => `${count} buổi bị Đại học FPT huỷ`,
  'self-cancelled': count => `${count} đăng ký bạn đã hủy`,
  'review-expired': count => `${count} đăng ký hết hạn duyệt`,
  rejected: count => `${count} đăng ký bị từ chối`,
}

export type RecentActivityItem =
  | { kind: 'registration'; registration: RegistrationSummary }
  | { kind: 'group'; key: ClosedKind; label: string; registrations: RegistrationSummary[]; to: string }

/**
 * "Hoạt động gần đây": ended registrations that ended the same way are read as one line, such as
 * "3 buổi bị huỷ vì không bắt đầu đúng giờ", linking to the "Đã hủy" tab. A kind seen once stays a
 * normal card. A gathered line takes the place of its newest record, so the list keeps its order.
 */
export function groupRecentActivity(registrations: readonly RegistrationSummary[]): RecentActivityItem[] {
  const byKind = new Map<ClosedKind, RegistrationSummary[]>()
  for (const registration of registrations) {
    if (!isClosedRegistration(registration)) continue
    const kind = closedKind(registration)
    byKind.set(kind, [...(byKind.get(kind) ?? []), registration])
  }
  const items: RecentActivityItem[] = []
  const placed = new Set<ClosedKind>()
  for (const registration of registrations) {
    const kind = isClosedRegistration(registration) ? closedKind(registration) : null
    const same = kind ? byKind.get(kind)! : []
    if (!kind || same.length < 2) { items.push({ kind: 'registration', registration }); continue }
    if (placed.has(kind)) continue
    placed.add(kind)
    items.push({ kind: 'group', key: kind, label: GROUP_LABEL[kind](same.length), registrations: same, to: CLOSED_REGISTRATIONS_URL })
  }
  return items
}
