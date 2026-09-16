import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { railItems } from '../landing-content'

/**
 * Native scroll-snap rail. Touch and trackpad drive it directly, the arrows are
 * there for mouse and keyboard, and nothing advances on its own, so the section
 * never moves under a reader who is still on the first card.
 */
export function RobotRail() {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const syncEdges = useCallback(() => {
    const node = scrollerRef.current
    if (!node) return
    setAtStart(node.scrollLeft <= 4)
    setAtEnd(node.scrollLeft + node.clientWidth >= node.scrollWidth - 4)
  }, [])

  useEffect(() => {
    syncEdges()
  }, [syncEdges])

  const scrollByCard = (direction: 1 | -1) => {
    const node = scrollerRef.current
    if (!node) return
    const card = node.querySelector<HTMLElement>('.lp-rail__card')
    const step = card ? card.offsetWidth + 16 : node.clientWidth * 0.8
    node.scrollBy({ left: step * direction, behavior: 'smooth' })
  }

  return (
    <section className="lp-sec" id="robot">
      <div className="lp-ctn">
        <div className="lp-rail__head">
          <div>
            <h2 className="lp-h2" data-reveal>
              Công nghệ trong từng bước đi
            </h2>
            <p className="lp-body" data-reveal style={{ marginTop: 18 }}>
              Năm khối kỹ thuật chạy song song trong mỗi chuyến tour.
            </p>
          </div>
          <div className="lp-rail__nav">
            <button
              type="button"
              className="lp-icobtn"
              onClick={() => scrollByCard(-1)}
              disabled={atStart}
              aria-label="Xem khối kỹ thuật trước"
            >
              <ChevronLeft size={18} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="lp-icobtn"
              onClick={() => scrollByCard(1)}
              disabled={atEnd}
              aria-label="Xem khối kỹ thuật tiếp theo"
            >
              <ChevronRight size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>

      <div className="lp-rail__scroller" ref={scrollerRef} onScroll={syncEdges} tabIndex={0} aria-label="Các khối kỹ thuật">
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
