import { useRef, useState, type FormEvent } from 'react'
import { ConfirmationDialog } from '../../../staff/components/ConfirmationDialog'
import { inputClass, labelClass } from '../../../staff/ui-classes'
import { Notice } from '../../AdminUi'
import { useCreateAccount } from '../hooks'
import { accountFormError, type AccountFormErrors, type AccountFormField } from '../errors'
import type { CreatableAccountRole, CreateAccountInput } from '../types'

const INITIAL_FORM = { username: '', fullName: '', role: '' as CreatableAccountRole | '', initialPassword: '' }

export function CreateAccountDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const formRef = useRef<HTMLFormElement>(null)
  const create = useCreateAccount()
  const [form, setForm] = useState(INITIAL_FORM)
  const [localErrors, setLocalErrors] = useState<AccountFormErrors>({})
  const serverError = create.isError ? accountFormError(create.error) : null
  const errors = { ...localErrors, ...serverError?.fields }
  const errorMessage = serverError?.message

  const update = <K extends keyof typeof INITIAL_FORM>(field: K, value: (typeof INITIAL_FORM)[K]) => {
    create.reset()
    setLocalErrors((current) => ({ ...current, [field]: undefined }))
    setForm((current) => ({ ...current, [field]: value }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: AccountFormErrors = {}
    if (!form.username.trim()) nextErrors.username = 'Nhập tên đăng nhập.'
    else if (/\p{White_Space}/u.test(form.username)) nextErrors.username = 'Tên đăng nhập không được chứa khoảng trắng.'
    if (!form.fullName.trim()) nextErrors.fullName = 'Nhập họ tên.'
    if (!form.role) nextErrors.role = 'Chọn vai trò.'
    if (!form.initialPassword) nextErrors.initialPassword = 'Nhập mật khẩu ban đầu.'
    if (Object.keys(nextErrors).length) {
      setLocalErrors(nextErrors)
      return
    }

    const input: CreateAccountInput = {
      username: form.username,
      fullName: form.fullName.trim(),
      role: form.role as CreatableAccountRole,
      initialPassword: form.initialPassword,
    }
    create.mutate(input, {
      onSuccess: () => {
        setForm(INITIAL_FORM)
        setLocalErrors({})
        onCreated()
      },
    })
  }

  const fieldError = (field: AccountFormField) => errors[field]

  return (
    <ConfirmationDialog
      open
      title="Tạo tài khoản"
      description="Tạo tài khoản Staff hoặc Đại diện trường. Admin được cấp riêng qua cấu hình ban đầu."
      confirmLabel="Tạo tài khoản"
      busyLabel="Đang tạo…"
      busy={create.isPending}
      error={null}
      withReason={false}
      onConfirm={() => formRef.current?.requestSubmit()}
      onCancel={onClose}
    >
      <form ref={formRef} onSubmit={submit} className="space-y-4">
        {errorMessage && <Notice tone="danger">{errorMessage}</Notice>}
        <div>
          <label htmlFor="account-username" className={labelClass}>Tên đăng nhập</label>
          <input id="account-username" value={form.username} onChange={(event) => update('username', event.target.value)} autoComplete="username" required aria-invalid={Boolean(fieldError('username'))} aria-describedby={fieldError('username') ? 'account-username-error' : undefined} className={`${inputClass} mt-1.5`} />
          {fieldError('username') && <p id="account-username-error" className="mt-1 text-xs text-[#b23e31]">{fieldError('username')}</p>}
        </div>
        <div>
          <label htmlFor="account-full-name" className={labelClass}>Họ tên</label>
          <input id="account-full-name" value={form.fullName} onChange={(event) => update('fullName', event.target.value)} autoComplete="name" required aria-invalid={Boolean(fieldError('fullName'))} aria-describedby={fieldError('fullName') ? 'account-full-name-error' : undefined} className={`${inputClass} mt-1.5`} />
          {fieldError('fullName') && <p id="account-full-name-error" className="mt-1 text-xs text-[#b23e31]">{fieldError('fullName')}</p>}
        </div>
        <div>
          <label htmlFor="account-role" className={labelClass}>Vai trò</label>
          <select id="account-role" value={form.role} onChange={(event) => update('role', event.target.value as CreatableAccountRole | '')} required aria-invalid={Boolean(fieldError('role'))} aria-describedby={fieldError('role') ? 'account-role-error' : undefined} className={`${inputClass} mt-1.5`}>
            <option value="">Chọn vai trò</option>
            <option value="Staff">Staff</option>
            <option value="Representative">Representative</option>
          </select>
          {fieldError('role') && <p id="account-role-error" className="mt-1 text-xs text-[#b23e31]">{fieldError('role')}</p>}
        </div>
        <div>
          <label htmlFor="account-initial-password" className={labelClass}>Mật khẩu ban đầu</label>
          <input id="account-initial-password" type="password" value={form.initialPassword} onChange={(event) => update('initialPassword', event.target.value)} autoComplete="new-password" required aria-invalid={Boolean(fieldError('initialPassword'))} aria-describedby={fieldError('initialPassword') ? 'account-password-error' : undefined} className={`${inputClass} mt-1.5`} />
          {fieldError('initialPassword') && <p id="account-password-error" className="mt-1 text-xs text-[#b23e31]">{fieldError('initialPassword')}</p>}
        </div>
      </form>
    </ConfirmationDialog>
  )
}
