import { useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { Link } from 'react-router'
import { useToastStore, type Toast, type ToastTone } from './toast-store'

const DURATION: Record<ToastTone, number> = { success: 5000, info: 5000, error: 8000 }
const LEAVE_MS = 200

const TONE: Record<ToastTone, { icon: typeof Info; dot: string; bar: string }> = {
  success: { icon: CircleCheck, dot: 'bg-[#1f7a55]', bar: 'bg-[#1f7a55]' },
  info: { icon: Info, dot: 'bg-[#2d719e]', bar: 'bg-[#2d719e]' },
  error: { icon: CircleAlert, dot: 'bg-[#b23e31]', bar: 'bg-[#b23e31]' },
}

/**
 * The notification stack, bottom right (above the phone menu button below
 * `lg`). Each card says what finished and leaves after five seconds (errors
 * stay eight); pointing at it or focusing it holds it, and the bar along its
 * foot shows the time left.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  return (
    <section aria-label="Thông báo" className="pointer-events-none fixed right-4 bottom-20 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 lg:right-5 lg:bottom-5">
      {toasts.map((toast) => <ToastCard key={toast.id} toast={toast} />)}
    </section>
  )
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss)
  const [held, setHeld] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const remaining = useRef(DURATION[toast.tone])

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

  const { icon: Icon, dot, bar } = TONE[toast.tone]
  const close = () => setLeaving(true)

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className={`pointer-events-auto relative flex items-start gap-2.5 overflow-hidden rounded-xl border border-[#e2e8f0] bg-white px-3 pt-2.5 pb-3 shadow-[0_14px_34px_-14px_rgba(15,23,42,0.35)] transition-[opacity,translate,scale] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] starting:translate-y-2.5 starting:scale-[0.98] starting:opacity-0 motion-reduce:transition-none ${leaving ? 'translate-x-4 opacity-0 duration-200' : ''}`}
    >
      <span aria-hidden="true" className={`mt-px grid size-6 shrink-0 place-items-center rounded-full text-white ${dot}`}><Icon size={15} strokeWidth={2.2} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-5 font-semibold text-[#0f172a]">{toast.title}</p>
        {toast.detail && <p className="mt-px text-xs leading-[1.45] text-[#64748b]">{toast.detail}</p>}
        {toast.action && (
          <Link to={toast.action.to} onClick={close} className="mt-1.5 inline-block rounded text-xs font-semibold text-[#2d719e] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">
            {toast.action.label}
          </Link>
        )}
      </div>
      <button type="button" onClick={close} aria-label="Đóng thông báo" className="grid size-6 shrink-0 place-items-center rounded-md text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">
        <X size={14} aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className={`console-toast-bar absolute bottom-0 left-0 h-[3px] w-full ${bar}`}
        style={{ animationDuration: `${DURATION[toast.tone]}ms`, animationPlayState: held || leaving ? 'paused' : 'running' }}
      />
    </div>
  )
}
