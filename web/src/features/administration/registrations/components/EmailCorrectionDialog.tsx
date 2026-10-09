import { useState } from 'react'
import { ConfirmationDialog } from '../../../../components/ui/ConfirmationDialog'
import { inputClass } from '../../../../components/ui/ui-classes'
import { emailCorrectionError } from '../email-correction-error'
import { useEmailCorrection } from '../hooks'
import type { EmailCorrectionInput, ReviewDetails, ReviewRosterRow } from '../types'

export function EmailCorrectionDialog({ registration, row, onClose, onSaved, onConflict }: {
  registration: ReviewDetails; row: ReviewRosterRow; onClose: () => void; onSaved: () => void; onConflict: (message: string) => void
}) {
  const [email, setEmail] = useState(row.email)
  const [attempt, setAttempt] = useState<EmailCorrectionInput | null>(null)
  const [missing, setMissing] = useState(false)
  const mutation = useEmailCorrection()
  const error = mutation.isError ? emailCorrectionError(mutation.error) : null
  const submit = () => {
    if (mutation.isPending) return
    if (!email.trim()) { setMissing(true); return }
    const input = attempt ?? { requestId: crypto.randomUUID(), email: email.trim(), expectedRowVersion: registration.rowVersion,
      expectedTourRowVersion: registration.tourRowVersion, expectedRosterRowVersion: row.rowVersion,
      expectedInvitationRowVersion: row.invitationRowVersion }
    setAttempt(input)
    mutation.mutate({ id: registration.summary.id, rowId: row.id, input }, {
      onSuccess: onSaved,
      onError: failure => {
        const info = emailCorrectionError(failure)
        if (info.reload) onConflict(info.message)
        if (!info.uncertain) setAttempt(null)
      },
    })
  }
  return <ConfirmationDialog open title={`Sửa email dòng ${row.rowNumber}?`} withReason={false}
    description={registration.summary.state === 'APPROVED'
      ? 'Giữ trạng thái đã duyệt. Mã và phiên cũ của dòng này sẽ bị thu hồi; mã mới được gửi tới email mới và giữ hạn lời mời hiện có. Gửi thư lỗi không khôi phục mã cũ.'
      : 'Chỉ cập nhật email của dòng này. Trạng thái xét duyệt và các thông tin khác được giữ nguyên; chưa cấp mã hoặc gửi lời mời.'}
    confirmLabel={attempt && error?.uncertain ? 'Thử lại cùng yêu cầu' : 'Xác nhận sửa email'} busyLabel="Đang lưu…" busy={mutation.isPending}
    error={missing ? 'Nhập email mới.' : error?.message} onConfirm={submit} onCancel={() => { if (!mutation.isPending) onClose() }}>
    <p className="mb-3 text-sm text-slate-700">{row.displayName} · {row.rowType === 'SHARED_VIEWING' ? 'Điểm xem chung' : 'Cá nhân'}</p>
    <p className="mb-4 break-all text-sm text-slate-500">Email hiện tại: {row.email}</p>
    <label className="block text-sm font-medium text-slate-700">Email mới
      <input type="email" autoComplete="off" maxLength={254} value={email} readOnly={mutation.isPending || Boolean(attempt)}
        onChange={event => { setEmail(event.target.value); setMissing(false); mutation.reset() }} className={`${inputClass} mt-2 w-full`} />
    </label>
    {attempt && error?.uncertain && <p className="mt-3 text-sm text-slate-600">Giữ nguyên email và yêu cầu này khi thử lại. Bạn cũng có thể đóng và tải lại đăng ký để xem dữ liệu đã lưu.</p>}
  </ConfirmationDialog>
}
