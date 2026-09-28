/**
 * Building blocks of the school representative area.
 *
 * They sit on the console design system (`staff/ui-classes.ts`,
 * `staff/status.ts` tones) so the representative, Admin and Staff areas share
 * one palette, one radius scale (16px panels, 12px controls, pill badges) and
 * one button hierarchy. Light theme only; motion is limited to hover/press
 * feedback and a fade for toasts and the dialog.
 */
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2, CircleAlert, Info, Lock, RotateCcw, TriangleAlert, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { ActionGate, RegistrationState, TourState } from '../../../api/contracts/representative'
import type { StatusTone } from '../../staff/status'
import { toneClass } from '../../staff/status'
import { buttonClass } from '../../staff/ui-classes'
import { REGISTRATION_LABEL, TOUR_LABEL } from '../rep-format'
import { panelBase } from '../rep-classes'

/* ── Frame ────────────────────────────────────────────────────────────────── */

export function RepPage({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className="min-h-full px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">
      <div className={`mx-auto w-full ${narrow ? 'max-w-[1040px]' : 'max-w-[1200px]'}`}>{children}</div>
    </div>
  )
}

/** Page title block: optional back link, title, one supporting sentence, badges and one action. */
export function RepPageHeader({ back, title, description, badges, action }: {
  back?: { to: string; label: string }
  title: ReactNode
  description?: ReactNode
  badges?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="mb-7">
      {back && (
        <Link to={back.to} className="mb-4 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-[#475569] transition-colors hover:text-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]">
          <ArrowLeft size={16} aria-hidden="true" />{back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {badges && <div className="mb-2.5 flex flex-wrap items-center gap-2">{badges}</div>}
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-[#0f172a] sm:text-[30px]">{title}</h1>
          {description && <p className="mt-2 max-w-[65ch] text-[15px] leading-relaxed text-[#64748b]">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap gap-2.5">{action}</div>}
      </div>
    </header>
  )
}

/** A titled section card. The title sits inside, the action on its right. */
export function Panel({ title, action, children, className = '', padded = true, id }: {
  title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean; id?: string
}) {
  const autoId = useId()
  const headingId = id ?? autoId
  return (
    <section className={`${panelBase} ${className}`} aria-labelledby={title ? headingId : undefined}>
      {title && (
        <div className={`flex flex-wrap items-center justify-between gap-3 ${padded ? 'px-5 pt-5 sm:px-6' : 'border-b border-[#eef1f5] px-5 py-4 sm:px-6'}`}>
          <h2 id={headingId} className="text-base font-semibold tracking-[-0.01em] text-[#0f172a]">{title}</h2>
          {action}
        </div>
      )}
      <div className={padded ? `px-5 pb-5 sm:px-6 sm:pb-6 ${title ? 'pt-4' : 'pt-5 sm:pt-6'}` : ''}>{children}</div>
    </section>
  )
}

/** Label / value pairs in two columns on wide screens. */
export function InfoList({ items, columns = 2 }: { items: Array<{ label: string; value: ReactNode }>; columns?: 1 | 2 }) {
  return (
    <dl className={`grid gap-x-8 gap-y-4 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[13px] text-[#64748b]">{item.label}</dt>
          <dd className="mt-1 text-[15px] font-medium break-words text-[#0f172a]">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ── Status ───────────────────────────────────────────────────────────────── */

function SoftBadge({ label, tone, size = 'sm' }: { label: string; tone: StatusTone; size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold whitespace-nowrap ${size === 'md' ? 'px-3 py-1 text-[13px]' : 'px-2.5 py-0.5 text-xs'} ${toneClass[tone]}`}>
      {label}
    </span>
  )
}

export function RegistrationStatusBadge({ state, size }: { state: RegistrationState; size?: 'sm' | 'md' }) {
  return <SoftBadge {...REGISTRATION_LABEL[state]} size={size} />
}

export function TourStateBadge({ state, size }: { state: TourState; size?: 'sm' | 'md' }) {
  return <SoftBadge {...TOUR_LABEL[state]} size={size} />
}

/* ── Messages ─────────────────────────────────────────────────────────────── */

const CALLOUT: Record<'info' | 'ok' | 'warn' | 'danger' | 'muted', { box: string; icon: LucideIcon; iconColor: string }> = {
  info: { box: 'border-[#d6e4fb] bg-[#f5f9ff]', icon: Info, iconColor: 'text-[#2563eb]' },
  ok: { box: 'border-[#cde9dc] bg-[#f2fbf6]', icon: CheckCircle2, iconColor: 'text-[#1f7a55]' },
  warn: { box: 'border-[#f0d89f] bg-[#fffaeb]', icon: TriangleAlert, iconColor: 'text-[#b45309]' },
  danger: { box: 'border-[#f5c8c2] bg-[#fff5f3]', icon: CircleAlert, iconColor: 'text-[#b23e31]' },
  muted: { box: 'border-[#e5e9f0] bg-[#f8fafc]', icon: Lock, iconColor: 'text-[#64748b]' },
}

/** An inline message with one optional way forward. */
export function Callout({ tone = 'info', title, children, actions, icon, role }: {
  tone?: keyof typeof CALLOUT; title: ReactNode; children?: ReactNode; actions?: ReactNode; icon?: LucideIcon; role?: 'alert' | 'status'
}) {
  const c = CALLOUT[tone]
  const Icon = icon ?? c.icon
  return (
    <div className={`flex gap-3 rounded-2xl border px-4 py-4 sm:px-5 ${c.box}`} role={role}>
      <Icon size={20} className={`mt-0.5 shrink-0 ${c.iconColor}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-[#0f172a]">{title}</p>
        {children && <div className="mt-1 text-sm leading-relaxed text-[#475569]">{children}</div>}
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ title, description, action, icon: Icon = Info }: { title: string; description?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className={`${panelBase} flex flex-col items-center px-6 py-12 text-center`}>
      <span className="grid size-12 place-items-center rounded-full bg-[#eff6ff] text-[#2563eb]" aria-hidden="true"><Icon size={22} /></span>
      <p className="mt-4 text-base font-semibold text-[#0f172a]">{title}</p>
      {description && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[#64748b]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ title, message, onRetry, back }: { title: string; message: string; onRetry?: () => void; back?: { to: string; label: string } }) {
  return (
    <div className={`${panelBase} flex flex-col items-center px-6 py-12 text-center`} role="alert">
      <span className="grid size-12 place-items-center rounded-full bg-[#fff1ef] text-[#b23e31]" aria-hidden="true"><AlertCircle size={22} /></span>
      <p className="mt-4 text-base font-semibold text-[#0f172a]">{title}</p>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[#64748b]">{message}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        {onRetry && <button type="button" onClick={onRetry} className={buttonClass('secondary')}><RotateCcw size={16} aria-hidden="true" />Thử lại</button>}
        {back && <Link to={back.to} className={buttonClass('secondary')}>{back.label}</Link>}
      </div>
    </div>
  )
}

/** Grey blocks in the shape of what is loading. */
export function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-[#eef1f5] motion-reduce:animate-none ${className}`} />
}

export function PageSkeleton({ label = 'Đang tải' }: { label?: string }) {
  return (
    <RepPage>
      <div aria-busy="true" aria-label={label} className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-2/3 max-w-lg" />
        <Skeleton className="h-4 w-1/2 max-w-md" />
        <div className="grid gap-5 pt-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4"><Skeleton className="h-40 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div>
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      </div>
    </RepPage>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none ${className}`} aria-hidden="true" />
}

/* ── Actions ──────────────────────────────────────────────────────────────── */

/**
 * An action the server may refuse. Allowed: a normal button or link.
 * Refused: the same control, disabled, with the reason underneath, so the
 * representative learns why instead of wondering where the button went.
 */
export function GatedAction({ gate, label, to, onClick, kind = 'secondary', icon: Icon, hint, showReason = true }: {
  gate: ActionGate; label: string; to?: string; onClick?: () => void; kind?: 'primary' | 'secondary' | 'danger'; icon?: LucideIcon; hint?: string
  /** Off when the page already states the one shared reason (e.g. the Tour is locked). */
  showReason?: boolean
}) {
  const reasonId = useId()
  const cls = `${buttonClass(kind, 'lg')} w-full`
  const inner = <>{Icon && <Icon size={17} aria-hidden="true" />}{label}</>
  return (
    <div>
      {gate.allowed && to ? (
        <Link to={to} className={cls}>{inner}</Link>
      ) : (
        <button type="button" className={cls} onClick={onClick} disabled={!gate.allowed} aria-describedby={!gate.allowed && gate.reason && showReason ? reasonId : undefined}>{inner}</button>
      )}
      {!gate.allowed && gate.reason && showReason ? (
        <p id={reasonId} className="mt-2 flex gap-1.5 text-[13px] leading-snug text-[#64748b]"><Lock size={13} className="mt-0.5 shrink-0" aria-hidden="true" />{gate.reason}</p>
      ) : hint && gate.allowed ? (
        <p className="mt-2 text-[13px] leading-snug text-[#64748b]">{hint}</p>
      ) : null}
    </div>
  )
}

/* ── Feedback ─────────────────────────────────────────────────────────────── */

export type ToastMessage = { text: string; tone?: 'ok' | 'danger' }

export function Toast({ message, onDone }: { message: ToastMessage | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(onDone, 3600)
    return () => window.clearTimeout(id)
  }, [message, onDone])
  if (!message) return null
  const danger = message.tone === 'danger'
  const Icon = danger ? CircleAlert : CheckCircle2
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6" role={danger ? 'alert' : 'status'}>
      <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border border-[#e5e9f0] bg-white px-4 py-3 text-sm text-[#0f172a] shadow-[0_12px_32px_-12px_rgba(15,23,42,0.28)] transition-[opacity,translate] duration-200 starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none">
        <Icon size={18} className={`mt-0.5 shrink-0 ${danger ? 'text-[#b23e31]' : 'text-[#1f7a55]'}`} aria-hidden="true" />
        <span className="leading-relaxed">{message.text}</span>
        <button type="button" onClick={onDone} className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#475569]" aria-label="Đóng thông báo"><X size={14} /></button>
      </div>
    </div>
  )
}

/** Confirmation for a destructive action. Focus starts on the safe choice; Escape closes. */
export function ConfirmationDialog({ open, title, children, confirmLabel, cancelLabel = 'Quay lại', busy, onConfirm, onClose }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; cancelLabel?: string; busy?: boolean; onConfirm: () => void; onClose: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open, busy, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-[#0f172a]/30 p-4 backdrop-blur-[2px] sm:place-items-center" onClick={() => !busy && onClose()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_48px_-16px_rgba(15,23,42,0.35)] transition-[opacity,translate] duration-200 starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-[#0f172a]">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-[#475569]">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" className={buttonClass('secondary')} onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button type="button" className={buttonClass('danger')} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner />}{busy ? 'Đang xử lý...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
