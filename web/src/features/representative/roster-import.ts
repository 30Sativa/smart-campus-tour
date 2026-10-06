import type { RosterRow } from './api/types'
import { XlsxError, buildWorkbook, readFirstSheet } from './xlsx-lite'
import type { SheetRow } from './xlsx-lite'

export const ROSTER_MAX_BYTES = 2 * 1024 * 1024
export const ROSTER_MAX_ROWS = 1000
export const NAME_MAX = 150
export const CLASS_MAX = 100

export type ImportIssue = {
  /** Row number as the spreadsheet shows it; null for a file-level problem. */
  row: number | null
  column: 'LoaiDong' | 'HoTen' | 'Email' | 'Lop' | null
  message: string
}

export type ImportResult =
  | { ok: true; fileName: string; rows: RosterRow[]; withClass: number; skippedBlank: number }
  | { ok: false; fileName: string; issues: ImportIssue[] }

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[\s_\-.]/g, '')

const NAME_HEADERS = new Set(['hoten', 'hovaten', 'hotenhocsinh', 'ten', 'name', 'fullname'])
const CLASS_HEADERS = new Set(['lop', 'lophoc', 'class', 'classname'])

const fail = (fileName: string, ...issues: ImportIssue[]): ImportResult => ({ ok: false, fileName, issues })

/* ── CSV ──────────────────────────────────────────────────────────────────── */

export function parseCsv(text: string): SheetRow[] {
  const body = text.replace(/^\uFEFF/, '')
  const firstLine = body.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: SheetRow[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let rowNumber = 1
  const endRow = () => {
    cells.push(cell)
    if (cells.length > 256 || rows.length >= 10002) throw new XlsxError('CSV có quá nhiều dòng hoặc cột để xem trước.')
    rows.push({ rowNumber, cells })
    cells = []
    cell = ''
    rowNumber += 1
  }
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      cells.push(cell)
      if (cells.length > 256) throw new XlsxError('CSV có quá nhiều cột để xem trước.')
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i += 1
      endRow()
    } else cell += ch
  }
  if (quoted) throw new XlsxError('CSV có dấu ngoặc kép chưa đóng.')
  if (cell !== '' || cells.length) endRow()
  return rows
}

/* ── Rows → roster ────────────────────────────────────────────────────────── */

/** Review 1: invitation rows, never a name-matching student roster. */
export function rowsToRoster(fileName: string, rows: SheetRow[]): ImportResult {
  const isBlank = (row: SheetRow) => row.cells.every(cell => !cell?.trim())
  const headerAt = rows.findIndex(row => !isBlank(row))
  if (headerAt < 0) return fail(fileName, { row: null, column: null, message: 'File không có dữ liệu.' })
  const header = rows[headerAt]
  const keys = header.cells.map(cell => fold(cell ?? ''))
  const nameCol = keys.findIndex(key => NAME_HEADERS.has(key))
  const classCol = keys.findIndex(key => CLASS_HEADERS.has(key))
  const typeCol = keys.indexOf('loaidong')
  const emailCol = keys.indexOf('email')
  const issues: ImportIssue[] = []
  for (const [column, index] of [['LoaiDong', typeCol], ['HoTen', nameCol], ['Email', emailCol]] as const) {
    if (index < 0) issues.push({ row: header.rowNumber, column, message: `Thiếu cột ${column}. Dùng file mẫu mới.` })
    else if (keys.filter(key => key === keys[index]).length > 1) issues.push({ row: header.rowNumber, column, message: `Cột ${column} bị trùng.` })
  }
  if (issues.length) return fail(fileName, ...issues)
  const roster: RosterRow[] = []
  const emails = new Set<string>()
  const numbers = new Set<number>()
  let skippedBlank = 0
  for (const row of rows.slice(headerAt + 1)) {
    if (isBlank(row)) { skippedBlank += 1; continue }
    const displayName = (row.cells[nameCol] ?? '').trim()
    const className = classCol >= 0 ? (row.cells[classCol] ?? '').trim() : ''
    const email = (row.cells[emailCol] ?? '').trim().toLowerCase()
    const type = (row.cells[typeCol] ?? '').trim().toUpperCase()
    const issue = (column: ImportIssue['column'], message: string) => issues.push({ row: row.rowNumber, column, message })
    if (!displayName) issue('HoTen', 'Thiếu tên cá nhân hoặc điểm xem chung.')
    else if (displayName.length > NAME_MAX) issue('HoTen', `Tên dài quá ${NAME_MAX} ký tự.`)
    if (className.length > CLASS_MAX) issue('Lop', `Lớp dài quá ${CLASS_MAX} ký tự.`)
    if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254) issue('Email', 'Email thiếu hoặc sai định dạng.')
    else if (emails.has(email)) issue('Email', 'Email bị trùng trong danh sách.')
    emails.add(email)
    if (type !== 'CA_NHAN' && type !== 'DIEM_XEM_CHUNG') issue('LoaiDong', 'Chỉ nhận CA_NHAN hoặc DIEM_XEM_CHUNG.')
    if (!Number.isInteger(row.rowNumber) || row.rowNumber < 1 || row.rowNumber > 1048576 || numbers.has(row.rowNumber)) issue(null, 'Số dòng không hợp lệ hoặc bị trùng.')
    numbers.add(row.rowNumber)
    roster.push({ rowNumber: row.rowNumber, rowType: type === 'CA_NHAN' ? 'INDIVIDUAL' : 'SHARED_VIEWING', displayName, email, className: className || null })
  }
  if (!roster.length) return fail(fileName, { row: null, column: null, message: 'Danh sách cần ít nhất một dòng lời mời.' })
  if (roster.length > ROSTER_MAX_ROWS) return fail(fileName, { row: null, column: null, message: `Vượt giới hạn ${ROSTER_MAX_ROWS} dòng.` })
  if (issues.length) return fail(fileName, ...issues)
  return { ok: true, fileName, rows: roster, withClass: roster.filter(row => row.className).length, skippedBlank }
}

/* ── File entry point ─────────────────────────────────────────────────────── */

/**
 * Excel's plain "CSV" on Vietnamese Windows is an ANSI code page, not UTF-8.
 * Decoding it leniently would silently store "Nguy?n" as an invitation name,
 * so a CSV must be valid UTF-8 or it is refused before any row is read.
 */
function decodeCsv(bytes: ArrayBuffer | Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new XlsxError('File CSV không ở dạng UTF-8 nên tên tiếng Việt có thể bị lỗi. Lưu lại bằng "CSV UTF-8" hoặc dùng file .xlsx.')
  }
}

export async function importRosterBytes(fileName: string, bytes: ArrayBuffer | Uint8Array, size = bytes.byteLength): Promise<ImportResult> {
  if (size > ROSTER_MAX_BYTES) {
    return fail(fileName, { row: null, column: null, message: `File ${(size / 1024 / 1024).toFixed(1)} MB, vượt giới hạn 2 MB.` })
  }
  const lower = fileName.toLowerCase()
  try {
    if (lower.endsWith('.xlsx')) return rowsToRoster(fileName, await readFirstSheet(bytes))
    if (lower.endsWith('.csv')) return rowsToRoster(fileName, parseCsv(decodeCsv(bytes)))
    if (lower.endsWith('.xls')) {
      return fail(fileName, { row: null, column: null, message: 'Định dạng .xls cũ chưa được hỗ trợ. Mở file và lưu lại dạng .xlsx (Excel Workbook).' })
    }
    return fail(fileName, { row: null, column: null, message: 'Chỉ nhận file .xlsx hoặc .csv.' })
  } catch (error) {
    const message = error instanceof XlsxError ? error.message : 'Không đọc được file. Kiểm tra file có mở được bằng Excel không.'
    return fail(fileName, { row: null, column: null, message })
  }
}

export async function importRosterFile(file: File): Promise<ImportResult> {
  if (file.size > ROSTER_MAX_BYTES) return importRosterBytes(file.name, new Uint8Array(0), file.size)
  return importRosterBytes(file.name, await file.arrayBuffer(), file.size)
}

/* ── Template ─────────────────────────────────────────────────────────────── */

export const TEMPLATE_FILE_NAME = 'CampusTour-mau-loi-moi.xlsx'

/** Header plus two openly fake example rows the representative overwrites. */
export function rosterTemplateBytes(): Uint8Array {
  return buildWorkbook('DanhSach', [['LoaiDong', 'HoTen', 'Email', 'Lop'], ['CA_NHAN', 'Nguyễn Văn An', 'an@example.com', '10A1'], ['DIEM_XEM_CHUNG', 'Phòng xem trường A', 'phong@example.com', '']], [24, 34, 38, 12])
}

/** The current roster back as a workbook, so a replacement can start from it. */
export function rosterWorkbookBytes(rows: RosterRow[]): Uint8Array {
  return buildWorkbook('DanhSach', [['LoaiDong', 'HoTen', 'Email', 'Lop'], ...rows.map(row => [row.rowType === 'INDIVIDUAL' ? 'CA_NHAN' : 'DIEM_XEM_CHUNG', row.displayName, row.email, row.className ?? ''])], [24, 34, 38, 12])
}

export function downloadBytes(fileName: string, bytes: Uint8Array) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
