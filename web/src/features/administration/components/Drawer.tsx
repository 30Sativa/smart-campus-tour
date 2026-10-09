import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    panelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current() }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus()
    }
  }, [open])
  return panelRef
}

const scrim = 'fixed inset-0 bg-[#0f172a]/25 backdrop-blur-[2px] transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none'

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
