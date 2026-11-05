import { useRef, useState, type FormEvent } from 'react'
import { ConfirmationDialog } from '../../../../components/ui/ConfirmationDialog'
import { inputClass, labelClass } from '../../../../components/ui/ui-classes'
import { notify } from '../../../../components/ui/toast-store'
import { Notice } from '../../AdminUi'
import { useUpdateAccount } from '../hooks'
import { accountRequestError } from '../errors'
import type { AccountListItem } from '../types'

/** Edits the full name only. Username (login identity) and role are shown read-only on purpose. */
export function EditAccountDialog({ account, onClose, onSaved }: { account: AccountListItem; onClose: () => void; onSaved: () => void }) {
  const formRef = useRef<HTMLFormElement>(null)
  const update = useUpdateAccount()
  const [fullName, setFullName] = useState(account.fullName)
  const [localError, setLocalError] = useState<string>()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = fullName.trim()
    if (!trimmed) return setLocalError('Nhập họ tên.')
    if (trimmed.length > 150) return setLocalError('Họ tên tối đa 150 ký tự.')
    if (trimmed === account.fullName) return onClose()
    update.mutate({ id: account.id, fullName: trimmed }, {
      onSuccess: () => {
        notify({ title: `Đã cập nhật tài khoản ${account.username}` })
        onSaved()
      },
    })
  }

  return (
    <ConfirmationDialog
      open
      title="Sửa tài khoản"
      description="Chỉ họ tên có thể sửa. Tên đăng nhập là định danh đăng nhập và vai trò gắn với dữ liệu của tài khoản, nên không đổi tại đây."
      confirmLabel="Lưu"
      busyLabel="Đang lưu…"
      busy={update.isPending}
      error={null}
      withReason={false}
      onConfirm={() => formRef.current?.requestSubmit()}
      onCancel={onClose}
    >
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        {update.isError && <Notice tone="danger">{accountRequestError(update.error, 'Không thể cập nhật tài khoản. Vui lòng thử lại.')}</Notice>}
        <dl className="grid grid-cols-2 gap-3 text-[13px]">
          <div><dt className="text-xs text-[#64748b]">Tên đăng nhập</dt><dd className="font-mono font-semibold text-[#1e293b]">{account.username}</dd></div>
          <div><dt className="text-xs text-[#64748b]">Vai trò</dt><dd className="font-semibold text-[#1e293b]">{account.role === 'TechnicalStaff' ? 'Technical Staff' : account.role}</dd></div>
        </dl>
        <div>
          <label htmlFor="edit-account-full-name" className={labelClass}>Họ tên</label>
          <input
            id="edit-account-full-name"
            value={fullName}
            maxLength={150}
            onChange={(event) => { update.reset(); setLocalError(undefined); setFullName(event.target.value) }}
            aria-invalid={Boolean(localError)}
            aria-describedby={localError ? 'edit-account-full-name-error' : undefined}
            className={`${inputClass} mt-1.5`}
          />
          {localError && <p id="edit-account-full-name-error" role="alert" className="mt-1 text-xs text-[#b23e31]">{localError}</p>}
        </div>
      </form>
    </ConfirmationDialog>
  )
}
