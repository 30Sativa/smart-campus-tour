import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router'
import type { RegistrationState, TourState } from '../../../api/contracts/representative'
import { REGISTRATION_LABEL, TOUR_LABEL } from '../rep-format'
import type { Tone } from '../rep-format'

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`rp-chip rp-chip--${tone}`}><i aria-hidden="true" />{children}</span>
}

export function RegistrationChip({ state }: { state: RegistrationState }) {
  const s = REGISTRATION_LABEL[state]
  return <Chip tone={s.tone}>{s.label}</Chip>
}

export function TourChip({ state }: { state: TourState }) {
  const s = TOUR_LABEL[state]
  return <Chip tone={s.tone}>{s.label}</Chip>
}

type PillProps = { children: ReactNode; to?: string; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit'; light?: boolean; block?: boolean; busy?: boolean }

/** Pill button with the lime arrow circle, like the home page. */
export function Pill({ children, to, onClick, disabled, type = 'button', light, block, busy }: PillProps) {
  const cls = ['rp-btn', light ? 'rp-btn--light' : '', block ? 'rp-btn--block' : ''].filter(Boolean).join(' ')
  const inner = (
    <>
      <span>{children}</span>
      <span className="rp-btn__ic" aria-hidden="true">{busy ? <span className="rp-spinner" /> : <ArrowUpRight size={18} />}</span>
    </>
  )
  if (to && !disabled) return <Link to={to} className={cls}>{inner}</Link>
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled || busy}>
      {inner}
    </button>
  )
}

export function Loading({ label = 'Đang tải dữ liệu...' }: { label?: string }) {
  return (
    <div className="rp-loading" role="status">
      <span className="rp-spinner" />
      <span>{label}</span>
    </div>
  )
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(onDone, 3200)
    return () => window.clearTimeout(id)
  }, [message, onDone])
  if (!message) return null
  return (
    <div className="rp-toast" role="status">
      <CheckCircle2 size={16} />
      {message}
    </div>
  )
}

type ConfirmProps = {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  busy?: boolean
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ open, title, children, confirmLabel, busy, danger, onConfirm, onClose }: ConfirmProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])
  if (!open) return null
  return (
    <div className="rp-dialog-bg" onClick={() => !busy && onClose()}>
      <div className="rp-dialog" role="dialog" aria-modal="true" aria-labelledby="rp-dialog-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="rp-dialog-title">{title}</h2>
        {children}
        <div className="rp-dialog__actions">
          <button type="button" className="rp-chip-btn" onClick={onClose} disabled={busy}>Quay lại</button>
          <button type="button" className={danger ? 'rp-chip-btn rp-chip-btn--dark rp-chip-btn--danger' : 'rp-chip-btn rp-chip-btn--dark'} onClick={onConfirm} disabled={busy}>
            {busy ? <span className="rp-spinner" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
