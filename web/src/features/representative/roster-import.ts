/**
 * Roster import for the representative (flow review §4.2, scope §3.3):
 *
 * - Template columns: `HoTen` (required), `Lop` (optional). Header matching
 *   ignores case, accents, spaces and underscores, so "Họ tên" or "HO_TEN" work.
 * - Fully blank rows are skipped; duplicates are kept (no merging by name).
 * - All or nothing: one bad row fails the whole file, with row / column / reason,
 *   and the current roster is left untouched.
 * - The result replaces the whole roster once confirmed; files never merge.
 * - Limits are the preview build's (§10.3): 2 MB and 1 000 students.
 *
 * Accepts .xlsx (first sheet) and .csv (UTF-8, comma or semicolon). Pure
 * functions over bytes, so they are tested without a browser.
 */
import type { RosterRow } from '../../api/contracts/staff'
import { XlsxError, buildWorkbook, readFirstSheet } from './xlsx-lite'
import type { SheetRow } from './xlsx-lite'

export const ROSTER_MAX_BYTES = 2 * 1024 * 1024
export const ROSTER_MAX_ROWS = 1000
export const NAME_MAX = 100
export const CLASS_MAX = 20

export type ImportIssue = {
  /** Row number as the spreadsheet shows it; null for a file-level problem. */
  row: number | null
  column: 'HoTen' | 'Lop' | null
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
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i += 1
      endRow()
    } else cell += ch
  }
  if (cell !== '' || cells.length) endRow()
  return rows
}

/* ── Rows → roster ────────────────────────────────────────────────────────── */

export function rowsToRoster(fileName: string, rows: SheetRow[]): ImportResult {
  const isBlank = (row: SheetRow) => row.cells.every((cell) => !cell?.trim())
  const headerAt = rows.findIndex((row) => !isBlank(row))
  if (headerAt < 0) return fail(fileName, { row: null, column: null, message: 'File không có dữ liệu. Hãy dùng file mẫu và nhập danh sách học sinh.' })

  const header = rows[headerAt]
  const keys = header.cells.map((cell) => fold(cell ?? ''))
  const nameCol = keys.findIndex((key) => NAME_HEADERS.has(key))
  const classCol = keys.findIndex((key) => CLASS_HEADERS.has(key))
  if (nameCol < 0) {
    return fail(fileName, { row: header.rowNumber, column: 'HoTen', message: 'Không tìm thấy cột HoTen ở dòng tiêu đề. Dùng file mẫu hoặc đặt tên cột đúng là HoTen và Lop.' })
  }

  const issues: ImportIssue[] = []
  const roster: RosterRow[] = []
  let skippedBlank = 0
  for (const row of rows.slice(headerAt + 1)) {
    if (isBlank(row)) {
      skippedBlank += 1
      continue
    }
    const name = (row.cells[nameCol] ?? '').trim().replace(/\s+/g, ' ')
    const className = classCol >= 0 ? (row.cells[classCol] ?? '').trim() : ''
    if (!name) issues.push({ row: row.rowNumber, column: 'HoTen', message: 'Thiếu họ tên học sinh.' })
    else if (name.length > NAME_MAX) issues.push({ row: row.rowNumber, column: 'HoTen', message: `Họ tên dài quá ${NAME_MAX} ký tự.` })
    else if (/^[\d\s.,-]+$/.test(name)) issues.push({ row: row.rowNumber, column: 'HoTen', message: 'Họ tên chỉ có số; kiểm tra lại cột.' })
    if (className.length > CLASS_MAX) issues.push({ row: row.rowNumber, column: 'Lop', message: `Lớp dài quá ${CLASS_MAX} ký tự.` })
    roster.push({ name, className: className || null })
  }

  if (roster.length === 0 && issues.length === 0) {
    return fail(fileName, { row: null, column: null, message: 'Danh sách chưa có học sinh nào dưới dòng tiêu đề.' })
  }
  if (roster.length > ROSTER_MAX_ROWS) {
    return fail(fileName, { row: null, column: null, message: `File có ${roster.length} học sinh, vượt giới hạn ${ROSTER_MAX_ROWS}.` })
  }
  if (issues.length) return fail(fileName, ...issues)
  return { ok: true, fileName, rows: roster, withClass: roster.filter((row) => row.className).length, skippedBlank }
}

/* ── File entry point ─────────────────────────────────────────────────────── */

export async function importRosterBytes(fileName: string, bytes: ArrayBuffer | Uint8Array, size = bytes.byteLength): Promise<ImportResult> {
  if (size > ROSTER_MAX_BYTES) {
    return fail(fileName, { row: null, column: null, message: `File ${(size / 1024 / 1024).toFixed(1)} MB, vượt giới hạn 2 MB.` })
  }
  const lower = fileName.toLowerCase()
  try {
    if (lower.endsWith('.xlsx')) return rowsToRoster(fileName, await readFirstSheet(bytes))
    if (lower.endsWith('.csv')) return rowsToRoster(fileName, parseCsv(new TextDecoder().decode(bytes)))
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

export const TEMPLATE_FILE_NAME = 'CampusTour-mau-danh-sach-hoc-sinh.xlsx'

/** Header plus two openly fake example rows the representative overwrites. */
export function rosterTemplateBytes(): Uint8Array {
  return buildWorkbook('DanhSach', [['HoTen', 'Lop'], ['Nguyễn Văn An', '10A1'], ['Trần Thị Bình', '10A1']], [34, 12])
}

/** The current roster back as a workbook, so a replacement can start from it. */
export function rosterWorkbookBytes(rows: RosterRow[]): Uint8Array {
  return buildWorkbook('DanhSach', [['HoTen', 'Lop'], ...rows.map((row) => [row.name, row.className ?? ''])], [34, 12])
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
