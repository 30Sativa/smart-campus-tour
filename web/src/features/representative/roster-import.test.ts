import { Blob as NodeBlob } from 'node:buffer'
import { deflateRawSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { importRosterBytes, parseCsv, rosterTemplateBytes, rosterWorkbookBytes, rowsToRoster, ROSTER_MAX_ROWS } from './roster-import'
import { buildWorkbook, readFirstSheet, zipStored } from './xlsx-lite'

const enc = new TextEncoder()
afterEach(() => vi.unstubAllGlobals())

describe('roster import (flow review §4.2)', () => {
  it('reads the template it offers for download', async () => {
    const rows = await readFirstSheet(rosterTemplateBytes())
    expect(rows[0].cells).toEqual(['LoaiDong', 'HoTen', 'Email', 'Lop'])
    expect(rows).toHaveLength(3)
  })

  it('round-trips a roster through .xlsx, Vietnamese names included', async () => {
    const roster = [{ rowNumber: 2, rowType: 'INDIVIDUAL' as const, displayName: 'Đặng Thị Ánh Nguyệt', email: 'anh@example.com', className: '12A1' }, { rowNumber: 3, rowType: 'SHARED_VIEWING' as const, displayName: 'Phòng chung', email: 'room@example.com', className: null }]
    const result = await importRosterBytes('ds.xlsx', rosterWorkbookBytes(roster))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.rows).toEqual(roster)
      expect(result.withClass).toBe(1)
    }
  })

  it('reads a compressed workbook with shared strings, as Excel writes it', async () => {
    const shared = '<sst><si><t>Họ tên</t></si><si><t>Lớp</t></si><si><r><t>Phạm </t></r><r><t>Minh</t></r></si></sst>'
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="3"><c r="B3" t="s"><v>1</v></c><c r="A3" t="s"><v>2</v></c></row></sheetData></worksheet>'
    // jsdom's Blob has no stream(), while the browser reader uses that API.
    vi.stubGlobal('Blob', NodeBlob)
    const deflate = (text: string) => new Uint8Array(deflateRawSync(enc.encode(text)))
    // The sheet goes first and deflated: zipStored writes it as-is, then its
    // method is patched to 8 in both the local and the central header.
    const zip = zipStored([
      { name: 'xl/worksheets/sheet1.xml', data: deflate(sheet) },
      { name: 'xl/sharedStrings.xml', data: enc.encode(shared) },
    ])
    const view = new DataView(zip.buffer)
    view.setUint16(8, 8, true)
    for (let i = zip.length - 22; i >= 0; i -= 1) {
      if (view.getUint32(i, true) === 0x02014b50 && view.getUint32(i + 42, true) === 0) {
        view.setUint16(i + 10, 8, true)
        break
      }
    }
    const rows = await readFirstSheet(zip)
    expect(rows[0].cells).toEqual(['Họ tên', 'Lớp'])
    expect(rows[1]).toEqual({ rowNumber: 3, cells: ['Phạm Minh', 'Lớp'] })
    const result = rowsToRoster('ds.xlsx', rows)
    expect(result.ok).toBe(false) // The ZIP reader works; this legacy two-column file is no longer a valid invitation roster.
  })

  it('rejects every invalid invitation row with source row and column', () => {
    const result = rowsToRoster('ds.csv', parseCsv('LoaiDong,HoTen,Email,Lop\nCA_NHAN,An,an@example.com,10A\nUNKNOWN,,bad,10A\nCA_NHAN,Binh,AN@EXAMPLE.COM,10A\n'))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ row: 3, column: 'HoTen' }), expect.objectContaining({ row: 3, column: 'Email' }),
        expect.objectContaining({ row: 3, column: 'LoaiDong' }), expect.objectContaining({ row: 4, column: 'Email' }),
      ]))
    }
  })
  it('skips blanks, keeps identical names and accepts a shared-only group', () => {
    const result = rowsToRoster('ds.csv', parseCsv('﻿Loại dòng;Họ tên;Email;Lớp\r\nDIEM_XEM_CHUNG;Phòng A; ROOM@example.com ;\r\n;;;\r\nDIEM_XEM_CHUNG;Phòng A;other@example.com;\r\n'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.rows.map(row => row.displayName)).toEqual(['Phòng A', 'Phòng A'])
      expect(result.rows.map(row => row.rowNumber)).toEqual([2, 4])
      expect(result.rows[0].email).toBe('room@example.com')
      expect(result.rows.every(row => row.rowType === 'SHARED_VIEWING')).toBe(true)
      expect(result.skippedBlank).toBe(1)
    }
  })
  it('refuses a legacy header, empty roster, malformed CSV and one over the technical limit', () => {
    const legacy = rowsToRoster('a.csv', parseCsv('HoTen,Lop\nAn,1'))
    expect(legacy.ok).toBe(false)
    if (!legacy.ok) expect(legacy.issues.map(i => i.column)).toEqual(['LoaiDong', 'Email'])
    expect(rowsToRoster('b.csv', parseCsv('LoaiDong,HoTen,Email\n\n')).ok).toBe(false)
    expect(() => parseCsv('LoaiDong,HoTen,Email\nCA_NHAN,"Unclosed')).toThrow()
    const big = 'LoaiDong,HoTen,Email\n' + Array.from({ length: ROSTER_MAX_ROWS + 1 }, (_, i) => `CA_NHAN,HS ${i},hs${i}@example.com`).join('\n')
    expect(rowsToRoster('c.csv', parseCsv(big)).ok).toBe(false)
  })
  it('refuses a non-UTF-8 CSV instead of storing garbled Vietnamese names', async () => {
    // "Nguyên" saved by Excel's plain CSV on Vietnamese Windows (code page 1258): 0xEA is "ê".
    const ansi = new Uint8Array([...enc.encode('LoaiDong,HoTen,Email\nCA_NHAN,Nguy'), 0xea, ...enc.encode('n An,an@example.com\n')])
    const refused = await importRosterBytes('ds.csv', ansi)
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.issues).toEqual([expect.objectContaining({ row: null, message: expect.stringContaining('UTF-8') })])
    const utf8 = await importRosterBytes('ds.csv', enc.encode('﻿LoaiDong,HoTen,Email\nCA_NHAN,Nguyên An,an@example.com\n'))
    expect(utf8.ok && utf8.rows[0].displayName).toBe('Nguyên An')
  })

  it('bounds decompressed XML before allocating a worksheet', async () => {
    const zip = zipStored([{ name: 'xl/worksheets/sheet1.xml', data: enc.encode('<worksheet/>') }])
    const view = new DataView(zip.buffer)
    for (let i = zip.length - 22; i >= 0; i -= 1) {
      if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 9 * 1024 * 1024, true); break }
    }
    await expect(readFirstSheet(zip)).rejects.toThrow('quá lớn')
  })

  it('refuses old .xls, other types and files over 2 MB before reading them', async () => {
    expect((await importRosterBytes('a.xls', new Uint8Array(4))).ok).toBe(false)
    expect((await importRosterBytes('a.pdf', new Uint8Array(4))).ok).toBe(false)
    const big = await importRosterBytes('a.xlsx', new Uint8Array(0), 3 * 1024 * 1024)
    expect(big.ok).toBe(false)
    expect((await importRosterBytes('broken.xlsx', enc.encode('not a zip'))).ok).toBe(false)
  })

  it('writes a workbook every reader here can open', async () => {
    const rows = await readFirstSheet(buildWorkbook('S', [['HoTen'], ['A & B <C>']]))
    expect(rows[1].cells[0]).toBe('A & B <C>')
  })
})
