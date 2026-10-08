/**
 * Building blocks of the school representative area.
 *
 * They follow the public Home's language (landing header, numbered kickers,
 * pill buttons, route-shaped progress); every colour is a --rep-* token from
 * representative.css, so the area follows the app's light/dark switch.
 * Motion is CSS only and stops for reduced motion.
 */
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2, CircleAlert, Info, Lock, RotateCcw, TriangleAlert, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { ActionGate, RegistrationState, TourState } from '../api/types'
import type { StatusTone } from '../../../components/ui/status-tone'
import { REGISTRATION_LABEL, TOUR_LABEL } from '../rep-format'
import { repButton } from '../rep-classes'

/* ── Frame ────────────────────────────────────────────────────────────────── */

export function RepPage({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className="rep-page">
      <div className={`rep-wrap rep-view${narrow ? ' rep-wrap--narrow' : ''}`}>{children}</div>
    </div>
  )
}

/** Page title block: optional back link, kicker, title, one supporting sentence, badges and actions. */
export function RepPageHeader({ back, kicker, title, description, badges, action }: {
  back?: { to: string; label: string }
  kicker?: ReactNode
  title: ReactNode
  description?: ReactNode
  badges?: ReactNode
  action?: ReactNode
}) {
  return (
    <>
      {back && <Link to={back.to} className="rep-back"><ArrowLeft size={16} aria-hidden="true" />{back.label}</Link>}
      <header className="rep-header">
        <div className="rep-header-copy">
          {kicker && <span className="rep-kicker">{kicker}</span>}
          {badges && <div className="rep-badges">{badges}</div>}
          <h1 className="rep-title">{title}</h1>
          {description && <p className="rep-lead">{description}</p>}
        </div>
        {action && <div className="rep-header-actions">{action}</div>}
      </header>
    </>
  )
}

/** A numbered section in the landing's "01 / …" style. */
export function RepSection({ kicker, title, action, children, id }: { kicker: string; title: string; action?: ReactNode; children: ReactNode; id?: string }) {
  const autoId = useId()
  const headingId = id ?? autoId
  return (
    <section className="rep-section" aria-labelledby={headingId}>
      <div className="rep-section-head">
        <div><span className="rep-kicker">{kicker}</span><h2 id={headingId}>{title}</h2></div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** A titled section card. The title sits inside, the action on its right. */
export function Panel({ title, action, children, className = '', padded = true, id }: {
  title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean; id?: string
}) {
  const autoId = useId()
  const headingId = id ?? autoId
  return (
    <section className={`rep-panel ${className}`} aria-labelledby={title ? headingId : undefined}>
      {title && (
        <div className="rep-panel-head">
          <h2 id={headingId}>{title}</h2>
          {action}
        </div>
      )}
      <div className={padded ? 'rep-panel-body' : 'rep-panel-body rep-panel-body--flush'}>{children}</div>
    </section>
  )
}

/** Label / value pairs in two columns on wide screens. */
export function InfoList({ items, columns = 2 }: { items: Array<{ label: string; value: ReactNode }>; columns?: 1 | 2 }) {
  return (
    <dl className={`rep-info${columns === 2 ? ' rep-info--two' : ''}`}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ── Status ───────────────────────────────────────────────────────────────── */

function SoftBadge({ label, tone, size = 'sm' }: { label: string; tone: StatusTone; size?: 'sm' | 'md' }) {
  return <span className={`rep-badge rep-badge--${tone}${size === 'md' ? ' rep-badge--md' : ''}`}>{label}</span>
}

export function RegistrationStatusBadge({ state, size }: { state: RegistrationState; size?: 'sm' | 'md' }) {
  return <SoftBadge {...REGISTRATION_LABEL[state]} size={size} />
}

export function TourStateBadge({ state, size }: { state: TourState; size?: 'sm' | 'md' }) {
  // A Tour that still takes registrations wears the lime of the primary action.
  if (state === 'SCHEDULED') return <span className={`rep-badge rep-badge--open${size === 'md' ? ' rep-badge--md' : ''}`}>{TOUR_LABEL[state].label}</span>
  return <SoftBadge {...TOUR_LABEL[state]} size={size} />
}

/* ── Messages ─────────────────────────────────────────────────────────────── */

const CALLOUT_ICON: Record<'info' | 'ok' | 'warn' | 'danger' | 'muted', LucideIcon> = {
  info: Info, ok: CheckCircle2, warn: TriangleAlert, danger: CircleAlert, muted: Lock,
}

/** An inline message with one optional way forward. */
export function Callout({ tone = 'info', title, children, actions, icon, role }: {
  tone?: keyof typeof CALLOUT_ICON; title: ReactNode; children?: ReactNode; actions?: ReactNode; icon?: LucideIcon; role?: 'alert' | 'status'
}) {
  const Icon = icon ?? CALLOUT_ICON[tone]
  return (
    <div className={`rep-callout rep-callout--${tone}`} role={role}>
      <Icon size={20} aria-hidden="true" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="rep-callout-title">{title}</p>
        {children && <div className="rep-callout-body">{children}</div>}
        {actions && <div className="rep-callout-actions">{actions}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ title, description, action, icon: Icon = Info }: { title: string; description?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rep-state">
      <span className="rep-state-icon" aria-hidden="true"><Icon size={22} /></span>
      <p className="rep-state-title">{title}</p>
      {description && <p className="rep-state-text">{description}</p>}
      {action && <div className="rep-state-actions">{action}</div>}
    </div>
  )
}

export function ErrorState({ title, message, onRetry, back }: { title: string; message: string; onRetry?: () => void; back?: { to: string; label: string } }) {
  return (
    <div className="rep-state rep-state--error" role="alert">
      <span className="rep-state-icon" aria-hidden="true"><AlertCircle size={22} /></span>
      <p className="rep-state-title">{title}</p>
      <p className="rep-state-text">{message}</p>
      <div className="rep-state-actions">
        {onRetry && <button type="button" onClick={onRetry} className={repButton('secondary')}><RotateCcw size={16} aria-hidden="true" />Thử lại</button>}
        {back && <Link to={back.to} className={repButton('secondary')}>{back.label}</Link>}
      </div>
    </div>
  )
}

/** Shimmering blocks in the shape of what is loading. */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`rep-skel ${className}`} style={style} />
}

export function PageSkeleton({ label = 'Đang tải' }: { label?: string }) {
  return (
    <RepPage>
      <div aria-busy="true" aria-label={label} style={{ display: 'grid', gap: 16 }}>
        <Skeleton style={{ height: 14, width: 140 }} />
        <Skeleton style={{ height: 52, width: 'min(560px, 80%)' }} />
        <Skeleton style={{ height: 16, width: 'min(420px, 60%)' }} />
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', paddingTop: 16 }}>
          <Skeleton style={{ height: 320, borderRadius: 26 }} /><Skeleton style={{ height: 320, borderRadius: 26 }} /><Skeleton style={{ height: 320, borderRadius: 26 }} />
        </div>
      </div>
    </RepPage>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`rep-spin ${className}`} aria-hidden="true" />
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
  const cls = repButton(kind, 'lg', true)
  const inner = <>{Icon && <Icon size={17} aria-hidden="true" />}{label}</>
  return (
    <div>
      {gate.allowed && to ? (
        <Link to={to} className={cls}>{inner}</Link>
      ) : (
        <button type="button" className={cls} onClick={onClick} disabled={!gate.allowed} aria-describedby={!gate.allowed && gate.reason && showReason ? reasonId : undefined}>{inner}</button>
      )}
      {!gate.allowed && gate.reason && showReason ? (
        <p id={reasonId} className="rep-gate-reason"><Lock size={13} aria-hidden="true" />{gate.reason}</p>
      ) : hint && gate.allowed ? (
        <p className="rep-hint" style={{ marginTop: 8 }}>{hint}</p>
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
    <div className="pointer-events-none fixed inset-x-4 bottom-6 z-50 flex justify-center sm:inset-x-auto sm:right-6" role={danger ? 'alert' : 'status'}>
      <div className={`rep-callout rep-callout--${danger ? 'danger' : 'ok'} pointer-events-auto`} style={{ maxWidth: 420, boxShadow: '0 20px 40px -20px var(--rep-shadow)' }}>
        <Icon size={18} aria-hidden="true" />
        <span style={{ flex: 1, fontSize: 14 }}>{message.text}</span>
        <button type="button" onClick={onDone} className="rep-icon-btn" style={{ width: 26, height: 26 }} aria-label="Đóng thông báo"><X size={14} /></button>
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
    <div className="fixed inset-0 z-50 grid place-items-end p-4 sm:place-items-center" style={{ background: 'rgba(4, 25, 26, .45)', backdropFilter: 'blur(3px)' }} onClick={() => !busy && onClose()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="rep-panel rep-view"
        style={{ width: '100%', maxWidth: 440, padding: 26 }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} style={{ fontSize: '1.2rem', fontWeight: 750, letterSpacing: '-.03em' }}>{title}</h2>
        <div className="rep-lead" style={{ marginTop: 8, fontSize: 14 }}>{children}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button ref={cancelRef} type="button" className={repButton('secondary')} onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button type="button" className={repButton('danger')} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner />}{busy ? 'Đang xử lý...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
