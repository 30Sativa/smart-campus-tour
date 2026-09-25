import { useEffect, useRef, useState } from 'react'
import { services } from '../home-content'
import { PlusIcon, SplitText } from '../primitives'

const canHover = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (min-width: 901px)').matches

/**
 * Numbered list, one row open at a time. Desktop opens a row on hover; touch
 * opens and closes it on tap. Every row is a real button for keyboard users.
 */
export function HomeServices() {
  const [open, setOpen] = useState<string | null>(services[0]?.id ?? null)
  // Hover intent: a pointer crossing a row on its way elsewhere does not open it.
  const hoverTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])

  return (
    <section className="hm-services" id="trai-nghiem">
      <div className="hm-ctn">
        <div className="hm-sechead">
          <SplitText className="hm-sechead__title" text="Trải nghiệm" />
          <span className="hm-sechead__count hm-fade">({String(services.length).padStart(2, '0')})</span>
        </div>
        <div className="hm-divider" />
        {services.map((s, i) => {
          const isOpen = open === s.id
          return (
            <article
              key={s.id}
              className="hm-svc"
              data-open={isOpen}
              onMouseEnter={() => {
                if (!canHover()) return
                window.clearTimeout(hoverTimer.current)
                hoverTimer.current = window.setTimeout(() => setOpen(s.id), 160)
              }}
              onMouseLeave={() => window.clearTimeout(hoverTimer.current)}
            >
              <h3 className="hm-svc__head">
                <button
                  type="button"
                  className="hm-svc__row"
                  aria-expanded={isOpen}
                  aria-controls={`svc-${s.id}`}
                  onClick={() => {
                    window.clearTimeout(hoverTimer.current)
                    setOpen(isOpen && !canHover() ? null : s.id)
                  }}
                >
                  <span className="hm-svc__num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="hm-svc__title">{s.title}</span>
                  <span className="hm-svc__plus" aria-hidden="true"><PlusIcon /></span>
                </button>
              </h3>
              <div className="hm-svc__body" id={`svc-${s.id}`}>
                <div>
                  <div className="hm-svc__inner">
                    <span className="hm-svc__sp" />
                    <div className="hm-svc__txt">
                      <p>{s.body}</p>
                      <ul>{s.tags.map((t) => <li key={t}>{t}</li>)}</ul>
                    </div>
                    <div className="hm-svc__img">
                      <img src={s.image} alt={s.alt} loading="lazy" decoding="async" />
                    </div>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
