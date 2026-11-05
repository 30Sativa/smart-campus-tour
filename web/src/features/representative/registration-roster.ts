import type { RegistrationRosterInput, RepresentativeRosterRow, RosterRow } from './api/types'

const normalized = (value: string) => value.trim().toLowerCase()
const optionalText = (value: string | null) => value?.trim() || null

/** Whitelist the request DTO: response-only state/version fields are rejected by the API. */
export function rosterInput(row: RosterRow & { id?: string; rowId?: string | null }): RegistrationRosterInput {
  const rowId = row.rowId ?? row.id
  return {
    rowNumber: row.rowNumber, rowType: row.rowType, displayName: row.displayName.trim(),
    email: normalized(row.email), className: optionalText(row.className),
    ...(rowId ? { rowId } : {}),
  }
}

export function matchRosterIdentities(imported: RosterRow[], existing: RepresentativeRosterRow[]): RegistrationRosterInput[] {
  const byEmail = new Map(existing.filter(row => row.participationState !== 'REMOVED').map(row => [normalized(row.email), row]))
  return imported.map(row => rosterInput({
    rowNumber: row.rowNumber, rowType: row.rowType, displayName: row.displayName,
    email: row.email, className: row.className, rowId: byEmail.get(normalized(row.email))?.id,
  }))
}

export type RosterChange = { before: RepresentativeRosterRow; after: RegistrationRosterInput }
export function rosterReplacement(existing: RepresentativeRosterRow[], incoming: RegistrationRosterInput[]) {
  const current = existing.filter(row => row.participationState !== 'REMOVED')
  const byId = new Map(current.filter(row => row.id).map(row => [row.id!, row]))
  const keptIds = new Set(incoming.map(row => row.rowId).filter(Boolean))
  const removed = current.filter(row => !row.id || !keptIds.has(row.id))
  const added = incoming.filter(row => !row.rowId)
  const changed: RosterChange[] = []
  const unchanged: RosterChange[] = []
  for (const after of incoming) {
    const before = after.rowId ? byId.get(after.rowId) : undefined
    if (!before) continue
    const isSame = before.rowNumber === after.rowNumber && before.rowType === after.rowType &&
      before.displayName.trim() === after.displayName && normalized(before.email) === normalized(after.email) && optionalText(before.className) === after.className
    if (isSame) unchanged.push({ before, after })
    else changed.push({ before, after })
  }
  const issues: string[] = []
  if (current.some(row => !row.id)) issues.push('Hồ sơ thiếu định danh dòng. Tải lại dữ liệu trước khi thay danh sách để bảo toàn lời mời hiện tại.')
  for (const row of removed) {
    if (row.canRemove === false) issues.push(`Không thể loại dòng ${row.displayName} theo quyền hiện tại.`)
    if (row.participationState === 'ACCEPTED' && added.some(next => normalized(next.displayName) === normalized(row.displayName) && next.rowType === row.rowType && optionalText(next.className) === optionalText(row.className))) {
      issues.push(`Email của dòng đã chấp nhận ${row.displayName} có thể đang được thay đổi. Dùng yêu cầu đổi email để Staff xem xét, không thay email qua nhập lại danh sách.`)
    }
  }
  for (const { before, after } of changed) {
    if (before.participationState === 'ACCEPTED' && normalized(before.email) !== normalized(after.email)) issues.push(`Email của ${before.displayName} cần yêu cầu đổi email riêng.`)
    if (before.participationState === 'ACCEPTED' && before.rowType !== after.rowType) issues.push(`Không thể đổi hình thức của dòng đã chấp nhận ${before.displayName} qua thay danh sách.`)
  }
  const acceptedAffected = removed.some(row => row.participationState === 'ACCEPTED') || changed.some(row => row.before.participationState === 'ACCEPTED')
  return { added, removed, changed, unchanged, issues, acceptedAffected }
}
