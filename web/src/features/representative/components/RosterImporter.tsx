import { useState } from 'react'
import { AlertCircle, Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react'
import type { RosterRow } from '../../../api/contracts/representative'
import {
  ROSTER_MAX_ROWS,
  TEMPLATE_FILE_NAME,
  downloadBytes,
  importRosterFile,
  rosterTemplateBytes,
} from '../roster-import'
import type { ImportResult } from '../roster-import'

type Props = {
  result: ImportResult | null
  onResult: (result: ImportResult | null) => void
  /** The roster already on file, when editing. Shown so the representative knows what gets replaced. */
  currentCount?: number
  fieldError?: string
}

/**
 * Template download, file drop and the all-or-nothing result (flow review §4.2):
 * either every problem with its row and column, or a preview of exactly what
 * will replace the roster once confirmed.
 */
export function RosterImporter({ result, onResult, currentCount, fieldError }: Props) {
  const [over, setOver] = useState(false)
  const [reading, setReading] = useState(false)

  const read = async (file: File | undefined) => {
    if (!file) return
    setReading(true)
    try {
      onResult(await importRosterFile(file))
    } finally {
      setReading(false)
    }
  }

  return (
    <div className="rp-stack" style={{ gap: 16 }}>
      <div className="rp-import-head">
        <p className="rp-muted" style={{ maxWidth: '60ch' }}>
          File .xlsx hoặc .csv, tối đa 2 MB và {ROSTER_MAX_ROWS} học sinh. Cột <b>HoTen</b> bắt buộc, cột <b>Lop</b> điền nếu có.
          {currentCount != null && currentCount > 0 && <> Danh sách mới sẽ <b>thay toàn bộ</b> {currentCount} học sinh hiện có.</>}
        </p>
        <button type="button" className="rp-chip-btn" onClick={() => downloadBytes(TEMPLATE_FILE_NAME, rosterTemplateBytes())}>
          <Download size={15} />
          Tải file mẫu Excel
        </button>
      </div>

      <label
        className={over ? 'rp-drop is-over' : 'rp-drop'}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          void read(event.dataTransfer.files[0])
        }}
      >
        <input
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          aria-label="Chọn file danh sách học sinh"
          onChange={(event) => {
            void read(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <span className="rp-drop__ic" aria-hidden="true">{reading ? <span className="rp-spinner" /> : <Upload size={22} />}</span>
        <b>{reading ? 'Đang đọc file...' : 'Kéo thả file vào đây hoặc bấm để chọn'}</b>
        <small>Chỉ đọc trên trình duyệt để xem trước. Danh sách được gửi khi bạn xác nhận ở bước cuối.</small>
      </label>

      {fieldError && !result && (
        <p className="rp-err" role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{fieldError}</p>
      )}

      {result && !result.ok && (
        <div className="rp-callout rp-callout--danger" role="alert">
          <AlertCircle size={18} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <b>Không nhập được {result.fileName}</b>
            <p>Không có dòng nào được nhập; danh sách và trạng thái hiện tại giữ nguyên. Sửa các lỗi dưới đây rồi tải lại file.</p>
            <div className="rp-table-wrap" style={{ marginTop: 12, maxHeight: 260, background: 'var(--paper)' }}>
              <table className="rp-table rp-table--issues">
                <thead><tr><th>Dòng</th><th>Cột</th><th>Lý do</th></tr></thead>
                <tbody>
                  {result.issues.map((issue, i) => (
                    <tr key={i}>
                      <td className="rp-num">{issue.row ?? '–'}</td>
                      <td>{issue.column ?? 'File'}</td>
                      <td>{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {result?.ok && <RosterPreview result={result} onClear={() => onResult(null)} />}
    </div>
  )
}

function RosterPreview({ result, onClear }: { result: Extract<ImportResult, { ok: true }>; onClear: () => void }) {
  return (
    <div className="rp-card" style={{ padding: 20, border: '1px solid var(--line)' }}>
      <div className="rp-card-title">
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><FileSpreadsheet size={15} />{result.fileName}</span>
        <button type="button" className="rp-link" onClick={onClear}><RotateCcw size={13} />Chọn file khác</button>
      </div>
      <div className="rp-summary" style={{ marginBottom: 14 }}>
        <div><b>{result.rows.length}</b>Học sinh sẽ được gửi</div>
        <div><b>{result.withClass}</b>Dòng có lớp</div>
        <div><b>{result.skippedBlank}</b>Dòng trống đã bỏ qua</div>
      </div>
      <RosterTable rows={result.rows} />
    </div>
  )
}

export function RosterTable({ rows, searchable = false }: { rows: RosterRow[]; searchable?: boolean }) {
  const [q, setQ] = useState('')
  const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()
  const shown = q ? rows.map((row, i) => ({ row, i })).filter(({ row }) => fold(`${row.name} ${row.className ?? ''}`).includes(fold(q))) : rows.map((row, i) => ({ row, i }))
  return (
    <>
      {searchable && (
        <input className="rp-search" type="search" placeholder="Tìm theo tên hoặc lớp..." value={q} onChange={(event) => setQ(event.target.value)} aria-label="Tìm học sinh trong danh sách" />
      )}
      <div className="rp-table-wrap">
        <table className="rp-table">
          <thead><tr><th>#</th><th>Họ tên</th><th>Lớp</th></tr></thead>
          <tbody>
            {shown.map(({ row, i }) => (
              <tr key={i}>
                <td className="rp-num">{String(i + 1).padStart(2, '0')}</td>
                <td>{row.name}</td>
                <td>{row.className || <span className="rp-muted">–</span>}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={3} className="rp-muted">Không có học sinh khớp “{q}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
