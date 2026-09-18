import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { railItems } from '../landing-content'
import { prefersReducedMotion } from '../landing-motion'

/**
 * Continuous movement speed in CSS pixels per second.
 *
 * A card is ~300px wide, so this brings the next one fully into view in about
 * seven seconds: slow enough to read a card while it drifts, fast enough that
 * the rail is visibly moving rather than looking broken.
 */
const AUTOPLAY_SPEED = 44

/**
 * Native scroll-snap rail with a gentle autoplay.
 *
 * The track is a real scroll container, so touch swipe, trackpad and keyboard
 * all work without a carousel library. Autoplay drifts left through the cards
 * and restarts at the beginning after the last one.
 *
 * The drift position is accumulated in `offsetRef` and assigned, rather than
 * added onto `scrollLeft` each frame. That is not a style choice: the browser
 * stores `scrollLeft` rounded to whole pixels, so `scrollLeft += 0.47` read the
 * rounded value back, added less than a pixel, and rounded to the same number
 * again. The rail crawled a few pixels while frames were still settling and
 * then sat still for good, which looked exactly like autoplay never having been
 * implemented.
 *
 * It pauses while the pointer is over the rail itself, while focus is inside
 * the section, while a finger is down and while the tab is hidden, and it never
 * starts at all under prefers-reduced-motion. Pause is deliberately NOT bound
 * to the whole section: the heading and the arrows sit in the same band, so
 * hovering them - which is what you do on the way to reading the cards - froze
 * the rail with nothing to say why.
 */
export function RobotRail() {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)
  const animationRef = useRef<number | null>(null)
  /** Sub-pixel drift position, in CSS pixels. See the note above. */
  const offsetRef = useRef(0)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const syncEdges = useCallback(() => {
    const node = scrollerRef.current
    if (!node) return
    // A swipe, an arrow press or a keyboard scroll moves the rail out from
    // under the accumulator; adopt the real position so the drift carries on
    // from where the reader left it instead of snapping back.
    if (Math.abs(node.scrollLeft - offsetRef.current) > 2) offsetRef.current = node.scrollLeft
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

    offsetRef.current = scrollerRef.current?.scrollLeft ?? 0

    let previousTime = 0
    const animate = (time: number) => {
      const node = scrollerRef.current
      if (node && !pausedRef.current && !document.hidden) {
        const max = node.scrollWidth - node.clientWidth
        if (max > 4) {
          const elapsed = previousTime ? Math.min(time - previousTime, 50) : 0
          const next = offsetRef.current + (AUTOPLAY_SPEED * elapsed) / 1000
          offsetRef.current = next >= max ? 0 : next
          node.scrollLeft = offsetRef.current
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

  const pause = () => {
    pausedRef.current = true
  }
  const resume = () => {
    pausedRef.current = false
  }

  return (
    <section className="lp-sec" id="robot" onFocusCapture={pause} onBlurCapture={resume}>
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
        onMouseEnter={pause}
        onMouseLeave={resume}
        onTouchStart={pause}
        onTouchEnd={resume}
        onTouchCancel={resume}
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
