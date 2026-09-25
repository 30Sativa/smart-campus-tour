import { describe, expect, it } from 'vitest'
import { importRosterBytes, parseCsv, rosterTemplateBytes, rosterWorkbookBytes, rowsToRoster, ROSTER_MAX_ROWS } from './roster-import'
import { buildWorkbook, readFirstSheet, zipStored } from './xlsx-lite'

const enc = new TextEncoder()

describe('roster import (flow review §4.2)', () => {
  it('reads the template it offers for download', async () => {
    const rows = await readFirstSheet(rosterTemplateBytes())
    expect(rows[0].cells).toEqual(['HoTen', 'Lop'])
    expect(rows).toHaveLength(3)
  })

  it('round-trips a roster through .xlsx, Vietnamese names included', async () => {
    const roster = [{ name: 'Đặng Thị Ánh Nguyệt', className: '12A1' }, { name: 'Lê Văn Bình', className: null }]
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
    const deflate = async (text: string) =>
      new Uint8Array(await new Response(new Blob([enc.encode(text)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
    // The sheet goes first and deflated: zipStored writes it as-is, then its
    // method is patched to 8 in both the local and the central header.
    const zip = zipStored([
      { name: 'xl/worksheets/sheet1.xml', data: await deflate(sheet) },
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
    expect(result.ok && result.rows).toEqual([{ name: 'Phạm Minh', className: 'Lớp' }])
  })

  it('names the row and column of every problem and imports nothing', () => {
    const result = rowsToRoster('ds.csv', parseCsv('HoTen,Lop\nNguyễn An,10A1\n,10A1\n12345,10A2\n'))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual([
        { row: 3, column: 'HoTen', message: 'Thiếu họ tên học sinh.' },
        { row: 4, column: 'HoTen', message: 'Họ tên chỉ có số; kiểm tra lại cột.' },
      ])
    }
  })

  it('skips fully blank rows, keeps duplicates, accepts accented headers and semicolons', () => {
    const result = rowsToRoster('ds.csv', parseCsv('﻿Họ tên;Lớp\r\nAn;10A1\r\n;\r\nAn;10A1\r\n"Bình, Lê";\r\n'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.rows.map((row) => row.name)).toEqual(['An', 'An', 'Bình, Lê'])
      expect(result.skippedBlank).toBe(1)
      expect(result.withClass).toBe(2)
    }
  })

  it('refuses a file without a HoTen column, an empty list and one over the limit', () => {
    const noName = rowsToRoster('a.csv', parseCsv('Ten hoc sinh x,Lop\nAn,1'))
    expect(noName.ok || noName.issues[0].column).toBe('HoTen')
    expect(rowsToRoster('b.csv', parseCsv('HoTen,Lop\n\n')).ok).toBe(false)
    const big = 'HoTen\n' + Array.from({ length: ROSTER_MAX_ROWS + 1 }, (_, i) => `HS ${i}`).join('\n')
    const over = rowsToRoster('c.csv', parseCsv(big))
    expect(over.ok).toBe(false)
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
