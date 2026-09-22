/**
 * Administration building blocks. They sit on the operations design system
 * (`staff/StaffUi.tsx`, `staff/ui-classes.ts`, `staff/status.ts` tones) rather
 * than beside it: same panels, same badges, same buttons.
 */
import type { ReactNode } from 'react'
import { AlertCircle, CircleAlert, Inbox, MailCheck, MailWarning, MailX, RotateCcw, TriangleAlert } from 'lucide-react'
import type { AdminRegistration, RegistrationState, TourState } from '../../api/contracts/admin'
import { FilterChips, panelClass, StaffPage } from '../staff/StaffUi'
import { inputClass } from '../staff/ui-classes'
import type { DateRangeKey } from './admin-format'
import { toneClass, type StatusTone } from '../staff/status'
import { buttonClass } from '../staff/ui-classes'
import { formatStamp } from './admin-format'
import { REGISTRATION_STATE, TOUR_STATE } from './admin-status'

/** Frame of every admin page: the operations page frame, so both consoles share gutters and width. */
export function AdminPage({ children }: { children: ReactNode }) {
  return <StaffPage>{children}</StaffPage>
}

function Badge({ label, tone, size = 'sm' }: { label: string; tone: StatusTone; size?: 'sm' | 'md' }) {
  const Icon = tone === 'danger' ? CircleAlert : tone === 'warn' ? TriangleAlert : null
  const md = size === 'md'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-bold whitespace-nowrap ${md ? 'px-3 py-1 text-[13px]' : 'px-2.5 py-1 text-[11px]'} ${toneClass[tone]}`}>
      {Icon && <Icon size={md ? 14 : 12} aria-hidden="true" />}
      {label}
    </span>
  )
}

export function TourStateBadge({ state, size }: { state: TourState; size?: 'sm' | 'md' }) {
  return <Badge {...TOUR_STATE[state]} size={size} />
}

export function RegistrationStateBadge({ state }: { state: RegistrationState }) {
  return <Badge {...REGISTRATION_STATE[state]} />
}

/**
 * Participation e-mail, a separate fact from the registration state (scope
 * §3.4): the time the mail service accepted the last send, not a read receipt.
 */
export function InvitationStatus({ registration }: { registration: Pick<AdminRegistration, 'state' | 'invitationSentAt' | 'invitationFailed'> }) {
  if (registration.state !== 'Approved') return <span className="text-xs text-[#94a3b8]">-</span>
  if (registration.invitationFailed)
    return <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#b23e31]"><MailX size={14} aria-hidden="true" />Gửi lỗi, cần gửi lại</span>
  if (registration.invitationSentAt)
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2f7a5b]"><MailCheck size={14} aria-hidden="true" />Đã gửi {formatStamp(registration.invitationSentAt)}</span>
  return <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#92400e]"><MailWarning size={14} aria-hidden="true" />Chưa gửi</span>
}

/** A load that failed, with the one way out. */
export function AdminErrorPanel({ title, onRetry }: { title: string; onRetry?: () => void }) {
  return (
    <div className={`${panelClass} flex min-h-52 flex-col items-center justify-center gap-3 p-8 text-center`} role="alert">
      <AlertCircle className="text-[#bd473a]" size={24} aria-hidden="true" />
      <p className="text-[15px] font-semibold text-[#1e293b]">{title}</p>
      <p className="max-w-md text-sm text-[#64748b]">Kiểm tra kết nối với máy chủ rồi thử lại.</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={buttonClass('secondary', 'sm')}>
          <RotateCcw size={15} aria-hidden="true" />Thử lại
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-[#f1f5f9] text-[#94a3b8]" aria-hidden="true"><Inbox size={20} /></span>
      <p className="text-[15px] font-semibold text-[#1e293b]">{title}</p>
      {description && <p className="max-w-md text-sm text-[#64748b]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Placeholder rows while a list loads: the page keeps its shape. */
export function SkeletonRows({ rows = 5, label = 'Đang tải' }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-2 p-5" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-[#f1f5f9] motion-reduce:animate-none" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  )
}

/** An inline notice inside a panel or dialog. */
export function Notice({ tone = 'info', children, action }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode; action?: ReactNode }) {
  const palette = tone === 'danger' ? 'border-[#f5c8c2] bg-[#fff4f2] text-[#9d3428]' : tone === 'warn' ? 'border-[#f1dcb0] bg-[#fffaf0] text-[#7d5310]' : 'border-[#d8e5f7] bg-[#f5f9ff] text-[#35507a]'
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-[13px] leading-5 font-medium ${palette}`} role={tone === 'info' ? 'status' : 'alert'}>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}

/** Wraps a wide table: horizontal scroll on tablet, hidden below `md` where cards take over. */
export function TableFrame({ children, label, wide = false }: { children: ReactNode; label: string; wide?: boolean }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className={`w-full text-left text-sm ${wide ? 'min-w-[1040px]' : 'min-w-[860px]'}`} aria-label={label}>{children}</table>
    </div>
  )
}

/**
 * Today / this week / a custom range. The two date inputs appear only for a
 * custom range, directly under the chips, and keep what was typed.
 */
export function DateRangeFilter({ label, value, from, to, options, onChange }: {
  label: string
  value: DateRangeKey
  from: string
  to: string
  options: Array<{ value: DateRangeKey; label: string }>
  onChange: (next: { date: DateRangeKey; from?: string; to?: string }) => void
}) {
  return (
    <div className="min-w-0 space-y-3">
      <FilterChips<DateRangeKey> label={label} value={value} onChange={(date) => onChange({ date })} options={options} />
      {value === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 transition-opacity duration-200 starting:opacity-0">
          <label className="text-xs font-medium text-[#475569]">Từ ngày<input type="date" value={from} max={to || undefined} onChange={(event) => onChange({ date: 'custom', from: event.target.value, to })} className={`${inputClass} mt-1 w-44`} /></label>
          <label className="text-xs font-medium text-[#475569]">Đến ngày<input type="date" value={to} min={from || undefined} onChange={(event) => onChange({ date: 'custom', from, to: event.target.value })} className={`${inputClass} mt-1 w-44`} /></label>
        </div>
      )}
    </div>
  )
}
