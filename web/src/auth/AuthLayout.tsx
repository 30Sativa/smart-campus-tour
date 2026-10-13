import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { Link, Outlet } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import '../features/landing/landing.css'
import './auth.css'

const CAPTION = {
  title: 'Khám phá khuôn viên từ một điểm chạm.',
  lead: 'Cùng SmartBus bắt đầu hành trình tham quan campus theo một cách mới.',
} as const

/** Furthest the card leans toward the pointer, in degrees. */
const MAX_TILT = 4

/**
 * Pointer effects for the glass card, driven by CSS custom properties so React
 * never re-renders on mouse movement:
 * - `--auth-rx/--auth-ry` on the card: a small 3D lean toward the pointer.
 * - `--auth-bx/--auth-by` on the submit button: it drifts toward the pointer.
 * - `--auth-px/--auth-py` + `data-ripple` on the button: the press ripple.
 * Lean and drift are skipped on touch screens and for reduced motion.
 */
function useAuroraPointer(rootRef: RefObject<HTMLElement | null>, cardRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    const card = cardRef.current
    if (!root || !card) return

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const fine = window.matchMedia?.('(pointer: fine)').matches ?? false
    const move = fine && !reduce
    let frame = 0
    let last: PointerEvent | null = null

    const submit = () => card.querySelector<HTMLButtonElement>('.auth-submit')
    const clamp = (value: number) => Math.max(-MAX_TILT, Math.min(MAX_TILT, value))

    const resetButton = () => {
      const button = submit()
      button?.style.removeProperty('--auth-bx')
      button?.style.removeProperty('--auth-by')
    }

    const apply = () => {
      frame = 0
      const event = last
      if (!event) return
      const box = card.getBoundingClientRect()
      const x = event.clientX - box.left
      const y = event.clientY - box.top
      if (!move) return

      card.style.setProperty('--auth-ry', `${clamp((x / box.width - 0.5) * MAX_TILT * 1.6).toFixed(2)}deg`)
      card.style.setProperty('--auth-rx', `${clamp(-(y / box.height - 0.5) * MAX_TILT * 1.6).toFixed(2)}deg`)

      const button = submit()
      if (!button || button.disabled) return resetButton()
      const b = button.getBoundingClientRect()
      const near = event.clientX > b.left - 28 && event.clientX < b.right + 28 && event.clientY > b.top - 22 && event.clientY < b.bottom + 22
      if (!near) return resetButton()
      button.style.setProperty('--auth-bx', `${((event.clientX - (b.left + b.width / 2)) * 0.05).toFixed(1)}px`)
      button.style.setProperty('--auth-by', `${((event.clientY - (b.top + b.height / 2)) * 0.22).toFixed(1)}px`)
    }

    const onMove = (event: PointerEvent) => {
      last = event
      if (!frame) frame = requestAnimationFrame(apply)
    }

    const onLeave = () => {
      last = null
      card.style.setProperty('--auth-rx', '0deg')
      card.style.setProperty('--auth-ry', '0deg')
      resetButton()
    }

    const onDown = (event: PointerEvent) => {
      const button = (event.target as Element | null)?.closest?.<HTMLButtonElement>('.auth-submit')
      if (!button || button.disabled) return
      const b = button.getBoundingClientRect()
      button.style.setProperty('--auth-px', `${event.clientX - b.left}px`)
      button.style.setProperty('--auth-py', `${event.clientY - b.top}px`)
      // Re-adding the attribute restarts the CSS ripple on every press.
      button.removeAttribute('data-ripple')
      void button.offsetWidth
      button.setAttribute('data-ripple', '')
    }

    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerleave', onLeave)
    root.addEventListener('pointerdown', onDown)
    return () => {
      cancelAnimationFrame(frame)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('pointerdown', onDown)
    }
  }, [rootRef, cardRef])
}

/**
 * The sign-in shell: "Aurora Glass".
 *
 * A campus photograph fills the screen (SmartBus by day, the lit tour path at
 * dusk in dark mode) under a soft aurora of drifting colour fields; the form
 * sits on one frosted-glass card in the middle. Everything behind the card is decorative,
 * `aria-hidden` and holds nothing focusable.
 *
 * The root carries `.lp`, which is where the palette, the font and the
 * light/dark switch come from.
 */
export function AuthLayout() {
  const rootRef = useRef<HTMLElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  useAuroraPointer(rootRef, cardRef)

  return (
    <main ref={rootRef} className="lp auth" data-page="login">
      <div className="auth-aurora" aria-hidden="true">
        <span className="auth-aurora__photo" />
        <span className="auth-aurora__blob auth-aurora__blob--1" />
        <span className="auth-aurora__blob auth-aurora__blob--2" />
        <span className="auth-aurora__blob auth-aurora__blob--3" />
      </div>

      <section className="auth-caption" aria-hidden="true">
        <p className="auth-caption__eyebrow">CAMPUS TOUR <span /> SMARTBUS</p>
        <p className="auth-caption__title">{CAPTION.title}</p>
        <p className="auth-caption__lead">{CAPTION.lead}</p>
      </section>

      <div className="auth-stage">
        <div ref={cardRef} className="auth-card">
          <div className="auth-col">
            <Link to="/" className="auth-brand">
              <img className="auth-brand__mark" src="/images/logo.png" alt="" width={40} height={40} />
              <span>CampusTour</span>
              <span className="auth-brand__sub">DT-AMR</span>
            </Link>
            <div className="auth-body">
              <Outlet />
            </div>
            <div className="auth-meta">
              <Link to="/" className="auth-back">
                <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
                Về trang chủ
              </Link>
              <p className="auth-footer">© {new Date().getFullYear()} Smart Campus Tour</p>
            </div>
          </div>
        </div>
      </div>

      {/* Business fixtures remain visible during development; sign-in itself
          uses the backend. */}
      {import.meta.env.DEV && (
        <details className="auth-devbadge" data-dev-only="true">
          <summary>Dữ liệu nghiệp vụ mẫu</summary>
          <p>DEV: các màn nghiệp vụ chưa nối backend vẫn dùng dữ liệu mẫu.</p>
        </details>
      )}
    </main>
  )
}
