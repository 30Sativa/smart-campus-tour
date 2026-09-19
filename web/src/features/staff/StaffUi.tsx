import type { ReactNode } from 'react'
import { AlertCircle, CircleAlert, LoaderCircle, RotateCcw, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ApiError } from '../../api/client'
import { statusInfo, toneClass } from './status'

// Staff supplies its Material palette; administration keeps its existing defaults.
export const panelClass = 'overflow-hidden rounded-[var(--ops-radius,1rem)] border border-[var(--ops-border,#dce9fb)] bg-white shadow-[var(--ops-shadow,0_10px_30px_rgba(69,112,167,0.07))]'

/**
 * The page's own heading. The shell header names the area, so this must not
 * repeat it: eyebrow, title and supporting line each say something new.
 *
 * The operations overview does NOT use this - it carries its own command bar,
 * which is part of what makes that screen read as a console rather than as
 * another report. Every other staff and admin page shares this one.
 */
export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow: string; title: string; description: string; action?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className="text-[11px] font-bold tracking-[0.12em] text-[#5b91ed] uppercase">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-[#1f314d] sm:text-[28px]">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71819a]">{description}</p>
      </div>
      {action}
    </header>
  )
}

export function LoadingPanel({ label = 'Đang tải dữ liệu vận hành…' }: { label?: string }) {
  return <div className={`${panelClass} flex min-h-60 items-center justify-center gap-3 p-8 text-sm font-semibold text-[#647793]`} aria-busy="true"><LoaderCircle className="animate-spin text-[#5b91ed]" size={20} />{label}</div>
}

/**
 * A failed load, with a way out of it.
 *
 * `onRetry` is optional because two of the three cases have no retry worth
 * offering: 401 needs a new session and 403 will fail again the same way. Where
 * the caller can re-run the query it passes it, and the panel stops being a
 * dead end that leaves an operator with nothing to press.
 */
export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : undefined
  const detail = status === 403 ? 'Tài khoản hiện tại không có quyền xem dữ liệu này.' : status === 401 ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' : 'Không tải được dữ liệu vận hành. Kiểm tra kết nối với máy chủ rồi thử lại.'
  const canRetry = Boolean(onRetry) && status !== 401 && status !== 403
  return (
    <div className={`${panelClass} flex min-h-60 flex-col items-center justify-center gap-3 p-8 text-center text-[#647793]`} role="alert">
      <AlertCircle className="text-[#bd473a]" size={24} />
      <p className="font-bold text-[#40546f]">{detail}</p>
      {canRetry && (
        <button type="button" onClick={onRetry} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dce9fb] bg-white px-4 text-sm font-bold text-[#2f62b8] hover:bg-[#eff6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2">
          <RotateCcw size={15} aria-hidden="true" />Thử lại
        </button>
      )}
    </div>
  )
}

export function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className={`${panelClass} flex min-h-44 items-center justify-center p-8 text-center text-sm font-medium text-[#71819a]`}>{children}</div>
}

/**
 * A status, in Vietnamese, with its tone.
 *
 * The two tones that mean "act now" also carry an icon, so the badge never
 * relies on colour alone to say a robot is down or an alert is critical.
 */
export function StatusBadge({ value, className = '', size = 'sm' }: { value?: string | null; className?: string; size?: 'sm' | 'md' }) {
  const { label, tone } = statusInfo(value)
  const Icon = tone === 'danger' ? CircleAlert : tone === 'warn' ? TriangleAlert : null
  const md = size === 'md'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-bold whitespace-nowrap ${md ? 'px-3 py-1 text-[13px]' : 'px-2.5 py-1 text-[11px]'} ${toneClass[tone]} ${className}`}>
      {Icon && <Icon size={md ? 14 : 12} aria-hidden="true" />}
      {label}
    </span>
  )
}

/**
 * One figure, with what it is and where it came from.
 *
 * The tile every console screen opens with: the schedule's status counts and the
 * administration overview's KPIs are the same object, so they are the same
 * component. Two rules it enforces on every caller:
 *
 * - ONE accent. The tiles do not tint themselves by meaning. Colour on these
 *   screens already means severity on a `StatusBadge` a few centimetres below,
 *   and a palette cannot carry two vocabularies at once.
 * - `value` is a ReactNode, so the caller owns the empty case. A tile that has
 *   no figure yet must say so — "—" while it loads, "Không có dữ liệu" when the
 *   contract carries nothing — and never print a 0 it was not given.
 *
 * Passing `onSelect` makes it a filter control rather than a readout; the tile
 * then reports its own state through `aria-pressed`.
 */
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
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#eaf4ff] text-[#2f62b8]" aria-hidden="true">
        <Icon size={21} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xl leading-none font-bold text-[#1f314d] tabular-nums">{value}</span>
        <span className="mt-1.5 block truncate text-xs font-semibold text-[#71819a]">{label}</span>
        {hint && <span className="mt-1 block text-[11px] leading-4 text-[#8a98ac]">{hint}</span>}
      </span>
    </>
  )

  const shape = 'flex items-center gap-3.5 rounded-2xl border bg-white px-4 py-4 text-left'

  if (!onSelect) return <div className={`${shape} border-[#dce9fb]`}>{body}</div>

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`${shape} transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f8df7] ${
        selected ? 'border-[#5b91ed] bg-[#f8fbff]' : 'border-[#dce9fb] hover:border-[#5b91ed] hover:bg-[#f8fbff]'
      }`}
    >
      {body}
    </button>
  )
}

/** A row's leading glyph: one 34px tile, so every column starts on one axis. */
export function CellIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-[#f1f6fe] text-[#5b91ed]" aria-hidden="true">
      <Icon size={16} strokeWidth={1.9} />
    </span>
  )
}

/** A panel's own heading: title, one supporting line, an optional action. */
export function PanelHead({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf2fa] px-5 py-4">
      <div className="min-w-0">
        <h2 className="font-bold text-[#1f314d]">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-5 text-[#71819a]">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** Fallback while a lazy area page chunk loads. */
export function PageSkeleton() {
  return (
    <div className="flex flex-1 items-start justify-center bg-[#f1f6fe] p-8" aria-busy="true" aria-label="Đang tải trang">
      <div className="w-full max-w-[1500px] space-y-5">
        <div className="h-16 max-w-md animate-pulse rounded-2xl bg-[#e2ecfb]" />
        <div className="h-24 animate-pulse rounded-2xl bg-[#e2ecfb]" />
        <div className="h-80 animate-pulse rounded-2xl bg-[#e2ecfb]" />
      </div>
    </div>
  )
}
