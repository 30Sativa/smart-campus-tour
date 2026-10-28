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

const scrim = 'fixed inset-0 bg-[#0f172a]/35 backdrop-blur-[2px] transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none'

/** A task or a record opened in the middle of the page, the page dimmed behind it. */
export function Drawer({ open, title, description, onClose, children, footer, wide = false }: {
  open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  const titleId = useId()
  const panelRef = useOverlay(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-6">
      <div className={scrim} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-24px_rgba(15,23,42,0.5)] transition-[opacity,scale] duration-200 ease-out starting:scale-[0.98] starting:opacity-0 motion-reduce:transition-none focus-visible:outline-none sm:max-h-[calc(100dvh-3rem)] ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#eef1f4] px-5 py-3.5">
          <div>
            <h2 id={titleId} className="text-base font-semibold tracking-[-0.015em] text-[#0f172a]">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] leading-5 text-[#64748b]">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid size-8 shrink-0 place-items-center rounded-lg text-[#94a3b8] hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-[#eef1f4] px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}
