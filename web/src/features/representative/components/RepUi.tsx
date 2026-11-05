import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2, CircleAlert, Info, Lock, RotateCcw, TriangleAlert, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { ActionGate, RegistrationState, TourState } from '../api/types'
import type { StatusTone } from '../../../components/ui/status-tone'
import { REGISTRATION_STATE_LABEL } from '../../registrations/registration-state'
import { TOUR_LABEL } from '../rep-format'
import { repButton } from '../rep-classes'

export function RepPage({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return <div className="rep-page"><div className={`rep-wrap rep-view${narrow ? ' rep-wrap--narrow' : ''}`}>{children}</div></div>
}

export function RepPageHeader({ back, title, description, badges, action }: {
  back?: { to: string; label: string }; kicker?: ReactNode; title: ReactNode; description?: ReactNode; badges?: ReactNode; action?: ReactNode
}) {
  return <>
    {back && <Link to={back.to} className="rep-back"><ArrowLeft size={16} aria-hidden="true" />{back.label}</Link>}
    <header className="rep-header"><div className="rep-header-copy"><h1 className="rep-title">{title}</h1>{description && <p className="rep-lead">{description}</p>}{badges && <div className="rep-badges">{badges}</div>}</div>{action && <div className="rep-header-actions">{action}</div>}</header>
  </>
}

export function RepSection({ title, action, children, id }: { kicker?: string; title: string; action?: ReactNode; children: ReactNode; id?: string }) {
  const autoId = useId()
  const headingId = id ?? autoId
  return <section className="rep-section" aria-labelledby={headingId}><div className="rep-section-head"><h2 id={headingId}>{title}</h2>{action}</div>{children}</section>
}

export function Panel({ title, action, children, className = '', padded = true, id }: {
  title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean; id?: string
}) {
  const autoId = useId()
  const headingId = id ?? autoId
  return <section className={`rep-panel ${className}`} aria-labelledby={title ? headingId : undefined}>{title && <div className="rep-panel-head"><h2 id={headingId}>{title}</h2>{action}</div>}<div className={padded ? 'rep-panel-body' : 'rep-panel-body rep-panel-body--flush'}>{children}</div></section>
}

export function InfoList({ items, columns = 2 }: { items: Array<{ label: string; value: ReactNode }>; columns?: 1 | 2 }) {
  return <dl className={`rep-info${columns === 2 ? ' rep-info--two' : ''}`}>{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
}

function SoftBadge({ label, tone, size = 'sm' }: { label: string; tone: StatusTone; size?: 'sm' | 'md' }) {
  return <span className={`rep-badge rep-badge--${tone}${size === 'md' ? ' rep-badge--md' : ''}`}>{label}</span>
}
export function RegistrationStatusBadge({ state, size }: { state: RegistrationState; size?: 'sm' | 'md' }) {
  return <SoftBadge {...REGISTRATION_STATE_LABEL[state]} label={state === 'APPROVED' ? 'Có dòng đã duyệt' : REGISTRATION_STATE_LABEL[state].label} size={size} />
}
export function TourStateBadge({ state, size }: { state: TourState; size?: 'sm' | 'md' }) {
  return <SoftBadge {...TOUR_LABEL[state]} size={size} />
}

const CALLOUT_ICON: Record<'info' | 'ok' | 'warn' | 'danger' | 'muted', LucideIcon> = { info: Info, ok: CheckCircle2, warn: TriangleAlert, danger: CircleAlert, muted: Lock }
export function Callout({ tone = 'info', title, children, actions, icon, role }: {
  tone?: keyof typeof CALLOUT_ICON; title: ReactNode; children?: ReactNode; actions?: ReactNode; icon?: LucideIcon; role?: 'alert' | 'status'
}) {
  const Icon = icon ?? CALLOUT_ICON[tone]
  return <div className={`rep-callout rep-callout--${tone}`} role={role}><Icon size={20} aria-hidden="true" /><div className="rep-callout-content"><p className="rep-callout-title">{title}</p>{children && <div className="rep-callout-body">{children}</div>}{actions && <div className="rep-callout-actions">{actions}</div>}</div></div>
}
export function EmptyState({ title, description, action, icon: Icon = Info }: { title: string; description?: string; action?: ReactNode; icon?: LucideIcon }) {
  return <div className="rep-state"><Icon className="rep-state-icon" size={26} aria-hidden="true" /><p className="rep-state-title">{title}</p>{description && <p className="rep-state-text">{description}</p>}{action && <div className="rep-state-actions">{action}</div>}</div>
}
export function ErrorState({ title, message, onRetry, back }: { title: string; message: string; onRetry?: () => void; back?: { to: string; label: string } }) {
  return <div className="rep-state rep-state--error" role="alert"><AlertCircle className="rep-state-icon" size={26} aria-hidden="true" /><p className="rep-state-title">{title}</p><p className="rep-state-text">{message}</p><div className="rep-state-actions">{onRetry && <button type="button" onClick={onRetry} className={repButton('secondary')}><RotateCcw size={16} aria-hidden="true" />Thử lại</button>}{back && <Link to={back.to} className={repButton('secondary')}>{back.label}</Link>}</div></div>
}
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`rep-skel ${className}`} style={style} />
}
export function PageSkeleton({ label = 'Đang tải' }: { label?: string }) {
  return <RepPage><div className="rep-page-skeleton" aria-busy="true" aria-label={label}><p className="rep-sr-only" role="status">Đang tải dữ liệu…</p><Skeleton className="rep-skel-title" /><Skeleton className="rep-skel-lead" /><div className="rep-skeleton-rows"><Skeleton /><Skeleton /><Skeleton /></div></div></RepPage>
}
export function Spinner({ className = '' }: { className?: string }) { return <span className={`rep-spin ${className}`} aria-hidden="true" /> }
export function GatedAction({ gate, label, to, onClick, kind = 'secondary', icon: Icon, hint, showReason = true }: {
  gate: ActionGate; label: string; to?: string; onClick?: () => void; kind?: 'primary' | 'secondary' | 'danger'; icon?: LucideIcon; hint?: string; showReason?: boolean
}) {
  const reasonId = useId()
  const cls = repButton(kind, 'md', true)
  const inner = <>{Icon && <Icon size={17} aria-hidden="true" />}{label}</>
  return <div className="rep-gated-action">{gate.allowed && to ? <Link to={to} className={cls}>{inner}</Link> : <button type="button" className={cls} onClick={onClick} disabled={!gate.allowed} aria-describedby={!gate.allowed && gate.reason && showReason ? reasonId : undefined}>{inner}</button>}{!gate.allowed && gate.reason && showReason ? <p id={reasonId} className="rep-gate-reason"><Lock size={13} aria-hidden="true" />{gate.reason}</p> : hint && gate.allowed ? <p className="rep-hint">{hint}</p> : null}</div>
}
export type ToastMessage = { text: string; tone?: 'ok' | 'danger' }
export function Toast({ message, onDone }: { message: ToastMessage | null; onDone: () => void }) {
  useEffect(() => { if (!message) return; const id = window.setTimeout(onDone, 3600); return () => window.clearTimeout(id) }, [message, onDone])
  if (!message) return null
  const danger = message.tone === 'danger'
  const Icon = danger ? CircleAlert : CheckCircle2
  return <div className="rep-toast" role={danger ? 'alert' : 'status'}><div className={`rep-callout rep-callout--${danger ? 'danger' : 'ok'}`}><Icon size={18} aria-hidden="true" /><span>{message.text}</span><button type="button" onClick={onDone} className="rep-icon-btn" aria-label="Đóng thông báo"><X size={14} aria-hidden="true" /></button></div></div>
}

export function ConfirmationDialog({ open, title, children, confirmLabel, cancelLabel = 'Quay lại', busy, onConfirm, onClose }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; cancelLabel?: string; busy?: boolean; onConfirm: () => void; onClose: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => { closeRef.current = onClose; busyRef.current = busy }, [onClose, busy])
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!busyRef.current) closeRef.current(); return }
      if (event.key !== 'Tab') return
      const targets = panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')
      if (!targets?.length) { event.preventDefault(); panelRef.current?.focus(); return }
      const first = targets[0], last = targets[targets.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); if (opener && document.contains(opener)) opener.focus() }
  }, [open])
  if (!open) return null
  return <div className="rep-dialog-overlay" onClick={() => !busy && onClose()}><div ref={panelRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="rep-dialog" onClick={event => event.stopPropagation()}><h2 id={titleId}>{title}</h2><div id={descriptionId} className="rep-dialog-description">{children}</div><div className="rep-inline-actions rep-dialog-actions"><button ref={cancelRef} type="button" className={repButton('secondary')} onClick={onClose} disabled={busy}>{cancelLabel}</button><button type="button" className={repButton('danger')} onClick={onConfirm} disabled={busy}>{busy && <Spinner />}{busy ? 'Đang xử lý…' : confirmLabel}</button></div></div></div>
}
