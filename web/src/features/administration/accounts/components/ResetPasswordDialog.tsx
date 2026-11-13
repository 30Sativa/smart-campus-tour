import { useState } from 'react'
import { Copy, RefreshCw } from 'lucide-react'
import { ConfirmationDialog } from '../../../../components/ui/ConfirmationDialog'
import { buttonClass, inputClass, labelClass } from '../../../../components/ui/ui-classes'
import { useResetAccountPassword } from '../hooks'
import { resetPasswordError } from '../errors'
import { PASSWORD_MAX_LENGTH, generatePassword, passwordPolicyError } from '../password'
import type { AccountListItem } from '../types'

/**
 * Admin password reset (ADR-0058). The generated password is editable; after success it is shown once with a
 * copy button and is gone when the dialog closes. Refusals stay inside the dialog.
 */
export function ResetPasswordDialog({ account, onClose, onDone }: { account: AccountListItem; onClose: () => void; onDone: () => void }) {
  const reset = useResetAccountPassword()
  const [password, setPassword] = useState(() => generatePassword())
  const [localError, setLocalError] = useState<string | null>(null)
  const [issued, setIssued] = useState<string | null>(null)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')

  if (issued !== null) {
    const copyPassword = () => {
      navigator.clipboard.writeText(issued).then(() => setCopy('copied'), () => setCopy('failed'))
    }
    return (
      <ConfirmationDialog
        open
        title="Đã đặt lại mật khẩu"
        description={`Gửi mật khẩu này cho ${account.fullName} qua kênh riêng. Mật khẩu chỉ hiện một lần, đóng hộp thoại là không xem lại được.`}
        confirmLabel="Xong"
        withReason={false}
        onConfirm={onDone}
        onCancel={onDone}
      >
        <label htmlFor="reset-password-issued" className={labelClass}>Mật khẩu mới của {account.username}</label>
        <div className="mt-1.5 flex gap-2">
          <input id="reset-password-issued" readOnly value={issued} onFocus={(event) => event.target.select()} className={`${inputClass} font-mono`} />
          <button type="button" onClick={copyPassword} className={buttonClass('secondary')}>
            <Copy size={15} aria-hidden="true" />{copy === 'copied' ? 'Đã sao chép' : 'Sao chép'}
          </button>
        </div>
        {copy === 'failed' && <p role="alert" className="mt-1 text-xs text-[#b23e31]">Không sao chép được. Hãy chọn mật khẩu và sao chép thủ công.</p>}
        <p className="mt-3 text-xs leading-5 text-[#475569]">Mọi phiên đăng nhập cũ của tài khoản này đã bị đăng xuất.</p>
      </ConfirmationDialog>
    )
  }

  const confirm = () => {
    const policy = passwordPolicyError(password)
    if (policy) return setLocalError(policy)
    reset.mutate({ id: account.id, newPassword: password, expectedRowVersion: account.rowVersion }, {
      onSuccess: () => setIssued(password),
    })
  }

  const fieldError = localError ?? (reset.isError ? resetPasswordError(reset.error) : null)

  return (
    <ConfirmationDialog
      open
      title="Đặt lại mật khẩu?"
      description="Mật khẩu cũ sẽ không dùng được nữa và mọi phiên đăng nhập của tài khoản này bị đăng xuất. Tên đăng nhập và vai trò giữ nguyên."
      confirmLabel="Đặt lại mật khẩu"
      busyLabel="Đang đặt lại…"
      tone="danger"
      busy={reset.isPending}
      error={null}
      withReason={false}
      onConfirm={confirm}
      onCancel={onClose}
    >
      <p className="rounded-xl bg-[#f8fafc] px-3 py-2 text-sm font-semibold text-[#334155]">{account.fullName} · {account.username}</p>
      <label htmlFor="reset-password-new" className={`${labelClass} mt-4 block`}>Mật khẩu mới</label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="reset-password-new"
          value={password}
          maxLength={PASSWORD_MAX_LENGTH}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => { reset.reset(); setLocalError(null); setPassword(event.target.value) }}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? 'reset-password-error' : 'reset-password-hint'}
          className={`${inputClass} font-mono`}
        />
        <button type="button" onClick={() => { reset.reset(); setLocalError(null); setPassword(generatePassword()) }} className={buttonClass('secondary')} aria-label="Tạo mật khẩu khác">
          <RefreshCw size={15} aria-hidden="true" />Tạo lại
        </button>
      </div>
      {fieldError
        ? <p id="reset-password-error" role="alert" className="mt-1 text-xs text-[#b23e31]">{fieldError}</p>
        : <p id="reset-password-hint" className="mt-1 text-xs text-[#475569]">Từ 12 đến 128 ký tự. Có thể sửa mật khẩu đã tạo.</p>}
    </ConfirmationDialog>
  )
}
