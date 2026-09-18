import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { railItems } from '../landing-content'
import { prefersReducedMotion } from '../landing-motion'

/** Continuous movement speed in CSS pixels per second. */
const AUTOPLAY_SPEED = 28

/**
 * Native scroll-snap rail with a gentle autoplay.
 *
 * The track is a real scroll container, so touch swipe, trackpad and keyboard
 * all work without a carousel library. Autoplay advances left through the
 * cards and restarts at the beginning after the last card. It continues while
 * the rail is hovered or focused so the content never gets stuck.
 */
export function RobotRail() {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
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

    let previousTime = 0
    const animate = (time: number) => {
      const node = scrollerRef.current
      if (node && !document.hidden) {
        const max = node.scrollWidth - node.clientWidth
        if (max > 4) {
          const elapsed = previousTime ? Math.min(time - previousTime, 50) : 0
          if (node.scrollLeft >= max - 1) node.scrollTo({ left: 0, behavior: 'auto' })
          else node.scrollLeft += (AUTOPLAY_SPEED * elapsed) / 1000
        }
      }

      previousTime = time
      animationRef.current = window.requestAnimationFrame(animate)
    }

    animationRef.current = window.requestAnimationFrame(animate)
    return () => {
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current)
    }
  }, [syncEdges])

  const step = (direction: 1 | -1) => {
    scrollByCard(direction)
  }

  return (
    <section
      className="lp-sec"
      id="robot"
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
        data-auto="true"
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
