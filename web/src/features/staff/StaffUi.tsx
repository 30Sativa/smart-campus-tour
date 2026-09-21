import type { ReactNode } from 'react'
import { AlertCircle, CircleAlert, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ApiError } from '../../api/client'
import { dotClass, statusInfo, toneClass, type StatusTone } from './status'

export const panelClass =
  'overflow-hidden rounded-2xl border border-[var(--ops-border,#e2e8f0)] bg-white shadow-xs transition-[box-shadow,border-color] duration-200'

/**
 * The page's own heading. Eyebrow, title and supporting line each say something new.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  scale = 'default',
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
  scale?: 'default' | 'console'
}) {
  const console_ = scale === 'console'
  return (
    <header className={`flex flex-col justify-between gap-4 md:flex-row md:items-end ${console_ ? 'mb-7' : 'mb-6'}`}>
      <div>
        <p className={`font-bold tracking-[0.12em] text-[#2563eb] uppercase ${console_ ? 'text-xs' : 'text-[11px]'}`}>
          {eyebrow}
        </p>
        <h1
          className={`mt-1.5 font-black tracking-tight text-[#0f172a] ${
            console_ ? 'text-[26px] leading-[1.15] sm:text-[30px] lg:text-[32px]' : 'text-2xl sm:text-[26px]'
          }`}
        >
          {title}
        </h1>
        <p className={`mt-1.5 max-w-3xl text-[#64748b] ${console_ ? 'text-sm sm:text-[15px] leading-relaxed' : 'text-sm leading-6'}`}>
          {description}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

export function LoadingPanel({ label = 'Đang tải dữ liệu vận hành…' }: { label?: string }) {
  return (
    <div
      className={`${panelClass} flex min-h-60 items-center justify-center gap-3 p-8 text-sm font-semibold text-[#64748b]`}
      aria-busy="true"
    >
      <LoaderCircle className="animate-spin text-[#2563eb]" size={20} />
      {label}
    </div>
  )
}

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : undefined
  const detail =
    status === 403
      ? 'Tài khoản hiện tại không có quyền xem dữ liệu này.'
      : status === 401
      ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
      : 'Không tải được dữ liệu vận hành. Kiểm tra kết nối với máy chủ rồi thử lại.'
  const canRetry = Boolean(onRetry) && status !== 401 && status !== 403
  return (
    <div
      className={`${panelClass} flex min-h-60 flex-col items-center justify-center gap-3 p-8 text-center text-[#64748b]`}
      role="alert"
    >
      <div className="grid size-11 place-items-center rounded-2xl bg-[#fef2f2] text-[#ef4444]">
        <AlertCircle size={22} />
      </div>
      <p className="font-bold text-[#0f172a] text-sm max-w-md">{detail}</p>
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-4 text-xs font-bold text-[#2563eb] shadow-xs hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2"
        >
          <RotateCcw size={14} aria-hidden="true" />
          Thử lại
        </button>
      )}
    </div>
  )
}

export function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className={`${panelClass} flex min-h-44 items-center justify-center p-8 text-center text-sm font-medium text-[#64748b]`}>
      {children}
    </div>
  )
}

export function StatusBadge({
  value,
  className = '',
  size = 'sm',
  live = false,
}: {
  value?: string | null
  className?: string
  size?: 'sm' | 'md'
  live?: boolean
}) {
  const { label, tone } = statusInfo(value)
  const Icon = tone === 'danger' ? CircleAlert : tone === 'warn' ? TriangleAlert : null
  const md = size === 'md'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold whitespace-nowrap transition-colors duration-200 ${
        md ? 'px-3 py-1 text-[13px]' : 'px-2.5 py-0.5 text-[11px]'
      } ${toneClass[tone]} ${className}`}
    >
      {Icon ? <Icon size={md ? 14 : 12} aria-hidden="true" /> : live ? <LiveDot tone={tone} /> : null}
      {label}
    </span>
  )
}

export function LiveDot({ tone = 'ok', pulse = true }: { tone?: StatusTone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex size-2 shrink-0" aria-hidden="true">
      {pulse && tone !== 'danger' && (
        <span
          className={`absolute inline-flex size-full animate-ping rounded-full opacity-40 [animation-duration:2.4s] motion-reduce:hidden ${dotClass[tone]}`}
        />
      )}
      <span className={`relative inline-flex size-2 rounded-full ${dotClass[tone]}`} />
    </span>
  )
}

export function StaffPage({
  children,
  wide = false,
  className = '',
}: {
  children: ReactNode
  wide?: boolean
  className?: string
}) {
  return (
    <div className={`min-h-full bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8 lg:py-7 ${className}`}>
      <div
        className={`mx-auto w-full transition-[opacity,translate] duration-300 ease-out starting:translate-y-1.5 starting:opacity-0 motion-reduce:transition-none ${
          wide ? 'max-w-[1600px]' : 'max-w-[1440px]'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold tracking-[0.05em] text-[#64748b] uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-semibold break-words text-[#0f172a]">{children}</dd>
    </div>
  )
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string; count?: number }>
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5 overflow-x-auto py-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`inline-flex min-h-8.5 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
            value === option.value
              ? 'bg-[#0f172a] text-white shadow-xs'
              : 'bg-white text-[#64748b] border border-[#e2e8f0] hover:text-[#0f172a] hover:border-[#cbd5e1]'
          }`}
        >
          {option.label}
          {option.count != null && (
            <span
              className={`rounded-md px-1.5 py-0.2 text-[10px] font-semibold tabular-nums ${
                value === option.value ? 'bg-white/20 text-white' : 'bg-[#f1f5f9] text-[#64748b]'
              }`}
            >
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function SummaryTile({
  label,
  value,
  hint,
  icon: Icon,
  selected = false,
  onSelect,
}: {
  label: string
  value: ReactNode
  hint?: string
  icon: LucideIcon
  selected?: boolean
  onSelect?: () => void
}) {
  const body = (
    <>
      <span
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eff6ff] text-[#2563eb]"
        aria-hidden="true"
      >
        <Icon size={20} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xl font-black tracking-tight text-[#0f172a] tabular-nums leading-none">
          {value}
        </span>
        <span className="mt-1.5 block truncate text-xs font-bold text-[#64748b]">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-4 text-[#94a3b8]">{hint}</span>}
      </span>
    </>
  )

  const shape =
    'flex items-center gap-3.5 rounded-2xl border bg-white p-4 text-left shadow-xs transition-all duration-200'

  if (!onSelect) return <div className={`${shape} border-[#e2e8f0]`}>{body}</div>

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`${shape} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${
        selected
          ? 'border-[#2563eb] bg-[#f8fafc] ring-1 ring-[#2563eb]'
          : 'border-[#e2e8f0] hover:border-[#cbd5e1] hover:bg-[#f8fafc]'
      }`}
    >
      {body}
    </button>
  )
}

export function CellIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#eff6ff] text-[#2563eb]"
      aria-hidden="true"
    >
      <Icon size={16} strokeWidth={2} />
    </span>
  )
}

export function PanelHead({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1f5f9] px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="font-bold text-sm text-[#0f172a]">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-[#64748b]">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div
      className="flex flex-1 items-start justify-center bg-[#f8fafc] p-8"
      aria-busy="true"
      aria-label="Đang tải trang"
    >
      <div className="w-full max-w-[1500px] space-y-4">
        <div className="h-14 max-w-md animate-pulse rounded-2xl bg-[#e2e8f0]" />
        <div className="h-24 animate-pulse rounded-2xl bg-[#e2e8f0]" />
        <div className="h-72 animate-pulse rounded-2xl bg-[#e2e8f0]" />
      </div>
    </div>
  )
}
