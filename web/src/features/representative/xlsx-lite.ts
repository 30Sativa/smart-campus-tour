/**
 * Just enough of the .xlsx format for a two-column roster, with no dependency:
 * read the first worksheet of a workbook into rows of strings, and write a
 * one-sheet workbook (the downloadable template).
 *
 * An .xlsx file is a ZIP of XML parts. Reading walks the ZIP central directory
 * and inflates entries with the platform's `DecompressionStream('deflate-raw')`;
 * writing stores entries uncompressed, which every spreadsheet app opens.
 * The XML is read with small regular expressions over the parts Excel,
 * LibreOffice and Google Sheets actually emit, not a general XML parser.
 */

/* ── ZIP read ─────────────────────────────────────────────────────────────── */

type ZipEntry = { name: string; method: number; compressedSize: number; offset: number }

export class XlsxError extends Error {}

function u16(v: DataView, at: number) {
  return v.getUint16(at, true)
}
function u32(v: DataView, at: number) {
  return v.getUint32(at, true)
}

function listEntries(buf: Uint8Array): ZipEntry[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  // End of central directory: scan back over a possible comment (≤ 64 KB).
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i -= 1) {
    if (u32(v, i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new XlsxError('Không đọc được file: không phải file .xlsx hợp lệ.')
  const count = u16(v, eocd + 10)
  let at = u32(v, eocd + 16)
  const entries: ZipEntry[] = []
  const decoder = new TextDecoder()
  for (let i = 0; i < count; i += 1) {
    if (u32(v, at) !== 0x02014b50) throw new XlsxError('Không đọc được file: cấu trúc .xlsx bị hỏng.')
    const method = u16(v, at + 10)
    const compressedSize = u32(v, at + 20)
    const nameLen = u16(v, at + 28)
    const extraLen = u16(v, at + 30)
    const commentLen = u16(v, at + 32)
    const offset = u32(v, at + 42)
    const name = decoder.decode(buf.subarray(at + 46, at + 46 + nameLen))
    entries.push({ name, method, compressedSize, offset })
    at += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new XlsxError('Trình duyệt không hỗ trợ đọc .xlsx. Hãy lưu file dạng .csv rồi tải lên.')
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readEntry(buf: Uint8Array, entry: ZipEntry): Promise<string> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (u32(v, entry.offset) !== 0x04034b50) throw new XlsxError('Không đọc được file: cấu trúc .xlsx bị hỏng.')
  const start = entry.offset + 30 + u16(v, entry.offset + 26) + u16(v, entry.offset + 28)
  const raw = buf.subarray(start, start + entry.compressedSize)
  let bytes: Uint8Array
  if (entry.method === 0) bytes = raw
  else if (entry.method === 8) bytes = await inflateRaw(raw)
  else throw new XlsxError('File .xlsx dùng kiểu nén không hỗ trợ.')
  return new TextDecoder().decode(bytes)
}

/* ── XML helpers ──────────────────────────────────────────────────────────── */

function unescapeXml(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function escapeXml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Text of every `<t>` run inside a fragment (rich text is several runs). */
function runs(fragment: string) {
  let out = ''
  for (const m of fragment.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)) out += unescapeXml(m[1])
  return out
}

function columnIndex(ref: string) {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]

/* ── Workbook read ────────────────────────────────────────────────────────── */

/** Rows of the first worksheet, as strings; `rowNumber` is the sheet's own row number. */
export type SheetRow = { rowNumber: number; cells: string[] }

export async function readFirstSheet(bytes: ArrayBuffer | Uint8Array): Promise<SheetRow[]> {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const entries = listEntries(buf)
  const byName = new Map(entries.map((e) => [e.name.replace(/^\//, ''), e]))
  const text = async (name: string) => {
    const e = byName.get(name)
    return e ? readEntry(buf, e) : null
  }

  // First sheet through workbook.xml and its relationships; sheet1.xml as a fallback.
  let sheetPath = 'xl/worksheets/sheet1.xml'
  const workbook = await text('xl/workbook.xml')
  const rels = await text('xl/_rels/workbook.xml.rels')
  const firstSheet = workbook ? /<(?:\w+:)?sheet\s[^>]*>/.exec(workbook)?.[0] : undefined
  const rid = firstSheet ? /\sr:id="([^"]+)"/.exec(firstSheet)?.[1] : undefined
  if (rid && rels) {
    for (const m of rels.matchAll(/<Relationship\s[^>]*>/g)) {
      if (attr(m[0], 'Id') === rid) {
        const target = attr(m[0], 'Target') ?? ''
        sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
      }
    }
  }
  const sheet = await text(sheetPath)
  if (!sheet) throw new XlsxError('Không tìm thấy trang tính trong file .xlsx.')

  const shared: string[] = []
  const sst = await text('xl/sharedStrings.xml')
  if (sst) for (const m of sst.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)) shared.push(runs(m[1]))

  const rows: SheetRow[] = []
  let implicitRow = 0
  for (const rowMatch of sheet.matchAll(/<(?:\w+:)?row(\s[^>]*)?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const r = rowMatch[1] ? attr(rowMatch[1], 'r') : undefined
    implicitRow = r ? Number(r) : implicitRow + 1
    const cells: string[] = []
    let implicitCol = 0
    for (const c of (rowMatch[2] ?? '').matchAll(/<(?:\w+:)?c(\s[^>]*)?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const head = c[1] ?? ''
      const ref = attr(head, 'r')
      const col = ref ? columnIndex(ref) : implicitCol
      implicitCol = col + 1
      const type = attr(head, 't')
      const body = c[2] ?? ''
      const value = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1]
      let out = ''
      if (type === 's') out = shared[Number(value)] ?? ''
      else if (type === 'inlineStr') out = runs(body)
      else if (value != null) out = unescapeXml(value)
      cells[col] = out
    }
    rows.push({ rowNumber: implicitRow, cells: Array.from(cells, (cell) => cell ?? '') })
  }
  return rows
}

/* ── Workbook write (template) ────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A ZIP with stored (uncompressed) entries. */
export function zipStored(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = enc.encode(file.name)
    const crc = crc32(file.data)
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // UTF-8 names
    lv.setUint16(8, 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, file.data.length, true)
    lv.setUint32(22, file.data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    const head = new Uint8Array(46 + name.length)
    const cv = new DataView(head.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, file.data.length, true)
    cv.setUint32(24, file.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    head.set(name, 46)
    chunks.push(local, file.data)
    central.push(head)
    offset += local.length + file.data.length
  }
  const size = central.reduce((sum, c) => sum + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, size, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + size + 22)
  let at = 0
  for (const c of [...chunks, ...central, end]) {
    out.set(c, at)
    at += c.length
  }
  return out
}

const colName = (i: number) => {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** A one-sheet workbook of text cells. Column widths are set so names fit. */
export function buildWorkbook(sheetName: string, rows: string[][], widths: number[] = []): Uint8Array {
  const enc = new TextEncoder()
  const sheetRows = rows
    .map((cells, r) => `<row r="${r + 1}">${cells.map((v, c) => `<c r="${colName(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`).join('')}</row>`)
    .join('')
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''
  const parts: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${sheetRows}</sheetData></worksheet>`,
  }
  return zipStored(Object.entries(parts).map(([name, xml]) => ({ name, data: enc.encode(xml) })))
}
