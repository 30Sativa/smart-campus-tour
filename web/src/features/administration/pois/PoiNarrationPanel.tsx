import { useEffect, useRef, useState } from 'react'
import { Check, FilePlus2, Square, Trash2, Volume2 } from 'lucide-react'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog'
import { Notice } from '../AdminUi'
import { useAuthStore } from '../../../stores/auth-store'
import type { PoiNarrationRevision, PoiProposal } from '../../technical/api/technical'
import { useApprovePoiNarration, useDiscardPoiNarration, usePoiNarrations, useSavePoiNarrationDraft } from '../../technical/technical-hooks'
import { errorText, narrationErrorText } from '../../technical/technical-format'
import { campusShortStamp } from '../tours/tour-calendar'
import { canPreviewNarration, previewNarration } from '../../student/use-narration-voice'
import { narrationDiff } from './narration-diff'

const MAX_TEXT = 4000
const card = 'ct-panel min-w-0 rounded-[15px] bg-white shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]'

type Edit = { text: string; video: string }

/**
 * A POI's narration, separate from its navigation revisions (ADR-0060), in three parts that never share a button row:
 * the version in use (read-only), the version being written (its own save and discard), and a separate approval box
 * for a saved draft. A second Staff approves; the box gives the draft's last editor no button, and the server stays the
 * gate for that rule and for stale versions. The screen says "bản đang soạn" for the API's DRAFT state.
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
  const [previewing, setPreviewing] = useState<string | null>(null)
  const stopPreview = useRef<(() => void) | null>(null)
  useEffect(() => () => stopPreview.current?.(), [])

  const list = versions.data ?? []
  const approved = list.find(item => item.state === 'APPROVED') ?? null
  const draft = list.find(item => item.state === 'DRAFT') ?? null
  // A discarded or retired POI (ADR-0051, ADR-0062) takes no narration write; the server refuses one too.
  const readOnly = Boolean(proposal.discardedAt || proposal.retiredAt)
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
  const listenButton = (text: string, key: string) => {
    if (!canPreviewNarration()) return null
    const playing = previewing === key
    return <button type="button" className={buttonClass('secondary', 'sm')} disabled={!text.trim()} aria-label={playing ? 'Dừng đọc thuyết minh' : 'Nghe thử thuyết minh'}
      onClick={() => {
        if (previewing) { stopPreview.current?.(); if (playing) return }
        setPreviewing(key)
        stopPreview.current = previewNarration(text, () => { stopPreview.current = null; setPreviewing(null) })
      }}>
      {playing ? <Square size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}{playing ? 'Dừng đọc' : 'Nghe thử'}
    </button>
  }

  return <section className={`${card} p-5`} aria-label="Thuyết minh">
    <h2 className="text-lg font-bold text-[#2d3748]">Thuyết minh</h2>
    <p className="mt-1 text-sm text-[#718096]">Lời guide đọc cho học sinh khi robot dừng tại điểm. Sửa thuyết minh không tạo phiên bản POI mới và không cần kiểm chứng lại. Mỗi bản đang soạn cần một Staff khác duyệt trước khi dùng.</p>

    {versions.isPending ? <p className="mt-3 text-sm text-[#718096]">Đang tải thuyết minh…</p>
      : versions.isError ? <div className="mt-3"><Notice tone="danger" action={<button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void versions.refetch()}>Thử lại</button>}>Không tải được thuyết minh. {errorText(versions.error)}</Notice></div>
      : <>
        {error && <div className="mt-3"><Notice tone="danger">{error}</Notice></div>}
        {readOnly && <p className="mt-3 text-sm text-[#718096]">{proposal.retiredAt ? 'POI đã ngưng dùng; thuyết minh chỉ để xem. Dùng lại POI để sửa hoặc duyệt thuyết minh.' : 'POI đã bị xoá khỏi danh sách; thuyết minh chỉ để xem.'}</p>}

        {approved && <div className="mt-4 rounded-xl border border-[#cfe0f5] bg-[#f7faff] p-4" role="group" aria-label="Đang dùng">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#2d3748]">Đang dùng · phiên bản {approved.revisionNumber}</h3>
            <span className="text-xs text-[#64748b]">Duyệt bởi {approved.approvedByName} lúc {approved.approvedAt ? campusShortStamp(approved.approvedAt) : '-'}</span>
          </div>
          <p className="mt-2 text-sm whitespace-pre-wrap text-[#2d3748]">{approved.narrationText}</p>
          {approved.fallbackVideoUrl && <p className="mt-2 text-xs break-all text-[#64748b]">Video dự phòng: {approved.fallbackVideoUrl}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {listenButton(approved.narrationText, 'approved')}
            {!draft && !composing && !readOnly && <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => { setComposing(true); setEdit(null); setError(null) }}><FilePlus2 size={14} aria-hidden="true" />Soạn phiên bản mới</button>}
          </div>
        </div>}
        {!approved && !editorOpen && <p className="mt-3 text-sm text-[#718096]">Chưa có thuyết minh.</p>}

        {editorOpen && <div className="mt-4 rounded-xl border border-[#e2e8f0]" role="group" aria-label="Bản đang soạn">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
            <h3 className="text-sm font-semibold text-[#2d3748]">{draft ? `Bản đang soạn · phiên bản ${draft.revisionNumber}` : approved ? 'Bản đang soạn mới' : 'Bản đang soạn đầu tiên'}</h3>
            {draft && <span className="text-xs text-[#64748b]">Sửa lần cuối bởi {draft.lastEditedByName} lúc {campusShortStamp(draft.lastEditedAt)}</span>}
          </div>
          <div className="px-4 pb-4">
            <label className="mt-2 block text-sm font-medium text-[#2d3748]" htmlFor="narration-text">Nội dung thuyết minh</label>
            <textarea id="narration-text" className={`${inputClass} mt-1.5`} rows={5} maxLength={MAX_TEXT} value={value.text}
              onChange={event => { setEdit({ ...value, text: event.target.value }); setError(null) }} placeholder="Nhập nội dung giới thiệu tại điểm này…" />
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              {listenButton(value.text, 'editor')}
              <span className="ml-auto text-xs text-[#718096] tabular-nums">{value.text.length}/{MAX_TEXT}</span>
            </div>
            <details className="mt-3 rounded-lg border border-[#eef2f6] px-3 py-2" open={Boolean(value.video) || undefined}>
              <summary className="cursor-pointer text-sm font-medium text-[#475569]">Tùy chọn</summary>
              <label className="mt-2 block text-sm font-medium text-[#2d3748]" htmlFor="narration-video">Video dự phòng HTTPS <span className="font-normal text-[#718096]">(không bắt buộc)</span></label>
              <input id="narration-video" type="url" className={`${inputClass} mt-1.5`} maxLength={2048} value={value.video} aria-invalid={Boolean(videoProblem)}
                onChange={event => { setEdit({ ...value, video: event.target.value }); setError(null) }} placeholder="https://…" />
              {videoProblem && <p role="alert" className="mt-1 text-xs text-[#b23e18]">{videoProblem}</p>}
            </details>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#eef2f6] bg-[#fafbfc] px-4 py-3">
            <button type="button" className={buttonClass('primary', 'sm')} disabled={!canSave} onClick={saveDraft}>{save.isPending ? 'Đang lưu…' : 'Lưu bản đang soạn'}</button>
            {draft && <button type="button" className={buttonClass('ghost', 'sm')} disabled={busy} onClick={() => setConfirm('discard')}><Trash2 size={14} aria-hidden="true" />Bỏ bản này</button>}
            {!draft && composing && <button type="button" className={buttonClass('ghost', 'sm')} disabled={busy} onClick={reset}>Hủy</button>}
            {!draft && <span className="text-xs text-[#718096]">Lưu xong, một Staff khác duyệt. Chỉ bản đã duyệt mới dùng được khi lưu tuyến.</span>}
          </div>
        </div>}

        {draft && !readOnly && <ApprovalBox draft={draft} approved={approved} selfLastEditor={selfLastEditor} unsaved={changed} busy={busy} onApprove={() => setConfirm('approve')} />}
      </>}

    {draft && <ConfirmationDialog open={confirm === 'approve'} title={`Duyệt thuyết minh phiên bản ${draft.revisionNumber}`} withReason={false} confirmLabel="Duyệt" busyLabel="Đang duyệt…" busy={approve.isPending}
      description="Tuyến lưu từ bây giờ sẽ dùng nội dung này. Tuyến và Tour đã có vẫn giữ nội dung cũ."
      onConfirm={() => decide('approve', draft)} onCancel={() => setConfirm(null)}>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3 text-sm whitespace-pre-wrap text-[#2d3748]">{draft.narrationText}</div>
      {draft.fallbackVideoUrl && <p className="mt-2 text-xs break-all text-[#64748b]">Video dự phòng: {draft.fallbackVideoUrl}</p>}
    </ConfirmationDialog>}
    {draft && <ConfirmationDialog open={confirm === 'discard'} tone="danger" title="Bỏ bản đang soạn" withReason={false} confirmLabel="Bỏ bản này" busyLabel="Đang bỏ…" busy={discard.isPending}
      description={approved ? 'Bản đang dùng vẫn được dùng. Bản đang soạn này được giữ trong lịch sử.' : 'POI sẽ chưa có thuyết minh. Bản đang soạn này được giữ trong lịch sử.'}
      onConfirm={() => decide('discard', draft)} onCancel={() => setConfirm(null)} />}
  </section>
}

/** Approval of the saved draft, apart from the writer's buttons. The last editor sees why there is no button. */
function ApprovalBox({ draft, approved, selfLastEditor, unsaved, busy, onApprove }: {
  draft: PoiNarrationRevision; approved: PoiNarrationRevision | null; selfLastEditor: boolean; unsaved: boolean; busy: boolean; onApprove: () => void
}) {
  return <div className="mt-4 rounded-xl border border-[#f1dcb0] bg-[#fffaf0] p-4" role="group" aria-label="Duyệt">
    <h3 className="text-sm font-semibold text-[#2d3748]">Duyệt</h3>
    {selfLastEditor
      ? <p className="mt-1 text-sm text-[#7d5310]">Bạn sửa bản này lần cuối. Chờ một Staff khác duyệt.</p>
      : <>
        <p className="mt-1 text-xs text-[#718096]">{approved ? `So với bản đang dùng (phiên bản ${approved.revisionNumber}): phần thêm tô xanh, phần bỏ gạch đỏ.` : 'Chưa có bản đang dùng; toàn bộ nội dung là phần thêm.'}</p>
        <p aria-label="Phần chữ đã đổi" className="mt-2 rounded-lg border border-[#eef2f6] bg-white p-3 text-sm whitespace-pre-wrap text-[#2d3748]">
          {narrationDiff(approved?.narrationText ?? '', draft.narrationText).map((part, index) => part.kind === 'added'
            ? <ins key={index} className="rounded bg-[#dcfce7] text-[#166534] no-underline">{part.text}</ins>
            : part.kind === 'removed' ? <del key={index} className="rounded bg-[#fde2e1] text-[#a4473d]">{part.text}</del>
            : <span key={index}>{part.text}</span>)}
        </p>
        {(approved?.fallbackVideoUrl ?? null) !== draft.fallbackVideoUrl && <p className="mt-2 text-xs break-all text-[#64748b]">Video dự phòng đổi thành: {draft.fallbackVideoUrl ?? 'không có'}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={buttonClass('primary', 'sm')} disabled={busy || unsaved} aria-describedby={unsaved ? 'narration-unsaved' : undefined} onClick={onApprove}>
            <Check size={14} aria-hidden="true" />Duyệt phiên bản {draft.revisionNumber}</button>
          {unsaved && <span id="narration-unsaved" className="text-xs text-[#718096]">Lưu bản đang soạn trước khi duyệt.</span>}
        </div>
      </>}
  </div>
}
