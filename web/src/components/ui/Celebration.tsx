import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { X } from 'lucide-react'
import { Link } from 'react-router'
import { useToastStore, type Toast } from './toast-store'

/** How long a celebration stays; pointing at it or focusing it holds it. */
const DURATION = 4500
const LEAVE_MS = 220

/*
 * The burst: a fixed set of paper pieces spread on the golden angle, so every
 * celebration looks the same and render stays pure (no Math.random). Colours
 * are the console blue family plus one green and one amber accent.
 */
const COLORS = ['#2d719e', '#5b9dc9', '#8cc6ea', '#173b59', '#1f9d63', '#f2b33d']
const PIECES = Array.from({ length: 30 }, (_, index) => {
  const angle = (index * 137.508 * Math.PI) / 180
  const distance = 96 + ((index * 37) % 84)
  return {
    style: {
      '--dx': `${Math.round(Math.cos(angle) * distance)}px`,
      '--dy': `${Math.round(Math.sin(angle) * distance * 0.8 - 26)}px`,
      '--rot': `${(index * 53) % 360}deg`,
      background: COLORS[index % COLORS.length],
      width: index % 3 === 0 ? 6 : 8,
      height: index % 3 === 0 ? 11 : 6,
      borderRadius: index % 4 === 0 ? 999 : 2,
      animationDelay: `${(index % 6) * 22}ms`,
    } as CSSProperties,
  }
})

/**
 * A milestone, said once in the middle of the screen: a ring that draws a
 * tick, a short burst of paper, what finished and the obvious next step. It
 * never blocks the page (only the card takes the pointer), leaves by itself,
 * and holds while pointed at or focused. Escape closes it. Reduced motion gets
 * the card and the tick without the burst.
 */
export function Celebration({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss)
  const [held, setHeld] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const remaining = useRef(DURATION)

  useEffect(() => {
    if (held || leaving) return
    const startedAt = Date.now()
    const timer = window.setTimeout(() => setLeaving(true), remaining.current)
    return () => {
      window.clearTimeout(timer)
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt))
    }
  }, [held, leaving])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => dismiss(toast.id), LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [leaving, dismiss, toast.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setLeaving(true) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const close = () => setLeaving(true)

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center p-4" aria-live="polite">
      <div
        role="status"
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
        className={`celebrate-card pointer-events-auto relative w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-[#e2e8f0] bg-white px-6 pt-7 pb-5 text-center shadow-[0_24px_60px_-20px_rgba(23,59,89,0.45),0_0_0_6px_rgba(45,113,158,0.06)] transition-[opacity,scale] duration-200 ${leaving ? 'scale-95 opacity-0' : ''}`}
      >
        <button type="button" onClick={close} aria-label="Đóng thông báo" className="absolute top-3 right-3 grid size-7 place-items-center rounded-lg text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">
          <X size={15} aria-hidden="true" />
        </button>

        <div className="relative mx-auto grid size-20 place-items-center" aria-hidden="true">
          {PIECES.map((piece, index) => <span key={index} className="celebrate-piece" style={piece.style} />)}
          <span className="celebrate-ring absolute inset-0 rounded-full bg-[#2d719e]/15" />
          <svg viewBox="0 0 80 80" className="relative size-20">
            <circle cx="40" cy="40" r="36" fill="#eef6fc" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="#2d719e" strokeWidth="4" strokeLinecap="round" transform="rotate(-90 40 40)" className="celebrate-draw" style={{ '--len': 214 } as CSSProperties} />
            <path d="M26 41.5 36 51l19-21" fill="none" stroke="#2d719e" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="celebrate-draw celebrate-draw-late" style={{ '--len': 44 } as CSSProperties} />
          </svg>
        </div>

        <p className="mt-4 text-[17px] leading-6 font-bold tracking-[-0.01em] text-[#0f172a]">{toast.title}</p>
        {toast.detail && <p className="mt-1.5 text-[13px] leading-5 text-[#64748b]">{toast.detail}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {toast.action && (
            <Link to={toast.action.to} onClick={close} className="inline-flex min-h-9 items-center rounded-xl bg-[#2d719e] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#245e84] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2">
              {toast.action.label}
            </Link>
          )}
          <button type="button" onClick={close} className="inline-flex min-h-9 items-center rounded-xl border border-[#d9e9f5] bg-white px-4 text-[13px] font-semibold text-[#285c7d] transition-colors hover:bg-[#f1f8fe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">
            Đóng
          </button>
        </div>

        <span
          aria-hidden="true"
          className="console-toast-bar absolute bottom-0 left-0 h-[3px] w-full bg-[#2d719e]"
          style={{ animationDuration: `${DURATION}ms`, animationPlayState: held || leaving ? 'paused' : 'running' }}
        />
      </div>
    </div>
  )
}
