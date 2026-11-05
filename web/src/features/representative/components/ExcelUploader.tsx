import { useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, Download } from 'lucide-react'
import { repButton } from '../rep-classes'
import { ROSTER_MAX_ROWS, TEMPLATE_FILE_NAME, downloadBytes, importRosterFile, rosterTemplateBytes } from '../roster-import'
import type { ImportResult } from '../roster-import'
import type { RepresentativeRosterRow } from '../api/types'
import { matchRosterIdentities, rosterReplacement } from '../registration-roster'
import { RosterPreview } from '../../registrations/RosterPreview'
import { HoopDrop } from './HoopDrop'

export type AcceptedRoster = Extract<ImportResult, { ok: true }>
type Phase = { kind: 'idle' } | { kind: 'validating'; fileName: string } |
  { kind: 'invalid'; result: Extract<ImportResult, { ok: false }> } | { kind: 'valid'; result: AcceptedRoster }

export function ExcelUploader({ accepted, onAccept, inUse, error, existingRows = [], canAddRows = true }: {
  accepted: AcceptedRoster | null
  onAccept: (roster: AcceptedRoster) => void
  inUse?: { count: number } | null
  error?: string
  existingRows?: RepresentativeRosterRow[]
  canAddRows?: boolean
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [reviewedAccepted, setReviewedAccepted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const request = useRef(0)
  const read = async (file: File) => {
    const revision = ++request.current
    setReviewedAccepted(false)
    setPhase({ kind: 'validating', fileName: file.name })
    try {
      const result = await importRosterFile(file)
      if (revision === request.current) setPhase(result.ok ? { kind: 'valid', result } : { kind: 'invalid', result })
    } catch {
      if (revision === request.current) setPhase({ kind: 'invalid', result: { ok: false, fileName: file.name, issues: [{ row: null, column: null, message: 'Không đọc được tệp. Chọn lại tệp hoặc kiểm tra quyền truy cập trên máy tính.' }] } })
    }
  }
  const keptCount = accepted?.rows.length ?? inUse?.count ?? 0
  const replacement = phase.kind === 'valid' && existingRows.length
    ? rosterReplacement(existingRows, matchRosterIdentities(phase.result.rows, existingRows)) : null
  const additionBlocked = phase.kind === 'valid' && !canAddRows && (replacement ? replacement.added.length > 0 : phase.result.rows.length > 0)
  const blocked = additionBlocked || Boolean(replacement?.issues.length) || Boolean(replacement?.acceptedAffected && !reviewedAccepted)
  return <div className="rep-upload rep-stack">
    <div className="rep-upload-spec">
      <div><p><strong>Yêu cầu tệp danh sách</strong></p>
        <p className="rep-hint">Các cột LoaiDong, HoTen, Email bắt buộc; Lop không bắt buộc. LoaiDong nhận CA_NHAN hoặc DIEM_XEM_CHUNG. Điểm xem chung dùng email người phụ trách, không liệt kê tất cả người xem. Tệp .xlsx hoặc .csv, tối đa 2 MB và {ROSTER_MAX_ROWS} điểm xem.</p>
      </div>
      <button type="button" className={repButton('secondary', 'sm')} onClick={() => downloadBytes(TEMPLATE_FILE_NAME, rosterTemplateBytes())}><Download size={16} aria-hidden="true" />Tải file Excel mẫu</button>
    </div>
    {accepted && <div className="rep-file-box is-ok" role="status"><div className="rep-file-head"><CheckCircle2 size={20} aria-hidden="true" /><div>
      <p className="rep-file-name">{accepted.fileName}</p><p className="rep-file-note">Đã xác nhận {accepted.rows.length} dòng lời mời. Đây là danh sách đang được dùng trong bản nháp.</p>
    </div></div></div>}
    <HoopDrop onFile={file => { void read(file) }} inputRef={inputRef} accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
      inputLabel="Chọn file Excel danh sách lời mời" validating={phase.kind === 'validating' ? phase.fileName : null} hasList={keptCount > 0} />
    {error && <p className="rep-error-message" role="alert">{error}</p>}
    {phase.kind === 'invalid' && <div className="rep-file-box is-bad" role="alert">
      <div className="rep-file-head"><CircleAlert size={20} aria-hidden="true" /><div><p className="rep-file-name">File {phase.result.fileName} chưa hợp lệ</p>
        <p className="rep-file-note">Chưa nhập dòng nào từ tệp này.{keptCount > 0 ? ` Vẫn giữ ${keptCount} dòng đã xác nhận trước đó.` : ''} Sửa lỗi rồi chọn lại tệp.</p></div></div>
      <div className="rep-table-wrap"><table className="rep-table" aria-label="Lỗi trong file"><thead><tr><th scope="col">Dòng</th><th scope="col">Cột</th><th scope="col">Lỗi</th></tr></thead><tbody>
        {phase.result.issues.map((issue, index) => <tr key={index}><td data-label="Dòng" className="num">{issue.row ?? 'Toàn tệp'}</td><td data-label="Cột">{issue.column ?? 'Cả tệp'}</td><td data-label="Lỗi">{issue.message}</td></tr>)}
      </tbody></table></div>
      <button type="button" className={repButton('ghost')} onClick={() => setPhase({ kind: 'idle' })}>Đóng lỗi</button>
    </div>}
    {phase.kind === 'valid' && <div className="rep-stack">
      <div className="rep-file-head"><CheckCircle2 size={20} aria-hidden="true" /><div><p className="rep-file-name">{phase.result.fileName}</p><p className="rep-file-note">Tệp hợp lệ: {phase.result.rows.length} dòng lời mời, {phase.result.withClass} dòng có lớp, bỏ qua {phase.result.skippedBlank} dòng trống. Kiểm tra rồi xác nhận để dùng.</p></div></div>
      <RosterPreview rows={phase.result.rows} label="Xem trước danh sách" variant="representative" />
      {replacement && <section className="rep-diff" aria-label="Thay đổi danh sách">
        <h3>Thay đổi so với hồ sơ hiện tại</h3>
        <p>Giữ nguyên {replacement.unchanged.length} dòng, cập nhật {replacement.changed.length} dòng, thêm {replacement.added.length} dòng, loại {replacement.removed.length} dòng.</p>
        {replacement.changed.map(({ before, after }) => <div className="rep-diff-item" key={before.id}><strong>Cập nhật {before.displayName}</strong><p>{before.displayName} → {after.displayName}; lớp {before.className || 'không có'} → {after.className || 'không có'}. {before.rowNumber !== after.rowNumber ? 'Thay vị trí dòng trong tệp. ' : ''}Giữ định danh dòng và email {before.email}.</p></div>)}
        {replacement.added.map(row => <div className="rep-diff-item" key={row.email}><strong>Thêm {row.displayName}</strong><p>{row.email}. Dòng mới chờ Staff duyệt.</p></div>)}
        {replacement.removed.map(row => <div className="rep-diff-item" key={row.id ?? row.email}><strong>Loại {row.displayName}</strong><p>{row.email}. Lời mời bị thu hồi và phiên truy cập hiện có sẽ đóng khi lưu.</p></div>)}
        {replacement.issues.length > 0 && <ul className="rep-error-list" role="alert">{replacement.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
        {replacement.acceptedAffected && <label className="rep-consent"><input type="checkbox" checked={reviewedAccepted} onChange={event => setReviewedAccepted(event.target.checked)} />Tôi đã kiểm tra thay đổi trên dòng đã chấp nhận và hiểu việc loại dòng sẽ thu hồi quyền truy cập của dòng đó.</label>}
      </section>}
      {additionBlocked && <p className="rep-error-message" role="alert">Đã qua hạn thêm điểm xem mới 48 giờ trước giờ bắt đầu. Bạn vẫn có thể cập nhật hoặc loại dòng hiện tại theo quyền của hồ sơ.</p>}
      {keptCount > 0 && <p className="rep-file-warn">Xác nhận thay toàn bộ danh sách trong bản nháp; không ghép hai tệp. Dòng khớp email giữ định danh và quyền truy cập hiện tại. Thay đổi chỉ được gửi khi lưu đăng ký.</p>}
      <div className="rep-file-actions"><button type="button" className={repButton('secondary')} onClick={() => setPhase({ kind: 'idle' })}>Bỏ tệp vừa chọn</button>
        <button type="button" className={repButton('dark')} disabled={blocked} onClick={() => { onAccept(phase.result); setPhase({ kind: 'idle' }) }}>Xác nhận sử dụng danh sách này</button>
      </div>
    </div>}
  </div>
}
