import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { railItems } from '../landing-content'
import { prefersReducedMotion } from '../landing-motion'

/** One slide every 4.5s: long enough to read a card, short enough to notice. */
const AUTOPLAY_MS = 4500

/**
 * Native scroll-snap rail with a gentle autoplay.
 *
 * The track is a real scroll container, so touch swipe, trackpad and keyboard
 * all work without a carousel library. Autoplay ping-pongs between the ends
 * rather than rewinding, which avoids the long sweep back that a looping
 * carousel shows when it wraps. It pauses while the pointer is over the
 * section, while focus is inside it, while a finger is down and while the tab
 * is hidden, and it never starts at all under prefers-reduced-motion.
 */
export function RobotRail() {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)
  const directionRef = useRef<1 | -1>(1)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const syncEdges = useCallback(() => {
    const node = scrollerRef.current
    if (!node) return
    setAtStart(node.scrollLeft <= 4)
    setAtEnd(node.scrollLeft + node.clientWidth >= node.scrollWidth - 4)
  }, [])

  const scrollByCard = useCallback((direction: 1 | -1) => {
    const node = scrollerRef.current
    if (!node) return
    const card = node.querySelector<HTMLElement>('.lp-rail__card')
    const gap = parseFloat(getComputedStyle(node).columnGap) || 16
    const amount = card ? card.offsetWidth + gap : node.clientWidth * 0.8
    node.scrollBy({
      left: amount * direction,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [])

  useEffect(() => {
    syncEdges()
    if (prefersReducedMotion()) return

    const id = window.setInterval(() => {
      const node = scrollerRef.current
      if (!node || pausedRef.current || document.hidden) return
      const max = node.scrollWidth - node.clientWidth
      if (max <= 4) return

      if (directionRef.current === 1 && node.scrollLeft >= max - 4) directionRef.current = -1
      else if (directionRef.current === -1 && node.scrollLeft <= 4) directionRef.current = 1

      scrollByCard(directionRef.current)
    }, AUTOPLAY_MS)

    return () => window.clearInterval(id)
  }, [scrollByCard, syncEdges])

  /** A manual move sets the direction autoplay continues in. */
  const step = (direction: 1 | -1) => {
    directionRef.current = direction
    scrollByCard(direction)
  }

  const pause = () => {
    pausedRef.current = true
  }
  const resume = () => {
    pausedRef.current = false
  }

  return (
    <section
      className="lp-sec"
      id="robot"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
      onTouchStart={pause}
      onTouchEnd={resume}
      onTouchCancel={resume}
    >
      <div className="lp-ctn">
        <div className="lp-rail__head">
          <div>
            <h2 className="lp-h2" data-reveal>
              Công nghệ trong từng bước đi
            </h2>
            <p className="lp-body" data-reveal>
              Năm khối kỹ thuật chạy song song trong mỗi chuyến tour.
            </p>
          </div>
          <div className="lp-rail__nav">
            <button
              type="button"
              className="lp-icobtn"
              onClick={() => step(-1)}
              disabled={atStart}
              aria-label="Xem khối kỹ thuật trước"
            >
              <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="lp-icobtn"
              onClick={() => step(1)}
              disabled={atEnd}
              aria-label="Xem khối kỹ thuật tiếp theo"
            >
              <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div
        className="lp-rail__scroller"
        ref={scrollerRef}
        onScroll={syncEdges}
        tabIndex={0}
        aria-label="Các khối kỹ thuật"
      >
        {railItems.map((item) => (
          <article className="lp-rail__card" key={item.id}>
            <img src={item.image} alt={item.alt} loading="lazy" decoding="async" />
            <h3 className="lp-rail__title">{item.title}</h3>
            <p className="lp-rail__body">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
