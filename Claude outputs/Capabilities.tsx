import { useRef, useState } from 'react'
import { capabilities } from '../landing-content'

/**
 * Sticky media against a disclosure list.
 *
 * Selecting an item opens its description and crossfades the matching shot,
 * which is the only reason the animation exists. Hover selects as well, but
 * click and keyboard are the source of truth, so the section works without a
 * pointer. On phones the media sticks under the header while the list scrolls,
 * otherwise tapping an item would change a picture that has left the screen.
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
          Một hệ thống quản lý toàn bộ hành trình
        </h2>
        <p className="lp-body" data-reveal>
          Từ lúc khách bấm đặt tour tới lúc đội vận hành đóng ca, năm phần việc chạy trên
          cùng một nền tảng.
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
              <span className="lp-cap__num" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="lp-cap__body">
                <span className="lp-cap__name">{item.name}</span>
                <span className="lp-cap__desc" id={`cap-desc-${item.id}`}>
                  <span>
                    <span>{item.desc}</span>
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
