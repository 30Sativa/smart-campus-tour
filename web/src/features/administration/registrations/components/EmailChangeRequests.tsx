import { ConfirmationDialog } from '../../../../components/ui/ConfirmationDialog'
import { Field } from '../../../../components/ui/ConsolePrimitives'
import { notify } from '../../../../components/ui/toast-store'
import { buttonClass } from '../../../../components/ui/ui-classes'
import { useNow } from '../../../staff/use-now'
import { Notice } from '../../AdminUi'
import { reviewError } from '../errors'
import { useEmailChangeDecision, useStaffEmailChanges } from '../hooks'
import { expiryLabel, reviewTime } from '../presentation'
import type { ReviewRosterRow, StaffEmailChange } from '../types'

/** Holds the request itself: a decision takes it off the list while the dialog is still open. `requestId` stays the same across retries. */
export type EmailChangeReview = { action: 'accept' | 'reject'; request: StaffEmailChange; requestId: string }

/** The registration's email-change requests still waiting on Staff. Renders nothing when there are none. */
export function EmailChangeRequests({ registrationId, roster, senderName, disabled, onReview }: {
  registrationId: string; roster: ReviewRosterRow[]; senderName: string; disabled: boolean; onReview: (review: EmailChangeReview) => void
}) {
  const query = useStaffEmailChanges()
  const now = useNow(30_000)
  if (query.isError) return <Notice tone="danger" action={<button className={buttonClass('secondary', 'sm')} onClick={() => void query.refetch()}>Thử lại</button>}>Không tải được yêu cầu đổi email.</Notice>
  const requests = (query.data ?? []).filter(item => item.registrationId === registrationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (requests.length === 0) return null
  const review = (action: EmailChangeReview['action'], request: StaffEmailChange) => onReview({ action, request, requestId: crypto.randomUUID() })
  return <section className="rounded-xl border border-[#e2e8f0] p-4" aria-label="Yêu cầu đổi email chờ duyệt">
    <h3 className="text-[15px] font-semibold text-[#0f172a]">Yêu cầu đổi email chờ duyệt ({requests.length})</h3>
    <ul className="mt-2 divide-y divide-[#f1f5f9]">{requests.map(request => {
      const name = roster.find(row => row.id === request.rowId)?.displayName
      const expiry = expiryLabel(request.expiresAt, now)
      return <li key={request.id} className="space-y-2 py-3 text-sm">
        <p className="font-medium text-[#0f172a]">Dòng {request.rowNumber}{name ? `: ${name}` : ''}</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Email hiện tại"><span className="break-all">{request.currentEmail}</span></Field>
          <Field label="Email mới"><span className="break-all">{request.proposedEmail}</span></Field>
        </dl>
        <p className="text-xs text-[#64748b]">Gửi bởi {senderName} lúc {reviewTime(request.createdAt)}</p>
        {expiry && <p className="text-xs font-medium text-[#92400e]">{expiry}</p>}
        {request.canReview
          ? <div className="flex gap-2">
            <button type="button" className={buttonClass('primary', 'sm')} disabled={disabled} onClick={() => review('accept', request)}>Duyệt <span className="sr-only">đổi email dòng {request.rowNumber}</span></button>
            <button type="button" className={buttonClass('danger', 'sm')} disabled={disabled} onClick={() => review('reject', request)}>Từ chối <span className="sr-only">đổi email dòng {request.rowNumber}</span></button>
          </div>
          : <p className="text-xs text-slate-500">Tour không mở xét duyệt.</p>}
      </li>
    })}</ul>
  </section>
}

/** Sits beside the Drawer, not inside it, so it stacks above it. A refusal stays in the dialog; a 409 means these versions are spent, so the dialog cannot resend them. */
export function EmailChangeDialog({ review, onClose, onDecided }: { review: EmailChangeReview; onClose: () => void; onDecided: () => void }) {
  const mutation = useEmailChangeDecision()
  const { action, request, requestId } = review
  const reject = action === 'reject'
  const failure = mutation.isError ? reviewError(mutation.error) : null
  const decide = async (reason: string) => {
    try {
      await mutation.mutateAsync({ id: request.id, decision: action, input: {
        requestId, expectedRequestRowVersion: request.rowVersion, expectedTourRowVersion: request.tourRowVersion,
        expectedRegistrationRowVersion: request.registrationRowVersion, expectedRowVersion: request.rosterRowVersion,
        ...(reject ? { reason } : {}),
      } })
    } catch { return /* The dialog shows the refusal and keeps the reason. */ }
    onClose()
    onDecided()
    notify(reject ? { tone: 'info', title: 'Đã từ chối yêu cầu đổi email', detail: `Dòng ${request.rowNumber} giữ email ${request.currentEmail}.` }
      : { title: 'Đã duyệt yêu cầu đổi email', detail: `Dòng ${request.rowNumber} chuyển sang ${request.proposedEmail}.` })
  }
  return <ConfirmationDialog open title={`${reject ? 'Từ chối' : 'Duyệt'} yêu cầu đổi email dòng ${request.rowNumber}?`}
    description={reject ? `Dòng này giữ nguyên email ${request.currentEmail}. Đại diện sẽ thấy lý do.`
      : `Email của dòng đổi từ ${request.currentEmail} sang ${request.proposedEmail}. Nếu dòng đã có lời mời, mã cũ hết hiệu lực và email mới nhận mã mới.`}
    confirmLabel={reject ? 'Từ chối' : 'Duyệt'} busyLabel="Đang lưu…" tone={reject ? 'danger' : 'default'}
    withReason={reject} requireReason reasonLabel="Lý do từ chối" reasonPlaceholder="Nêu lý do để đại diện biết cần làm gì."
    busy={mutation.isPending} confirmDisabled={failure?.reload} error={failure?.message}
    onConfirm={reason => void decide(reason)} onCancel={() => { if (!mutation.isPending) onClose() }} />
}
