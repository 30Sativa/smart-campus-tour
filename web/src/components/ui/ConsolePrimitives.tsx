import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ChevronRight, LoaderCircle, Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { buttonClass, inputClass } from './ui-classes'



export const panelClass =
  // `ct-panel` is a hook, not a style: the Staff shell turns it into a Purity card.
  'ct-panel overflow-hidden rounded-xl border border-[#e2e8f0] bg-white transition-[box-shadow,border-color] duration-200'



/**
 * The page's own heading, kept to a few lines so the work starts high on the
 * screen: a short context line, the title, one supporting sentence, and the
 * page's actions on the right. `scale` is kept for callers; both read the same.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
  scale?: 'default' | 'console'
}) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-[#2d719e]">{eyebrow}</p>
        <h1 className="mt-1 text-2xl leading-tight font-bold tracking-[-0.025em] text-[#0f172a] sm:text-[28px]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#64748b]">{description}</p>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  )
}



export function LoadingPanel({ label = 'Đang tải dữ liệu vận hành…' }: { label?: string }) {
  return (
    <div
      className={`${panelClass} flex min-h-40 items-center justify-center gap-2.5 p-6 text-[13px] font-semibold text-[#64748b]`}
      aria-busy="true"
    >
      <LoaderCircle className="animate-spin text-[#2d719e]" size={18} />
      {label}
    </div>
  )
}



export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-[#64748b]">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-semibold break-words text-[#0f172a]">{children}</dd>
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
    <div role="group" aria-label={label} className="flex gap-1.5 overflow-x-auto py-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-[background-color,color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${
            value === option.value
              ? 'border-[#173b59] bg-[#173b59] text-white'
              : 'border-[#e2e8f0] bg-white text-[#334155] hover:border-[#cbd5e1] hover:text-[#0f172a]'
          }`}
        >
          {option.label}
          {option.count != null && (
            <span
              className={`text-[11px] font-semibold tabular-nums ${
                value === option.value ? 'text-white/80' : 'text-[#94a3b8]'
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
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#f1f8fe] text-[#2d719e]"
        aria-hidden="true"
      >
        <Icon size={16} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl leading-tight font-bold tracking-[-0.01em] text-[#0f172a] tabular-nums">
          {value}
        </span>
        <span className="block truncate text-[11.5px] text-[#64748b]">{label}</span>
        {hint && <span className="block text-[11px] leading-4 text-[#94a3b8]">{hint}</span>}
      </span>
    </>
  )

  const shape =
    'flex items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left transition-colors duration-200'

  if (!onSelect) return <div className={`${shape} border-[#e2e8f0]`}>{body}</div>

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`${shape} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] ${
        selected
          ? 'border-[#2d719e] bg-[#f1f8fe] ring-1 ring-[#2d719e]'
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
      className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#f1f8fe] text-[#2d719e]"
      aria-hidden="true"
    >
      <Icon size={15} strokeWidth={2} />
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef1f4] px-3.5 py-2.5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-[#0f172a]">{title}</h2>
        {description && <p className="text-[11.5px] text-[#64748b]">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}



export function PageSkeleton() {
  return (
    <div
      className="flex flex-1 items-start justify-center bg-[#f6f7f9] px-4 py-5 lg:px-8"
      aria-busy="true"
      aria-label="Đang tải trang"
    >
      <div className="w-full max-w-[1500px] space-y-4">
        <div className="h-12 max-w-md animate-pulse rounded-xl bg-[#e2e8f0]" />
        <div className="h-16 animate-pulse rounded-xl bg-[#e2e8f0]" />
        <div className="h-72 animate-pulse rounded-xl bg-[#e2e8f0]" />
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
export function StatTile({ to, onClick, pressed, icon: Icon, label, value, hint, tone }: { to?: string; onClick?: () => void; pressed?: boolean; icon: LucideIcon; label: string; value: ReactNode; hint?: string; tone?: keyof typeof STAT_TONE }) {
  const active = tone && typeof value === 'number' && value > 0
  const body = (
    <>
      <span className={`flex items-center gap-1.5 text-[11.5px] ${active ? STAT_TONE[tone] : 'text-[#64748b]'}`}><Icon size={13} aria-hidden="true" />{label}</span>
      <span className={`block text-xl leading-tight font-bold tracking-[-0.01em] tabular-nums transition-colors duration-300 ${active ? STAT_TONE[tone] : 'text-[#0f172a]'}`}>{value}</span>
      {hint && <span className="block truncate text-[11.5px] text-[#94a3b8]">{hint}</span>}
    </>
  )
  const shape = 'block min-w-0 bg-white px-3.5 py-2.5'
  if (onClick) return <button type="button" onClick={onClick} aria-pressed={pressed} className={`${shape} w-full cursor-pointer text-left transition-[background-color,box-shadow] duration-150 hover:bg-[#fafcfe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b9dc9] ${pressed ? 'shadow-[inset_0_-2px_0_#2d719e]' : ''}`}>{body}</button>
  if (!to) return <div className={shape}>{body}</div>
  return <Link to={to} className={`${shape} transition-colors duration-150 hover:bg-[#fafcfe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b9dc9]`}>{body}</Link>
}



export function StatStrip({ label, children, columns = 'sm:grid-cols-3 xl:grid-cols-6' }: { label: string; children: ReactNode; columns?: string }) {
  // One panel, cells split by hairlines: the eye reads the row as one line of figures.
  return <section aria-label={label} className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#e2e8f0] bg-[#eef1f4] ${columns}`}>{children}</section>
}



/** A section title that sits above its panel, so the panel itself carries no header chrome. */
export function SectionHeading({ title, note, action }: { title: string; note?: string; action?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#0f172a]">{title}</h2>
        {note && <p className="truncate text-xs text-[#94a3b8]">{note}</p>}
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
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[#94a3b8]" aria-hidden="true" />
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`${inputClass} pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden`} />
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
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef1f4] px-3 py-2">
      <p className="text-xs text-[#64748b]"><span className="font-semibold text-[#1e293b] tabular-nums">{from}-{to}</span> trên <span className="tabular-nums">{total}</span></p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className={buttonClass('ghost', 'sm')} aria-label="Trang trước"><ChevronLeft size={16} aria-hidden="true" /></button>
        {pageWindow(page, pageCount).map((n, i) => n == null ? <span key={`gap-${i}`} className="px-1 text-[13px] text-[#94a3b8]" aria-hidden="true">…</span> : (
          <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined} className={`grid size-7 place-items-center rounded-[7px] border text-xs font-medium tabular-nums transition-colors ${n === page ? 'border-[#173b59] bg-[#173b59] text-white' : 'border-[#e2e8f0] bg-white text-[#475569] hover:bg-[#f1f5f9]'}`}>{n}</button>
        ))}
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pageCount} className={buttonClass('ghost', 'sm')} aria-label="Trang sau"><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
    </nav>
  )
}
