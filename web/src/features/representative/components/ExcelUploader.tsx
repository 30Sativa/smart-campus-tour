import { useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, Download } from 'lucide-react'
import { repButton } from '../rep-classes'
import { ROSTER_MAX_ROWS, TEMPLATE_FILE_NAME, downloadBytes, importRosterFile, rosterTemplateBytes } from '../roster-import'
import type { ImportResult } from '../roster-import'
import { RosterPreview } from './RosterPreview'
import { HoopDrop } from './HoopDrop'

export type AcceptedRoster = Extract<ImportResult, { ok: true }>

type Phase =
  | { kind: 'idle' }
  | { kind: 'validating'; fileName: string }
  | { kind: 'invalid'; result: Extract<ImportResult, { ok: false }> }
  | { kind: 'valid'; result: AcceptedRoster }

/**
 * Excel roster upload (flow review §4.2, scope §3.3):
 *
 *   choose / drop / throw a file → (into the hoop) → validating → invalid: every row / column / reason,
 *                                       nothing replaced, pick another file
 *                                     → valid: preview, then the explicit
 *                                       "Xác nhận sử dụng danh sách này"
 *
 * Only the confirmation hands the rows to the form (`onAccept`), and it
 * replaces the whole list: files never merge. A bad file never touches the
 * list that is already in use.
 */
export function ExcelUploader({ accepted, onAccept, inUse, error }: {
  /** The list this form will send, once confirmed here. */
  accepted: AcceptedRoster | null
  onAccept: (roster: AcceptedRoster) => void
  /** The list on file when editing and no new file was confirmed yet. */
  inUse?: { count: number } | null
  error?: string
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)

  const read = async (file: File | undefined) => {
    if (!file) return
    setPhase({ kind: 'validating', fileName: file.name })
    const result = await importRosterFile(file)
    setPhase(result.ok ? { kind: 'valid', result } : { kind: 'invalid', result })
  }

  const pick = () => inputRef.current?.click()
  const keptCount = accepted?.rows.length ?? inUse?.count ?? 0
  const keptLabel = accepted ? `danh sách từ file ${accepted.fileName} (${accepted.rows.length} dòng lời mời)` : inUse ? `danh sách hiện tại (${inUse.count} dòng lời mời)` : null

  return (
    <div className="rep-upload">
      <div className="rep-upload-spec">
        <div style={{ minWidth: 0, flex: 1 }}>
          <p><b>Yêu cầu file danh sách</b></p>
          <p style={{ marginTop: 4 }}>Các cột <b>LoaiDong, HoTen, Email</b> bắt buộc, cột <b>Lop</b> không bắt buộc. LoaiDong: CA_NHAN hoặc DIEM_XEM_CHUNG. Điểm xem chung dùng email người phụ trách, không liệt kê tất cả người xem. File .xlsx hoặc .csv, tối đa 2 MB và {ROSTER_MAX_ROWS} dòng lời mời.</p>
        </div>
        <button type="button" className={repButton('secondary', 'sm')} onClick={() => downloadBytes(TEMPLATE_FILE_NAME, rosterTemplateBytes())}>
          <Download size={16} aria-hidden="true" />Tải file Excel mẫu
        </button>
      </div>

      {accepted && phase.kind !== 'valid' && (
        <div className="rep-file-box is-ok" role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="rep-file-head">
            <CheckCircle2 size={20} aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <p className="rep-file-name">{accepted.fileName}</p>
              <p className="rep-file-note">Đã xác nhận {accepted.rows.length} dòng lời mời{accepted.withClass ? `, ${accepted.withClass} dòng có lớp` : ''}. Danh sách này sẽ được gửi.</p>
            </div>
          </div>
          <button type="button" className={repButton('secondary', 'sm')} onClick={pick}>Chọn file khác</button>
        </div>
      )}

      {/* The drop zone is a hoop: the file is read once it lands in the basket. */}
      <HoopDrop
        onFile={(file) => { void read(file) }}
        inputRef={inputRef}
        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        inputLabel="Chọn file Excel danh sách lời mời"
        validating={phase.kind === 'validating' ? phase.fileName : null}
        hasList={Boolean(accepted)}
      />

      {error && phase.kind === 'idle' && <p className="rep-gate-reason" style={{ color: 'var(--rep-bad)' }} role="alert">{error}</p>}

      {phase.kind === 'invalid' && (
        <div className="rep-file-box is-bad" role="alert">
          <div className="rep-file-head">
            <CircleAlert size={20} aria-hidden="true" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="rep-file-name">File {phase.result.fileName} chưa hợp lệ</p>
              <p className="rep-file-note">
                Chưa có dòng lời mời nào được nhập{keptLabel ? `; vẫn giữ ${keptLabel}` : ''}. Sửa {phase.result.issues.length > 1 ? `${phase.result.issues.length} lỗi` : 'lỗi'} dưới đây rồi chọn lại file.
              </p>
            </div>
          </div>
          <div className="rep-table-wrap max-h-64" style={{ marginTop: 16, background: 'var(--rep-surface)' }}>
            <table className="rep-table" style={{ minWidth: 420 }} aria-label="Lỗi trong file">
              <thead><tr><th scope="col" style={{ width: 80 }}>Dòng</th><th scope="col" style={{ width: 96 }}>Cột</th><th scope="col">Lỗi</th></tr></thead>
              <tbody>
                {phase.result.issues.map((issue, i) => (
                  <tr key={i} style={{ '--i': i } as React.CSSProperties}>
                    <td className="num">{issue.row ?? '-'}</td>
                    <td style={{ fontWeight: 650 }}>{issue.column ?? 'Cả file'}</td>
                    <td>{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rep-file-actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className={repButton('secondary')} onClick={pick}>Chọn file khác</button>
            <button type="button" className={repButton('ghost')} onClick={() => setPhase({ kind: 'idle' })}>Đóng</button>
          </div>
        </div>
      )}

      {phase.kind === 'valid' && (
        <div className="rep-file-box is-ok">
          <div className="rep-file-head">
            <CheckCircle2 size={20} aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <p className="rep-file-name">{phase.result.fileName}</p>
              <p className="rep-file-note">File hợp lệ. Kiểm tra danh sách rồi xác nhận để dùng.</p>
            </div>
          </div>
          <dl className="rep-file-stats">
            {[
              ['Dòng hợp lệ', phase.result.rows.length],
              ['Dòng có lớp', phase.result.withClass],
              ['Dòng trống bỏ qua', phase.result.skippedBlank],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="num">{value}</dd>
              </div>
            ))}
          </dl>
          <div style={{ marginTop: 16 }}><RosterPreview rows={phase.result.rows} label="Xem trước danh sách" maxHeight="max-h-[300px]" /></div>
          {keptCount > 0 && (
            <p className="rep-file-warn">Xác nhận sẽ thay toàn bộ {keptCount} dòng lời mời đang có bằng {phase.result.rows.length} dòng lời mời trong file này. Không ghép hai danh sách.</p>
          )}
          <div className="rep-file-actions">
            <button type="button" className={repButton('secondary')} onClick={pick}>Chọn file khác</button>
            <button
              type="button"
              className={repButton('dark')}
              onClick={() => {
                onAccept(phase.result)
                setPhase({ kind: 'idle' })
              }}
            >
              Xác nhận sử dụng danh sách này
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
