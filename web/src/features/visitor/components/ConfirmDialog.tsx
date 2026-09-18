import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/** Native modal semantics keep focus inside, restore the trigger, and handle Escape. */
export function ConfirmDialog({ open, title, children, confirmLabel, pending = false, error, onConfirm, onClose }: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  pending?: boolean
  error?: string
  onConfirm: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog?.open) dialog?.showModal()
    if (!open && dialog?.open) dialog.close()
  }, [open])

  return <dialog ref={ref} className="vs-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={(event) => { event.preventDefault(); if (!pending) onClose() }}>
    <div className="vs-row vs-row--center"><h2 className="vs-h3" id={`${id}-title`}>{title}</h2><button type="button" className="vs-iconbtn" aria-label="Close confirmation" onClick={onClose} disabled={pending}><X size={18} /></button></div>
    <div id={`${id}-description`} className="vs-lead">{children}</div>
    {error && <p className="auth-alert" role="alert">{error}</p>}
    <div className="vs-card__foot"><button type="button" className="lp-btn lp-btn--ghost" onClick={onClose} disabled={pending} autoFocus>Go back</button><button type="button" className="lp-btn lp-btn--solid" onClick={onConfirm} disabled={pending} aria-busy={pending}>{pending ? <><span className="auth-spinner" aria-hidden="true" />Working…</> : confirmLabel}</button></div>
  </dialog>
}
