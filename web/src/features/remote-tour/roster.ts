import { readSheet } from 'read-excel-file/browser'
import type { RosterRow } from '../../api/contracts/remote-tour'
import { RemotePreviewError } from '../../mocks/remote-tour-mock'

export function parseRoster(rows: unknown[][]): RosterRow[] {
  const header = rows[0]?.map(cell => String(cell ?? '').trim()) ?? []
  const name = header.indexOf('HoTen'); const className = header.indexOf('Lop')
  if (name < 0) throw new RemotePreviewError('Thiếu cột HoTen. Hãy dùng mẫu Excel.')
  const result: RosterRow[] = []; const errors: string[] = []
  rows.slice(1).forEach((row, i) => {
    if (row.every(cell => cell == null || String(cell).trim() === '')) return
    if (typeof row[name] !== 'string' || !String(row[name]).trim()) errors.push(`Dòng ${i + 2}: HoTen cần là văn bản không rỗng.`)
    else result.push({ name: String(row[name]).trim(), className: className >= 0 ? String(row[className] ?? '').trim() : '' })
  })
  if (errors.length) throw new RemotePreviewError(errors.join(' '))
  if (!result.length) throw new RemotePreviewError('Danh sách cần ít nhất một học sinh.')
  if (result.length > 1000) throw new RemotePreviewError('Bản xem trước giới hạn 1.000 dòng.')
  return result
}
export async function readRoster(file: File) {
  if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 2 * 1024 * 1024) throw new RemotePreviewError('Chọn file .xlsx tối đa 2 MB cho bản xem trước.')
  try { return parseRoster(await readSheet(file, 1)) } catch (error) {
    if (error instanceof RemotePreviewError) throw error
    throw new RemotePreviewError('Không đọc được Excel. Hãy kiểm tra file và dùng mẫu .xlsx.')
  }
}
