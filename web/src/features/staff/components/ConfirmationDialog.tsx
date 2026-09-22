import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { buttonClass } from '../ui-classes'

/**
 * Shared focus behaviour for the console's overlays: focus moves in on open,
 * Escape closes, focus returns to the opener on close. Deliberately small; the
 * dialogs are short and have a Cancel button as their first control.
 */
function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    panelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus()
    }
  }, [open])
  return panelRef
}

const scrim = 'fixed inset-0 bg-[#0f172a]/25 backdrop-blur-[2px] transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none'

/**
 * Every operational action that ends, overrides or re-routes something goes
 * through here (web/AGENTS.md §7). `requireReason` makes the note mandatory,
 * which is what the audit log needs for End early and Reassign.
 */
export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'default',
  requireReason = false,
  reasonLabel = 'Lý do / ghi chú',
  withReason = true,
  reasonPlaceholder = 'Ghi lại để đồng nghiệp và nhật ký vận hành hiểu vì sao…',
  busyLabel = 'Đang gửi…',
  busy = false,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  tone?: 'default' | 'danger'
  requireReason?: boolean
  reasonLabel?: string
  /** False for a decision that needs no note (e.g. approving a group). */
  withReason?: boolean
  reasonPlaceholder?: string
  busyLabel?: string
  busy?: boolean
  error?: string | null
  onConfirm: (reason: string) => void
  onCancel: () => void
  children?: ReactNode
}) {
  const [reason, setReason] = useState('')
  const titleId = useId()
  const reasonId = useId()
  const close = () => {
    setReason('')
    onCancel()
  }
  const panelRef = useOverlay(open, close)
  if (!open) return null
  const missingReason = withReason && requireReason && !reason.trim()
  const danger = tone === 'danger'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className={scrim} onClick={close} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-[0_20px_48px_rgba(31,49,77,0.18)] transition-[opacity,transform] duration-200 ease-out starting:translate-y-2 starting:scale-[0.98] starting:opacity-0 motion-reduce:transition-none focus-visible:outline-none"
      >
        <div className="flex items-start gap-3">
          {danger && (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff1ef] text-[#b23e31]" aria-hidden="true">
              <TriangleAlert size={20} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold tracking-[-0.015em] text-[#0f172a]">{title}</h2>
            <div className="mt-1.5 text-sm leading-6 text-[#64748b]">{description}</div>
          </div>
        </div>
        {children && <div className="mt-5">{children}</div>}
        {withReason && (
          <>
            <label htmlFor={reasonId} className="mt-5 block text-[13px] font-medium text-[#334155]">
              {reasonLabel}{requireReason ? ' (bắt buộc)' : ' (tùy chọn)'}
            </label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder={reasonPlaceholder}
              className="mt-2 w-full rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm text-[#334155] outline-none placeholder:text-[#94a3b8] focus:border-[#6ba0ff] focus:ring-2 focus:ring-[#2563eb]/20"
            />
          </>
        )}
        {error && <p role="alert" className="mt-3 rounded-xl border border-[#f5c8c2] bg-[#fff1ef] px-3 py-2 text-sm font-semibold text-[#b23e31]">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} className={buttonClass('secondary')}>Quay lại</button>
          <button
            type="button"
            disabled={busy || missingReason}
            onClick={() => onConfirm(reason.trim())}
            className={danger ? `${buttonClass('secondary')} !border-[#c9534a] !bg-[#c9534a] !text-white hover:!bg-[#b23e31] disabled:!opacity-50` : buttonClass('primary')}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** A right-hand sheet for a task with its own steps, e.g. choosing a replacement robot. */
export function Drawer({ open, title, description, onClose, children, footer, wide = false }: {
  open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  const titleId = useId()
  const panelRef = useOverlay(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className={scrim} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`absolute top-0 right-0 z-10 flex h-full w-full flex-col ${wide ? 'max-w-2xl' : 'max-w-md'} border-l border-[#e2e8f0] bg-white shadow-[-24px_0_64px_rgba(31,49,77,0.18)] transition-transform duration-300 ease-out starting:translate-x-full motion-reduce:transition-none focus-visible:outline-none`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#f1f5f9] px-6 py-5">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-[-0.015em] text-[#0f172a]">{title}</h2>
            {description && <p className="mt-1 text-sm leading-6 text-[#64748b]">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid size-9 shrink-0 place-items-center rounded-xl text-[#94a3b8] hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-[#f1f5f9] px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}
