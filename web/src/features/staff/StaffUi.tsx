import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { AlertCircle, ChevronLeft, ChevronRight, CircleAlert, LoaderCircle, RotateCcw, Search, TriangleAlert, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ApiError } from '../../api/client'
import { dotClass, statusInfo, toneClass, type StatusTone } from './status'
import { buttonClass, inputClass } from './ui-classes'

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
          className={`mt-1.5 font-bold tracking-tight text-[#0f172a] ${
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
      <dt className="text-xs font-medium text-[#64748b]">{label}</dt>
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
          className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-[background-color,color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
            value === option.value
              ? 'bg-[#0f172a] text-white shadow-xs'
              : 'bg-white text-[#64748b] border border-[#e2e8f0] hover:text-[#0f172a] hover:border-[#cbd5e1]'
          }`}
        >
          {option.label}
          {option.count != null && (
            <span
              className={`rounded-md px-1.5 text-[11px] font-semibold tabular-nums ${
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

/* ── Shared page parts (second consumer: administration) ─────────────────── */

const STAT_TONE = { info: 'text-[#2563eb]', danger: 'text-[#b23e31]', warn: 'text-[#b45309]' } as const

/**
 * One figure in a `StatStrip`. A strip of figures in one panel rather than a
 * card per number: the eye reads across one row, and the page keeps its cards
 * for content. `tone` only colours the figure when it asks for work (>0).
 */
export function StatTile({ to, icon: Icon, label, value, hint, tone }: { to?: string; icon: LucideIcon; label: string; value: ReactNode; hint?: string; tone?: keyof typeof STAT_TONE }) {
  const active = tone && typeof value === 'number' && value > 0
  const body = (
    <>
      <span className={`flex items-center gap-1.5 text-xs font-medium ${active ? STAT_TONE[tone] : 'text-[#64748b]'}`}><Icon size={14} aria-hidden="true" />{label}</span>
      <span className={`mt-1.5 block text-[28px] leading-none font-bold tracking-tight tabular-nums transition-colors duration-300 ${active ? STAT_TONE[tone] : 'text-[#0f172a]'}`}>{value}</span>
      {hint && <span className="mt-1.5 block truncate text-xs text-[#94a3b8]">{hint}</span>}
    </>
  )
  const shape = 'block rounded-xl px-3 py-3'
  if (!to) return <div className={shape}>{body}</div>
  return <Link to={to} className={`${shape} transition-colors duration-150 hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]`}>{body}</Link>
}

export function StatStrip({ label, children, columns = 'sm:grid-cols-3 xl:grid-cols-6' }: { label: string; children: ReactNode; columns?: string }) {
  return <section aria-label={label} className={`grid grid-cols-2 gap-1 rounded-2xl border border-[#e2e8f0] bg-white p-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${columns}`}>{children}</section>
}

/** A section title that sits above its panel, so the panel itself carries no header chrome. */
export function SectionHeading({ title, note, action }: { title: string; note?: string; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h2 className="text-base font-semibold tracking-[-0.015em] text-[#0f172a]">{title}</h2>
        {note && <p className="truncate text-[13px] text-[#94a3b8]">{note}</p>}
      </div>
      {action}
    </div>
  )
}

/** A search box: icon, input, and a clear button once there is something to clear. */
export function SearchField({ value, onChange, placeholder, label, className = '' }: { value: string; onChange: (value: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{label}</span>
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#94a3b8]" aria-hidden="true" />
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`${inputClass} pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden`} />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Xóa tìm kiếm" className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] hover:text-[#1e293b]">
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </label>
  )
}

/** First, last, and two either side of the current page; `null` is a gap. */
function pageWindow(page: number, count: number): Array<number | null> {
  const pages: Array<number | null> = []
  for (let n = 1; n <= count; n += 1) {
    if (n === 1 || n === count || Math.abs(n - page) <= 1) pages.push(n)
    else if (pages[pages.length - 1] !== null) pages.push(null)
  }
  return pages
}

/**
 * Page through a list that is already in memory. Shows the range and the
 * total; hides itself when everything fits on one page.
 */
export function Pagination({ page, pageCount, total, pageSize, onPage, label }: { page: number; pageCount: number; total: number; pageSize: number; onPage: (page: number) => void; label: string }) {
  if (pageCount <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f1f5f9] px-4 py-3">
      <p className="text-[13px] text-[#64748b]"><span className="font-semibold text-[#1e293b] tabular-nums">{from}-{to}</span> trên <span className="tabular-nums">{total}</span></p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className={buttonClass('ghost', 'sm')} aria-label="Trang trước"><ChevronLeft size={16} aria-hidden="true" /></button>
        {pageWindow(page, pageCount).map((n, i) => n == null ? <span key={`gap-${i}`} className="px-1 text-[13px] text-[#94a3b8]" aria-hidden="true">…</span> : (
          <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined} className={`grid size-9 place-items-center rounded-lg text-[13px] font-medium tabular-nums transition-colors ${n === page ? 'bg-[#0f172a] text-white' : 'text-[#475569] hover:bg-[#f1f5f9]'}`}>{n}</button>
        ))}
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pageCount} className={buttonClass('ghost', 'sm')} aria-label="Trang sau"><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
    </nav>
  )
}
