import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { MessageCircle } from 'lucide-react'
import { prefersReducedMotion } from '../landing-motion'
import type { PartGroupId } from '../robot-explode/parts'
import { ViewerBoundary } from '../robot-explode/ViewerBoundary'

// three.js and the robot model load only once section 04 comes near the screen.
const RobotExplodeViewer = lazy(() => import('../robot-explode/RobotExplodeViewer'))

const NO_PARTS: readonly PartGroupId[] = []

function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/* Pieces of the "Hành trình" motion layer on the public Home page. Each one
   renders its finished, readable state first; motion is added on top only
   when the visitor has not asked for reduced motion. */

/** Route through the three stops drawn on `journey-smartbus.png`, in the picture's 1600×900 space. */
export const JOURNEY_ROUTE = 'M496 600 C 590 585 650 520 700 470 S 790 330 744 252 C 820 300 930 420 1048 452'

const JOURNEY_STOPS = [
  { x: 496, y: 600, label: 'Đăng ký đoàn', lx: 532, ly: 618, w: 186 },
  { x: 744, y: 252, label: 'Phòng chờ', lx: 786, ly: 198, w: 152 },
  { x: 1048, y: 452, label: 'Xem trực tiếp', lx: 1090, ly: 470, w: 190 },
] as const

/** Highlighted route, numbered stops and the robot marker laid over the journey illustration. */
export function JourneyRouteOverlay() {
  return (
    <svg className="lp3-route" viewBox="0 0 1600 900" aria-hidden="true" focusable="false">
      <path className="lp3-route__line" d={JOURNEY_ROUTE} />
      {JOURNEY_STOPS.map((stop, index) => (
        <g className="lp3-route__stop" key={stop.label}>
          <circle className="lp3-route__ring" cx={stop.x} cy={stop.y} r="28" />
          <circle className="lp3-route__core" cx={stop.x} cy={stop.y} r="26" />
          <text className="lp3-route__num" x={stop.x} y={stop.y + 1}>{index + 1}</text>
          <g className="lp3-route__label">
            <rect x={stop.lx} y={stop.ly} width={stop.w} height="46" rx="12" />
            <text x={stop.lx + 18} y={stop.ly + 24}>{stop.label}</text>
          </g>
        </g>
      ))}
      <circle className="lp3-route__bot" cx={JOURNEY_STOPS[0].x} cy={JOURNEY_STOPS[0].y} r="15" />
    </svg>
  )
}

const AI_QUESTION = 'Thư viện có những không gian học tập nào?'
const AI_ANSWER = 'Thư viện có khu đọc yên tĩnh và phòng học nhóm. Bạn muốn xem khu nào trước?'

/**
 * The AI panel in the illustrated student view. Once it scrolls into view the
 * assistant "types" its answer, waits, and starts again. The animated text is
 * hidden from assistive technology; the finished answer is what it reads.
 */
export function AiPreview() {
  const ref = useRef<HTMLDivElement>(null)
  const [reduced] = useState(prefersReducedMotion)
  const [shown, setShown] = useState(reduced ? AI_ANSWER.length : 0)
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    if (reduced) return
    const node = ref.current
    if (!node) return
    let timer = 0
    const later = (fn: () => void, ms: number) => { timer = window.setTimeout(fn, ms) }
    const run = () => {
      setShown(0)
      setTyping(true)
      later(() => {
        setTyping(false)
        let count = 0
        const tick = () => {
          count += 1
          setShown(count)
          later(count < AI_ANSWER.length ? tick : run, count < AI_ANSWER.length ? 24 : 4200)
        }
        tick()
      }, 1300)
    }
    if (typeof IntersectionObserver === 'undefined') {
      later(run, 0)
      return () => window.clearTimeout(timer)
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      observer.disconnect()
      run()
    }, { threshold: 0.4 })
    observer.observe(node)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [reduced])

  return (
    <div className="lp3-ai-preview" ref={ref}>
      <div className="lp3-panel-title"><MessageCircle size={16} /> Trợ lý AI của bạn</div>
      <p>{AI_QUESTION}</p>
      <div className="lp3-ai-answer">
        <span className="sr-only">{AI_ANSWER}</span>
        <span aria-hidden="true">
          {typing ? <span className="lp3-ai-typing"><i /><i /><i /></span> : AI_ANSWER.slice(0, shown)}
        </span>
      </div>
      <span>Đặt câu hỏi về điểm dừng hiện tại...</span>
    </div>
  )
}

/** A small live-looking status that steps through example values. Decorative. */
export function CyclingStatus({ values, interval = 2800 }: { values: readonly string[]; interval?: number }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (values.length < 2 || prefersReducedMotion()) return
    const id = window.setInterval(() => setIndex((current) => (current + 1) % values.length), interval)
    return () => window.clearInterval(id)
  }, [values, interval])
  return (
    <span className="lp3-twin-status" aria-hidden="true">
      <i />
      <span key={index}>{values[index]}</span>
    </span>
  )
}

export type TechItem = {
  icon: LucideIcon
  title: string
  body: string
  /** Parts of the 3D robot this item lights up when the visitor points at it. */
  parts?: readonly PartGroupId[]
}

/**
 * Section 04: the robot from its SolidWorks assembly, taken apart and put back
 * together in 3D, beside the list of technologies. Pointing at a list item
 * lights up its parts. Until the model has loaded a quiet placeholder holds
 * its place (no picture: the old illustration showed a different robot).
 */
export function TechShowcase({ items }: { items: readonly TechItem[] }) {
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState<number | null>(null)
  const [mode, setMode] = useState<'waiting' | '3d' | 'none'>('waiting')
  const [visible, setVisible] = useState(false)
  const artRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = artRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      const near = Boolean(entry?.isIntersecting)
      setVisible(near)
      if (near) setMode(current => (current !== 'waiting' ? current : canUseWebGL() ? '3d' : 'none'))
    }, { rootMargin: '240px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const placeholder = (text: string, busy: boolean) => (
    <div className="lp3-tech-wait" role="status">
      {busy && <span className="lp3-tech-wait__ring" aria-hidden="true" />}
      <p>{text}</p>
    </div>
  )
  const focus = (focused === null ? undefined : items[focused]?.parts) ?? NO_PARTS

  return (
    <div className="lp3-tech-grid">
      <div className="lp3-tech-art" data-mode="3d" ref={artRef} data-reveal data-reveal-media>
        {mode === '3d' ? (
          <ViewerBoundary fallback={placeholder('Không tải được mô hình 3D.', false)}>
            <Suspense fallback={placeholder('Đang tải mô hình 3D…', true)}>
              <RobotExplodeViewer focus={focus} visible={visible} />
            </Suspense>
          </ViewerBoundary>
        ) : placeholder(mode === 'none' ? 'Trình duyệt này không hiển thị được mô hình 3D.' : 'Đang tải mô hình 3D…', mode === 'waiting')}
      </div>
      <div className="lp3-tech-list">
        {items.map((item, index) => (
          <div
            className="lp3-tech-item"
            key={item.title}
            data-active={active === index}
            data-reveal
            onMouseEnter={() => { setActive(index); setFocused(index) }}
            onMouseLeave={() => setFocused(null)}
          >
            <span className="lp3-tech-number">0{index + 1}</span>
            <item.icon size={23} strokeWidth={1.7} aria-hidden="true" />
            <div><h3>{item.title}</h3><p>{item.body}</p></div>
          </div>
        ))}
      </div>
    </div>
  )
}
