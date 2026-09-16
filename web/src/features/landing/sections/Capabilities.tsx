import { useRef, useState } from 'react'
import { capabilities } from '../landing-content'

/**
 * Sticky media against a disclosure list. Selecting an item opens its
 * description and crossfades the matching shot, which is the feedback the
 * animation exists for. Hover selects too, but keyboard and click are the
 * source of truth, so the section works without a pointer.
 */
export function Capabilities() {
  const [active, setActive] = useState(0)
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([])

  const focusItem = (index: number) => {
    const next = (index + capabilities.length) % capabilities.length
    setActive(next)
    buttonsRef.current[next]?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      focusItem(index + 1)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      focusItem(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusItem(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusItem(capabilities.length - 1)
    }
  }

  return (
    <section className="lp-sec lp-ctn" id="tinh-nang">
      <div className="lp-cap__head">
        <h2 className="lp-h2" data-reveal>
          Năm phần việc, một hệ thống
        </h2>
        <p className="lp-body" data-reveal style={{ marginTop: 18 }}>
          Từ lúc khách bấm đặt lịch tới lúc đội vận hành đóng ca, mọi khâu chạy trên cùng một nền tảng.
        </p>
      </div>

      <div className="lp-cap__grid">
        <div className="lp-cap__media" data-reveal>
          {capabilities.map((item, index) => (
            <div
              className="lp-cap__shot"
              key={item.id}
              data-on={index === active}
              aria-hidden={index !== active}
            >
              <img src={item.image} alt={item.alt} loading="lazy" decoding="async" />
            </div>
          ))}
        </div>

        <div className="lp-cap__list" data-reveal>
          {capabilities.map((item, index) => (
            <button
              type="button"
              key={item.id}
              ref={(node) => {
                buttonsRef.current[index] = node
              }}
              className="lp-cap__tab"
              data-on={index === active}
              aria-expanded={index === active}
              aria-controls={`cap-desc-${item.id}`}
              onClick={() => setActive(index)}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className="lp-cap__name">{item.name}</span>
              <span className="lp-cap__desc" id={`cap-desc-${item.id}`}>
                <span>
                  <span>{item.desc}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
