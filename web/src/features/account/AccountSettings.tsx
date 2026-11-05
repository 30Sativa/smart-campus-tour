import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { roleLabel } from '../../auth/roles'
import { MIN_PASSWORD_LENGTH, passwordProblems } from './password-rules'
import { panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass, labelClass } from '../../components/ui/ui-classes'
import { notify } from '../../components/ui/toast-store'
import { useAuthStore } from '../../stores/auth-store'
import { readAccountError } from './api/account-api'
import { useChangePassword, useMyProfile, useUpdateMyName } from './hooks'

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('vi-VN') : '-'
}

function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? <p id={id} role="alert" className="mt-1 text-xs text-[#b23e31]">{text}</p> : null
}

function Card({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className={`${panelClass} p-5`} aria-label={title}>
      <h2 className="text-[15px] font-bold text-[#0f172a]">{title}</h2>
      <p className="mt-0.5 mb-4 text-[12.5px] text-[#64748b]">{note}</p>
      {children}
    </section>
  )
}

function ProfileCard() {
  const profile = useMyProfile()
  const update = useUpdateMyName()
  const [draft, setDraft] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string>()
  const failure = update.isError ? readAccountError(update.error, 'Không lưu được họ tên. Vui lòng thử lại.') : null

  if (profile.isPending) return <Card title="Thông tin cá nhân" note="Đang tải…"><div className="h-24 animate-pulse rounded-xl bg-[#f1f5f9]" /></Card>
  if (profile.isError || !profile.data) {
    return (
      <Card title="Thông tin cá nhân" note="Không tải được hồ sơ.">
        <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void profile.refetch()}>Thử lại</button>
      </Card>
    )
  }

  const data = profile.data
  const fullName = draft ?? data.fullName
  const dirty = fullName.trim() !== data.fullName

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = fullName.trim()
    if (!trimmed) return setLocalError('Nhập họ tên.')
    if (trimmed.length > 150) return setLocalError('Họ tên tối đa 150 ký tự.')
    setLocalError(undefined)
    update.mutate(trimmed, {
      onSuccess: () => {
        setDraft(null)
        notify({ title: 'Đã lưu họ tên' })
      },
    })
  }

  const nameError = localError ?? failure?.fields.fullName

  return (
    <Card title="Thông tin cá nhân" note="Họ tên là thông tin duy nhất bạn tự sửa. Tên đăng nhập, vai trò và trạng thái do Admin quản lý.">
      <form onSubmit={submit} noValidate className="space-y-4">
        {failure && !failure.fields.fullName && <p role="alert" className="rounded-xl bg-[#fff4f2] px-3 py-2 text-xs text-[#9d3428]">{failure.message}</p>}
        <div>
          <label htmlFor="profile-full-name" className={labelClass}>Họ tên</label>
          <input
            id="profile-full-name"
            value={fullName}
            maxLength={150}
            autoComplete="name"
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? 'profile-full-name-error' : undefined}
            onChange={(event) => { setDraft(event.target.value); setLocalError(undefined); update.reset() }}
            className={`${inputClass} mt-1.5`}
          />
          <FieldError id="profile-full-name-error" text={nameError} />
        </div>
        <dl className="grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-2">
          <div><dt className="text-[#64748b]">Tên đăng nhập</dt><dd className="font-mono font-semibold text-[#0f172a]">{data.username}</dd></div>
          <div><dt className="text-[#64748b]">Vai trò</dt><dd className="font-semibold text-[#0f172a]">{roleLabel(data.role)}</dd></div>
          <div><dt className="text-[#64748b]">Trạng thái</dt><dd className="font-semibold text-[#0f172a]">{data.isActive ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}</dd></div>
          <div><dt className="text-[#64748b]">Ngày tạo</dt><dd className="text-[#334155]">{formatDate(data.createdAt)}</dd></div>
        </dl>
        <div className="flex gap-2">
          <button type="submit" disabled={!dirty || update.isPending} className={buttonClass('primary', 'md')}>
            {update.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
          {dirty && <button type="button" className={buttonClass('secondary', 'md')} onClick={() => { setDraft(null); setLocalError(undefined); update.reset() }}>Hủy</button>}
        </div>
      </form>
    </Card>
  )
}

const EMPTY = { currentPassword: '', newPassword: '', confirm: '' }

function PasswordCard() {
  const change = useChangePassword()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const failure = change.isError ? readAccountError(change.error, 'Không đổi được mật khẩu. Vui lòng thử lại.') : null
  const shown = { ...errors, ...failure?.fields }

  const set = (field: keyof typeof EMPTY, value: string) => {
    change.reset()
    setErrors((current) => ({ ...current, [field]: '' }))
    setForm((current) => ({ ...current, [field]: value }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const problems = passwordProblems(form)
    if (Object.keys(problems).length) return setErrors(problems)
    change.mutate(
      { currentPassword: form.currentPassword, newPassword: form.newPassword },
      {
        onSuccess: () => {
          // The server revoked every session of this account, so this one is gone too.
          setForm(EMPTY)
          useAuthStore.getState().logout()
          notify({ title: 'Đã đổi mật khẩu', detail: 'Mọi phiên đăng nhập đã kết thúc. Hãy đăng nhập lại bằng mật khẩu mới.' })
          navigate('/login', { replace: true })
        },
      },
    )
  }

  return (
    <Card title="Đổi mật khẩu" note={`Cần mật khẩu hiện tại. Mật khẩu mới dài ${MIN_PASSWORD_LENGTH} đến 128 ký tự. Sau khi đổi, mọi thiết bị phải đăng nhập lại.`}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {failure && !Object.keys(failure.fields).length && <p role="alert" className="rounded-xl bg-[#fff4f2] px-3 py-2 text-xs text-[#9d3428]">{failure.message}</p>}
        {([
          ['currentPassword', 'Mật khẩu hiện tại', 'current-password'],
          ['newPassword', 'Mật khẩu mới', 'new-password'],
          ['confirm', 'Nhập lại mật khẩu mới', 'new-password'],
        ] as const).map(([field, label, autoComplete]) => (
          <div key={field}>
            <label htmlFor={`pw-${field}`} className={labelClass}>{label}</label>
            <input
              id={`pw-${field}`}
              type="password"
              value={form[field]}
              autoComplete={autoComplete}
              aria-invalid={Boolean(shown[field])}
              aria-describedby={shown[field] ? `pw-${field}-error` : undefined}
              onChange={(event) => set(field, event.target.value)}
              className={`${inputClass} mt-1.5`}
            />
            <FieldError id={`pw-${field}-error`} text={shown[field]} />
          </div>
        ))}
        <button type="submit" disabled={change.isPending} className={buttonClass('primary', 'md')}>
          {change.isPending ? 'Đang đổi…' : 'Đổi mật khẩu'}
        </button>
      </form>
    </Card>
  )
}

/** The one self-service block every signed-in role embeds in its own profile page. */
export function AccountSettings() {
  return (
    <div className="grid gap-3">
      <ProfileCard />
      <PasswordCard />
    </div>
  )
}
