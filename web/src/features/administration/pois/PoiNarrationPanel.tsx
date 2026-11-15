import { useEffect, useRef, useState } from 'react'
import { Check, FilePlus2, Square, Trash2, Volume2 } from 'lucide-react'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { Notice } from '../AdminUi'
import { ToneBadge } from '../../technical/TechnicalUi'
import { useAuthStore } from '../../../stores/auth-store'
import type { PoiNarrationRevision, PoiNarrationState, PoiProposal } from '../../technical/api/technical'
import { useApprovePoiNarration, useDiscardPoiNarration, usePoiNarrations, useSavePoiNarrationDraft } from '../../technical/technical-hooks'
import { errorText, narrationErrorText } from '../../technical/technical-format'
import { narrationStatus } from '../../technical/poi-labels'
import { campusShortStamp } from '../tours/tour-calendar'
import { canPreviewNarration, previewNarration } from '../../student/use-narration-voice'

const MAX_TEXT = 4000
const card = 'ct-panel min-w-0 rounded-[15px] bg-white shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]'
const stateLabel: Record<PoiNarrationState, string> = { DRAFT: 'Bản nháp', APPROVED: 'Đang dùng', SUPERSEDED: 'Đã thay thế', DISCARDED: 'Đã bỏ' }

type Edit = { text: string; video: string }

/**
 * A POI's narration, separate from its navigation revisions (ADR-0060): the approved version routes use, the one
 * draft being written, and a short history. A second Staff approves; the button is locked for the draft's last
 * editor, and the server stays the gate for that rule and for stale versions.
 */
export function PoiNarrationPanel({ proposal }: { proposal: PoiProposal }) {
  const versions = usePoiNarrations(proposal.id)
  const userId = useAuthStore(state => state.user?.userId)
  const save = useSavePoiNarrationDraft()
  const approve = useApprovePoiNarration()
  const discard = useDiscardPoiNarration()
  const [edit, setEdit] = useState<Edit | null>(null)
  const [composing, setComposing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'approve' | 'discard' | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const stopPreview = useRef<(() => void) | null>(null)
  useEffect(() => () => stopPreview.current?.(), [])

  const list = versions.data ?? []
  const approved = list.find(item => item.state === 'APPROVED') ?? null
  const draft = list.find(item => item.state === 'DRAFT') ?? null
  const readOnly = Boolean(proposal.discardedAt)
  const status = narrationStatus(proposal.narration)
  // The form shows the draft, or the approved text copied into a new version, or an empty first draft.
  const base: Edit = draft ? { text: draft.narrationText, video: draft.fallbackVideoUrl ?? '' }
    : composing && approved ? { text: approved.narrationText, video: approved.fallbackVideoUrl ?? '' }
    : { text: '', video: '' }
  const value = edit ?? base
  const editorOpen = !readOnly && (Boolean(draft) || composing || !approved)
  const changed = value.text.trim() !== base.text.trim() || value.video.trim() !== base.video.trim()
  const videoProblem = value.video.trim() && !/^https:\/\/\S+$/i.test(value.video.trim()) ? 'Video dự phòng phải là đường dẫn HTTPS.' : null
  // A new version needs no change: copying the approved text and saving is how wording gets reworked.
  const canSave = !save.isPending && Boolean(value.text.trim()) && !videoProblem && (draft ? changed : true)
  const selfLastEditor = Boolean(draft && userId && draft.lastEditedByUserId === userId)
  const busy = save.isPending || approve.isPending || discard.isPending

  const fail = (cause: unknown) => setError(narrationErrorText(cause).text)
  const reset = () => { setEdit(null); setComposing(false); setError(null) }

  const saveDraft = () => {
    if (!canSave) return
    setError(null)
    save.mutate({ proposalId: proposal.id, expectedRowVersion: draft?.rowVersion, narrationText: value.text.trim(), fallbackVideoUrl: value.video.trim() || null },
      { onSuccess: reset, onError: fail })
  }
  const decide = (kind: 'approve' | 'discard', target: PoiNarrationRevision) => {
    const ref = { proposalId: proposal.id, revisionNumber: target.revisionNumber, expectedRowVersion: target.rowVersion }
    const done = { onSuccess: () => { setConfirm(null); reset() }, onError: (cause: unknown) => { setConfirm(null); fail(cause) } }
    if (kind === 'approve') approve.mutate(ref, done)
    else discard.mutate(ref, done)
  }
  const preview = (text: string) => {
    if (previewing) { stopPreview.current?.(); return }
    setPreviewing(true)
    stopPreview.current = previewNarration(text, () => { stopPreview.current = null; setPreviewing(false) })
  }
  const listenButton = (text: string) => canPreviewNarration() && (
    <button type="button" className={buttonClass('secondary', 'sm')} disabled={!text.trim()} onClick={() => preview(text)} aria-label={previewing ? 'Dừng đọc thuyết minh' : 'Nghe thử thuyết minh'}>
      {previewing ? <Square size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}{previewing ? 'Dừng đọc' : 'Nghe thử'}
    </button>
  )

  return <section className={`${card} mt-4 p-5`} aria-label="Thuyết minh">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-bold text-[#2d3748]">Thuyết minh</h2>
      <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
    </div>
    <p className="mt-1 text-sm text-[#718096]">Trang học sinh đọc bản đã duyệt khi robot dừng tại điểm. Sửa thuyết minh không tạo phiên bản POI mới và không cần kiểm chứng lại. Mỗi bản nháp cần một Staff khác duyệt.</p>

    {versions.isPending ? <p className="mt-3 text-sm text-[#718096]">Đang tải thuyết minh…</p>
      : versions.isError ? <div className="mt-3"><Notice tone="danger" action={<button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void versions.refetch()}>Thử lại</button>}>Không tải được thuyết minh. {errorText(versions.error)}</Notice></div>
      : <>
        {error && <div className="mt-3"><Notice tone="danger">{error}</Notice></div>}

        {approved && <div className="mt-4 rounded-xl border border-[#e2e8f0] p-4" role="group" aria-label="Bản đã duyệt">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#2d3748]">Bản đã duyệt · phiên bản {approved.revisionNumber}</h3>
            <span className="text-xs text-[#64748b]">Duyệt bởi {approved.approvedByName} lúc {approved.approvedAt ? campusShortStamp(approved.approvedAt) : '-'}</span>
          </div>
          <p className="mt-2 text-sm whitespace-pre-wrap text-[#2d3748]">{approved.narrationText}</p>
          {approved.fallbackVideoUrl && <p className="mt-2 text-xs break-all text-[#64748b]">Video dự phòng: {approved.fallbackVideoUrl}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {listenButton(approved.narrationText)}
            {!draft && !composing && !readOnly && <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => { setComposing(true); setEdit(null); setError(null) }}><FilePlus2 size={14} aria-hidden="true" />Soạn phiên bản mới</button>}
          </div>
        </div>}

        {readOnly && !approved && <p className="mt-3 text-sm text-[#718096]">POI đã bị xoá khỏi danh sách; thuyết minh chỉ để xem.</p>}

        {editorOpen && <div className="mt-4 rounded-xl border border-[#e2e8f0] p-4" role="group" aria-label="Bản nháp">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#2d3748]">{draft ? `Bản nháp · phiên bản ${draft.revisionNumber}` : approved ? 'Phiên bản mới' : 'Bản nháp đầu tiên'}</h3>
            {draft && <span className="text-xs text-[#64748b]">Sửa lần cuối bởi {draft.lastEditedByName} lúc {campusShortStamp(draft.lastEditedAt)}</span>}
          </div>
          <label className="mt-2 block text-sm font-medium text-[#2d3748]" htmlFor="narration-text">Nội dung thuyết minh</label>
          <textarea id="narration-text" className={`${inputClass} mt-1.5`} rows={5} maxLength={MAX_TEXT} value={value.text}
            onChange={event => { setEdit({ ...value, text: event.target.value }); setError(null) }} placeholder="Nhập nội dung giới thiệu tại điểm này…" />
          <p className="mt-1 text-right text-xs text-[#718096] tabular-nums">{value.text.length}/{MAX_TEXT}</p>
          <label className="block text-sm font-medium text-[#2d3748]" htmlFor="narration-video">Video dự phòng HTTPS <span className="font-normal text-[#718096]">(không bắt buộc)</span></label>
          <input id="narration-video" type="url" className={`${inputClass} mt-1.5`} maxLength={2048} value={value.video} aria-invalid={Boolean(videoProblem)}
            onChange={event => { setEdit({ ...value, video: event.target.value }); setError(null) }} placeholder="https://…" />
          {videoProblem && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{videoProblem}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={buttonClass('secondary', 'sm')} disabled={!canSave} onClick={saveDraft} aria-label="Lưu nháp thuyết minh">{save.isPending ? 'Đang lưu…' : 'Lưu nháp'}</button>
            {draft && <button type="button" className={buttonClass('ghost', 'sm')} disabled={busy} onClick={() => setConfirm('discard')} aria-label="Bỏ nháp thuyết minh"><Trash2 size={14} aria-hidden="true" />Bỏ nháp</button>}
            {!draft && composing && <button type="button" className={buttonClass('ghost', 'sm')} disabled={busy} onClick={reset}>Hủy</button>}
            {listenButton(value.text)}
            {draft && <button type="button" className={buttonClass('primary', 'sm')} disabled={busy || selfLastEditor || changed}
              aria-describedby={selfLastEditor ? 'narration-self' : changed ? 'narration-unsaved' : undefined} aria-label="Duyệt thuyết minh" onClick={() => setConfirm('approve')}><Check size={14} aria-hidden="true" />Duyệt</button>}
          </div>
          {draft && selfLastEditor && <p id="narration-self" className="mt-2 text-xs text-[#7d5310]">Bạn là người sửa bản này lần cuối. Cần một Staff khác duyệt.</p>}
          {draft && !selfLastEditor && changed && <p id="narration-unsaved" className="mt-2 text-xs text-[#718096]">Lưu nháp trước khi duyệt.</p>}
          {!draft && <p className="mt-2 text-xs text-[#718096]">Lưu nháp rồi nhờ một Staff khác duyệt. Chỉ bản đã duyệt mới dùng được khi lưu tuyến.</p>}
        </div>}

        {list.length > 0 && <div className="mt-4 border-t border-[#e2e8f0] pt-3">
          <h3 className="text-sm font-semibold text-[#2d3748]">Lịch sử thuyết minh</h3>
          <ol className="mt-2 space-y-1.5">{list.map(item => <li key={item.id} className="text-sm text-[#2d3748]">
            Phiên bản {item.revisionNumber} · {stateLabel[item.state]} · sửa cuối {item.lastEditedByName}{item.approvedByName ? ` · duyệt ${item.approvedByName}` : ''}
          </li>)}</ol>
        </div>}
      </>}

    {draft && <ConfirmationDialog open={confirm === 'approve'} title={`Duyệt thuyết minh phiên bản ${draft.revisionNumber}`} withReason={false} confirmLabel="Duyệt" busyLabel="Đang duyệt…" busy={approve.isPending}
      description="Tuyến lưu từ bây giờ sẽ dùng nội dung này. Tuyến và Tour đã có vẫn giữ nội dung cũ."
      onConfirm={() => decide('approve', draft)} onCancel={() => setConfirm(null)}>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3 text-sm whitespace-pre-wrap text-[#2d3748]">{draft.narrationText}</div>
      {draft.fallbackVideoUrl && <p className="mt-2 text-xs break-all text-[#64748b]">Video dự phòng: {draft.fallbackVideoUrl}</p>}
    </ConfirmationDialog>}
    {draft && <ConfirmationDialog open={confirm === 'discard'} tone="danger" title="Bỏ bản nháp thuyết minh" withReason={false} confirmLabel="Bỏ nháp" busyLabel="Đang bỏ…" busy={discard.isPending}
      description={approved ? 'Bản đã duyệt vẫn được dùng. Bản nháp này được giữ trong lịch sử.' : 'POI sẽ chưa có thuyết minh. Bản nháp này được giữ trong lịch sử.'}
      onConfirm={() => decide('discard', draft)} onCancel={() => setConfirm(null)} />}
  </section>
}
