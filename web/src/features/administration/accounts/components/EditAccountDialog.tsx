import { useRef, useState, type FormEvent } from 'react'
import { ConfirmationDialog } from '../../../../components/ui/ConfirmationDialog'
import { inputClass, labelClass } from '../../../../components/ui/ui-classes'
import { notify } from '../../../../components/ui/toast-store'
import { Notice } from '../../AdminUi'
import { useUpdateAccount } from '../hooks'
import { accountRequestError } from '../errors'
import type { AccountListItem } from '../types'

function LockedField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-[#64748b]">{label}</dt>
      <dd className={`mt-1 flex items-center gap-2 rounded-xl border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 font-semibold text-[#64748b] ${mono ? 'font-mono' : ''}`}>
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current" strokeWidth="1.6">
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </svg>
        <span className="truncate">{value}</span>
        <span className="sr-only">(không thể sửa)</span>
      </dd>
    </div>
  )
}

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
      title="Sửa họ tên"
      description="Tên đăng nhập là định danh đăng nhập, còn vai trò gắn với dữ liệu của tài khoản, nên cả hai được khóa sau khi tạo."
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
          <LockedField label="Tên đăng nhập" value={account.username} mono />
          <LockedField label="Vai trò" value={account.role === 'TechnicalStaff' ? 'Technical Staff' : account.role ?? '-'} />
        </dl>
        <p className="text-xs leading-5 text-[#64748b]">Tạo nhầm tên đăng nhập hoặc vai trò? Vô hiệu hóa tài khoản này rồi tạo tài khoản mới.</p>
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
