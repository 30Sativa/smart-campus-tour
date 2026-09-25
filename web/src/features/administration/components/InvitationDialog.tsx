import { useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { ConfirmationDialog } from '../../staff/components/ConfirmationDialog'
import { buttonClass } from '../../staff/ui-classes'
import { formatSlot } from '../admin-format'
import { readAdminError } from '../admin-status'
import { useInvitationPreview, useSendInvitation } from '../admin-hooks'

/** Copy a value, saying so. The clipboard can be refused (permissions, http); then it says that instead. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setState('done')
    } catch {
      setState('failed')
    }
    window.setTimeout(() => setState('idle'), 2000)
  }
  return (
    <button type="button" onClick={copy} className={buttonClass('secondary', 'sm')} aria-live="polite">
      {state === 'done' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {state === 'done' ? 'Đã copy' : state === 'failed' ? 'Không copy được' : label}
    </button>
  )
}

/**
 * Preview and send the participation e-mail (scope §3.4, UC-04): one e-mail,
 * to the representative's stored address only. A failure leaves the
 * registration Approved and offers "Gửi lại"; nothing is rolled back.
 */
export function InvitationDialog({ registrationId, onClose }: { registrationId: string | null; onClose: () => void }) {
  const preview = useInvitationPreview(registrationId)
  const send = useSendInvitation()
  const failed = send.isError ? readAdminError(send.error, 'Không thể gửi email.') : null
  const data = preview.data

  const close = () => {
    send.reset()
    onClose()
  }

  return (
    <ConfirmationDialog
      open={Boolean(registrationId)}
      title="Gửi thông tin tham gia"
      description="Một email tới đại diện của đoàn. Đại diện tự chia sẻ đường dẫn và mã đoàn cho học sinh."
      confirmLabel={failed ? 'Gửi lại' : 'Gửi email'}
      busyLabel="Đang gửi…"
      withReason={false}
      busy={send.isPending || !data}
      error={failed ? `${failed.message} Đăng ký vẫn ở trạng thái Đã duyệt; bạn có thể gửi lại.` : preview.isError ? readAdminError(preview.error).message : null}
      onConfirm={() => registrationId && send.mutate(registrationId, { onSuccess: close })}
      onCancel={close}
    >
      {preview.isLoading && <div className="h-40 animate-pulse rounded-xl bg-[#efefe9]" aria-busy="true" aria-label="Đang tạo bản xem trước" />}
      {data && (
        <div className="space-y-3 rounded-xl border border-[#e3e3dc] bg-[#f7f7f3] p-4 text-sm">
          <dl className="grid gap-2">
            <Row label="Người nhận">{data.recipient}</Row>
            <Row label="Tiêu đề">{data.subject}</Row>
            <Row label="Tour">{data.tourName} · {formatSlot(data.scheduledAt)}</Row>
            <Row label="Đường dẫn"><span className="break-all">{data.joinLink}</span></Row>
            <Row label="Mã đoàn"><span className="font-mono tracking-wider">{data.groupCode}</span></Row>
          </dl>
          <ul className="list-disc space-y-1 pl-5 text-[13px] leading-5 text-[#4a4f59]">
            {data.instructions.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={data.joinLink} label="Copy link" />
            <CopyButton value={data.groupCode} label="Copy mã đoàn" />
          </div>
        </div>
      )}
    </ConfirmationDialog>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2">
      <dt className="text-xs font-bold text-[#6b6e75]">{label}</dt>
      <dd className="font-semibold text-[#1c1c1c]">{children}</dd>
    </div>
  )
}
