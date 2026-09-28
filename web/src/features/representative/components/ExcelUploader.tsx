import { useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { buttonClass } from '../../staff/ui-classes'
import { ROSTER_MAX_ROWS, TEMPLATE_FILE_NAME, downloadBytes, importRosterFile, rosterTemplateBytes } from '../roster-import'
import type { ImportResult } from '../roster-import'
import { RosterPreview } from './RosterPreview'
import { Spinner } from './RepUi'

export type AcceptedRoster = Extract<ImportResult, { ok: true }>

type Phase =
  | { kind: 'idle' }
  | { kind: 'validating'; fileName: string }
  | { kind: 'invalid'; result: Extract<ImportResult, { ok: false }> }
  | { kind: 'valid'; result: AcceptedRoster }

/**
 * Excel roster upload (flow review §4.2, scope §3.3):
 *
 *   choose / drop a file → validating → invalid: every row / column / reason,
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
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const read = async (file: File | undefined) => {
    if (!file) return
    setPhase({ kind: 'validating', fileName: file.name })
    const result = await importRosterFile(file)
    setPhase(result.ok ? { kind: 'valid', result } : { kind: 'invalid', result })
  }

  const pick = () => inputRef.current?.click()
  const keptCount = accepted?.rows.length ?? inUse?.count ?? 0
  const keptLabel = accepted ? `danh sách từ file ${accepted.fileName} (${accepted.rows.length} học sinh)` : inUse ? `danh sách hiện tại (${inUse.count} học sinh)` : null

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-[#e5e9f0] bg-[#f8fafc] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="text-sm leading-relaxed text-[#475569]">
          <p className="font-semibold text-[#0f172a]">Yêu cầu file danh sách</p>
          <p className="mt-1">Cột <b className="text-[#0f172a]">HoTen</b> bắt buộc, cột <b className="text-[#0f172a]">Lop</b> không bắt buộc. File .xlsx hoặc .csv, tối đa 2 MB và {ROSTER_MAX_ROWS} học sinh.</p>
        </div>
        <button type="button" className={`${buttonClass('secondary')} shrink-0`} onClick={() => downloadBytes(TEMPLATE_FILE_NAME, rosterTemplateBytes())}>
          <Download size={16} aria-hidden="true" />Tải file Excel mẫu
        </button>
      </div>

      {accepted && phase.kind !== 'valid' && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#cde9dc] bg-[#f2fbf6] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" role="status">
          <div className="flex min-w-0 items-start gap-3">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#1f7a55]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold break-all text-[#0f172a]">{accepted.fileName}</p>
              <p className="mt-0.5 text-sm text-[#475569]">Đã xác nhận {accepted.rows.length} học sinh{accepted.withClass ? `, ${accepted.withClass} dòng có lớp` : ''}. Danh sách này sẽ được gửi.</p>
            </div>
          </div>
          <button type="button" className={`${buttonClass('secondary', 'sm')} shrink-0`} onClick={pick}>Chọn file khác</button>
        </div>
      )}

      <div
        className={`rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors duration-150 ${over ? 'border-[#2563eb] bg-[#eff6ff]' : 'border-[#d5dde8] bg-white'} ${accepted && phase.kind === 'idle' ? 'py-6' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => { event.preventDefault(); setOver(false); void read(event.dataTransfer.files[0]) }}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          aria-label="Chọn file Excel danh sách học sinh"
          onChange={(event) => { void read(event.target.files?.[0]); event.target.value = '' }}
        />
        {phase.kind === 'validating' ? (
          <div className="flex flex-col items-center gap-3 text-[#334155]" role="status">
            <Spinner className="size-6 text-[#2563eb]" />
            <p className="font-medium">Đang kiểm tra <span className="break-all">{phase.fileName}</span>...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <span className="grid size-12 place-items-center rounded-full bg-[#eff6ff] text-[#2563eb]" aria-hidden="true"><Upload size={22} /></span>
            <p className="mt-3 text-[15px] font-semibold text-[#0f172a]">Kéo thả file Excel vào đây</p>
            <p className="mt-1 text-sm text-[#64748b]">hoặc</p>
            <button type="button" onClick={pick} className={`${buttonClass(accepted ? 'secondary' : 'primary')} mt-3`}>
              <FileSpreadsheet size={16} aria-hidden="true" />Chọn file Excel
            </button>
          </div>
        )}
      </div>

      {error && phase.kind === 'idle' && <p className="text-sm font-medium text-[#b23e31]" role="alert">{error}</p>}

      {phase.kind === 'invalid' && (
        <div className="rounded-2xl border border-[#f5c8c2] bg-[#fff5f3] p-4 sm:p-5" role="alert">
          <div className="flex items-start gap-3">
            <CircleAlert size={20} className="mt-0.5 shrink-0 text-[#b23e31]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[#0f172a]">File <span className="break-all">{phase.result.fileName}</span> chưa hợp lệ</p>
              <p className="mt-1 text-sm leading-relaxed text-[#475569]">
                Chưa có học sinh nào được nhập{keptLabel ? `; vẫn giữ ${keptLabel}` : ''}. Sửa {phase.result.issues.length > 1 ? `${phase.result.issues.length} lỗi` : 'lỗi'} dưới đây rồi chọn lại file.
              </p>
            </div>
          </div>
          <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-[#f1d5d0] bg-white">
            <table className="w-full min-w-[420px] text-left text-sm" aria-label="Lỗi trong file">
              <thead className="sticky top-0 bg-[#fffafa]"><tr className="text-xs text-[#64748b]"><th scope="col" className="w-20 px-4 py-2.5 font-medium">Dòng</th><th scope="col" className="w-24 px-4 py-2.5 font-medium">Cột</th><th scope="col" className="px-4 py-2.5 font-medium">Lỗi</th></tr></thead>
              <tbody className="divide-y divide-[#f8ebe8]">
                {phase.result.issues.map((issue, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 tabular-nums text-[#0f172a]">{issue.row ?? '-'}</td>
                    <td className="px-4 py-2.5 font-medium text-[#0f172a]">{issue.column ?? 'Cả file'}</td>
                    <td className="px-4 py-2.5 text-[#475569]">{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button type="button" className={buttonClass('secondary')} onClick={pick}>Chọn file khác</button>
            <button type="button" className={buttonClass('ghost')} onClick={() => setPhase({ kind: 'idle' })}>Đóng</button>
          </div>
        </div>
      )}

      {phase.kind === 'valid' && (
        <div className="rounded-2xl border border-[#cde9dc] bg-white p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#1f7a55]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold break-all text-[#0f172a]">{phase.result.fileName}</p>
              <p className="mt-0.5 text-sm text-[#475569]">File hợp lệ. Kiểm tra danh sách rồi xác nhận để dùng.</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {[
              ['Học sinh hợp lệ', phase.result.rows.length],
              ['Dòng có lớp', phase.result.withClass],
              ['Dòng trống bỏ qua', phase.result.skippedBlank],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-[#f8fafc] px-3 py-2.5">
                <dt className="text-xs text-[#64748b]">{label}</dt>
                <dd className="mt-0.5 text-xl font-bold text-[#0f172a] tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4"><RosterPreview rows={phase.result.rows} label="Xem trước danh sách" maxHeight="max-h-[300px]" /></div>
          {keptCount > 0 && (
            <p className="mt-4 rounded-xl bg-[#fffaeb] px-3.5 py-2.5 text-sm text-[#7d5310]">Xác nhận sẽ thay toàn bộ {keptCount} học sinh đang có bằng {phase.result.rows.length} học sinh trong file này. Không ghép hai danh sách.</p>
          )}
          <div className="mt-4 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button type="button" className={buttonClass('secondary')} onClick={pick}>Chọn file khác</button>
            <button
              type="button"
              className={buttonClass('primary')}
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
